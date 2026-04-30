import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom, Observable, Subject } from 'rxjs';
import { Space, Subsuelo } from '../models/autolavado.model';
import { ClientsApiService } from './api/clients-api.service';
import { SpacesApiService } from './api/spaces-api.service';
import { ToastService } from './toast.service';
import { environment } from '../../environments/environment';

type OfflineSyncOperationType =
  | 'createSubsuelo'
  | 'createSpace'
  | 'updateSubsuelo'
  | 'deleteSpace'
  | 'deleteSubsuelo'
  | 'updateSpace'
  | 'transferSpace'
  | 'reserveClient';

interface OfflineSyncOperationMap {
  createSubsuelo: { subsuelo: Subsuelo };
  createSpace: { space: Space };
  updateSubsuelo: { subsuelo: Subsuelo };
  deleteSpace: { spaceKey: string };
  deleteSubsuelo: { subsueloId: string };
  updateSpace: { space: Space };
  transferSpace: { spaceKey: string; newSubsueloId: string };
  reserveClient: { spaceKey: string; payload: any; existingClientId?: number };
}

export interface OfflineSyncOperation<T extends OfflineSyncOperationType = OfflineSyncOperationType> {
  id: string;
  type: T;
  payload: OfflineSyncOperationMap[T];
  createdAt: number;
  attempts: number;
  lastError?: string;
}

const MAX_ATTEMPTS = 3;
const QUEUE_STORAGE_KEY = 'alw_offline_sync_queue';
const DEAD_LETTER_STORAGE_KEY = 'alw_offline_sync_dead';
const RECONNECT_POLL_MS = 7000;

@Injectable({
  providedIn: 'root'
})
export class OfflineSyncService {
  private readonly backendUrl = environment.backendUrl;
  private queue: OfflineSyncOperation[] = [];
  private deadLetter: OfflineSyncOperation[] = [];
  private isProcessing = false;
  private lastOnlineState = this.getNavigatorOnlineState();
  private hasShownOfflineToast = false;
  private reconnectPollId: ReturnType<typeof setInterval> | null = null;

  readonly syncCompleted$ = new Subject<void>();
  readonly isOnline$ = new BehaviorSubject<boolean>(this.lastOnlineState);
  readonly pendingCount$ = new BehaviorSubject<number>(0);
  readonly isSyncing$ = new BehaviorSubject<boolean>(false);
  readonly deadLetterCount$ = new BehaviorSubject<number>(0);

  constructor(
    private clientsApi: ClientsApiService,
    private spacesApi: SpacesApiService,
    private toastService: ToastService
  ) {
    this.queue = this.readStorage(QUEUE_STORAGE_KEY);
    this.deadLetter = this.readStorage(DEAD_LETTER_STORAGE_KEY);
    this.pendingCount$.next(this.queue.length);
    this.deadLetterCount$.next(this.deadLetter.length);
    this.registerConnectivityListeners();

    if (this.isOnline() && this.queue.length > 0) {
      void this.flushQueue();
    }
  }

  enqueue<T extends OfflineSyncOperationType>(type: T, payload: OfflineSyncOperationMap[T]): void {
    this.queue.push({
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      createdAt: Date.now(),
      attempts: 0
    });

    this.persistQueue();

    if (!this.isOnline()) {
      if (!this.hasShownOfflineToast) {
        this.toastService.showWarning('Sin conexion con el servidor. Los cambios quedaran pendientes de sincronizacion.');
        this.hasShownOfflineToast = true;
      }
      return;
    }

    void this.flushQueue();
  }

  hasPendingOperations(): boolean {
    return this.queue.length > 0;
  }

  getDeadLetterOperations(): OfflineSyncOperation[] {
    return [...this.deadLetter];
  }

  clearDeadLetter(): void {
    this.deadLetter = [];
    this.persistDeadLetter();
  }

  async flushQueue(): Promise<void> {
    if (this.isProcessing || !this.isOnline() || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.isSyncing$.next(true);
    let syncedCount = 0;

    try {
      while (this.queue.length > 0 && this.isOnline()) {
        const current = this.queue[0];

        try {
          await firstValueFrom(this.executeOperation(current));
          this.queue.shift();
          this.persistQueue();
          syncedCount += 1;
        } catch (error: any) {
          if (this.shouldTreatAsSynced(current, error)) {
            this.queue.shift();
            this.persistQueue();
            syncedCount += 1;
            continue;
          }

          if (this.isOfflineError(error)) {
            // Red caída — marcar offline e iniciar polling de reconexión
            this.markOffline();
            break;
          }

          current.attempts += 1;
          current.lastError = this.stringifyError(error);

          if (current.attempts >= MAX_ATTEMPTS) {
            // Agotó reintentos — mover a dead letter y continuar con la siguiente operación
            this.deadLetter.push({ ...current });
            this.persistDeadLetter();
            this.queue.shift();
            this.persistQueue();
            this.toastService.showWarning(
              `Un cambio pendiente no pudo sincronizarse tras ${MAX_ATTEMPTS} intentos y fue descartado de la cola.`
            );
            continue;
          }

          // Fallo recuperable con reintentos disponibles — preservar orden y pausar hasta próximo flush
          this.persistQueue();
          break;
        }
      }
    } finally {
      this.isProcessing = false;
      this.isSyncing$.next(false);

      if (syncedCount > 0 && this.queue.length === 0) {
        this.toastService.showSuccess('Los cambios pendientes se sincronizaron correctamente.');
        this.syncCompleted$.next();
      } else if (syncedCount > 0) {
        this.toastService.showInfo(`Se sincronizaron ${syncedCount} cambio(s), pero aun quedan pendientes.`);
      }
    }
  }

  private executeOperation(operation: OfflineSyncOperation): Observable<unknown> {
    switch (operation.type) {
      case 'createSubsuelo':
        return this.spacesApi.createSubsuelo((operation.payload as OfflineSyncOperationMap['createSubsuelo']).subsuelo);
      case 'createSpace':
        return this.spacesApi.createSpace((operation.payload as OfflineSyncOperationMap['createSpace']).space);
      case 'updateSubsuelo':
        return this.spacesApi.updateSubsuelo((operation.payload as OfflineSyncOperationMap['updateSubsuelo']).subsuelo);
      case 'deleteSpace':
        return this.spacesApi.deleteSpace((operation.payload as OfflineSyncOperationMap['deleteSpace']).spaceKey);
      case 'deleteSubsuelo':
        return this.spacesApi.deleteSubsuelo((operation.payload as OfflineSyncOperationMap['deleteSubsuelo']).subsueloId);
      case 'updateSpace':
        return this.spacesApi.updateSpace((operation.payload as OfflineSyncOperationMap['updateSpace']).space);
      case 'transferSpace':
        return this.spacesApi.transferSpace(
          (operation.payload as OfflineSyncOperationMap['transferSpace']).spaceKey,
          (operation.payload as OfflineSyncOperationMap['transferSpace']).newSubsueloId
        );
      case 'reserveClient':
        return this.clientsApi.reserveOrUpdateClient(operation.payload as OfflineSyncOperationMap['reserveClient']);
      default:
        throw new Error(`Operacion offline no soportada: ${(operation as OfflineSyncOperation).type}`);
    }
  }

  private shouldTreatAsSynced(operation: OfflineSyncOperation, error: any): boolean {
    const status = Number(error?.status || 0);

    if (operation.type === 'deleteSpace' || operation.type === 'deleteSubsuelo') {
      return status === 404;
    }

    if (operation.type === 'createSubsuelo' || operation.type === 'createSpace') {
      return status === 409;
    }

    return false;
  }

  isOfflineError(error: any): boolean {
    return Number(error?.status || 0) === 0;
  }

  private stringifyError(error: any): string {
    if (typeof error?.message === 'string' && error.message.trim()) {
      return error.message;
    }
    return 'Error desconocido';
  }

  private registerConnectivityListeners(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('online', () => {
      this.onReconnected();
    });

    window.addEventListener('offline', () => {
      this.markOffline();
    });
  }

  private markOffline(): void {
    if (!this.lastOnlineState) return;
    this.lastOnlineState = false;
    this.isOnline$.next(false);
    this.hasShownOfflineToast = false;
    this.toastService.showWarning('Conexion perdida. La app seguira trabajando con datos locales.');
    this.startReconnectPolling();
  }

  private onReconnected(): void {
    this.stopReconnectPolling();
    this.lastOnlineState = true;
    this.isOnline$.next(true);
    this.hasShownOfflineToast = false;
    if (this.queue.length > 0) {
      this.toastService.showInfo('Conexion restablecida. Sincronizando cambios pendientes...');
      void this.flushQueue();
    } else {
      this.syncCompleted$.next();
    }
  }

  private startReconnectPolling(): void {
    if (this.reconnectPollId !== null) return;
    this.reconnectPollId = setInterval(() => void this.pingBackend(), RECONNECT_POLL_MS);
  }

  private stopReconnectPolling(): void {
    if (this.reconnectPollId !== null) {
      clearInterval(this.reconnectPollId);
      this.reconnectPollId = null;
    }
  }

  private async pingBackend(): Promise<void> {
    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${this.backendUrl}/api/subsuelos`, { signal: ctrl.signal });
      clearTimeout(timeoutId);
      if (res.status > 0) {
        this.onReconnected();
      }
    } catch {
      // Sigue sin conexion — el poll continuará
    }
  }

  private isOnline(): boolean {
    return this.lastOnlineState;
  }

  private getNavigatorOnlineState(): boolean {
    if (typeof navigator === 'undefined') {
      return true;
    }
    return navigator.onLine;
  }

  private readStorage(key: string): OfflineSyncOperation[] {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private persistQueue(): void {
    this.saveToStorage(QUEUE_STORAGE_KEY, this.queue);
    this.pendingCount$.next(this.queue.length);
  }

  private persistDeadLetter(): void {
    this.saveToStorage(DEAD_LETTER_STORAGE_KEY, this.deadLetter);
    this.deadLetterCount$.next(this.deadLetter.length);
  }

  private saveToStorage(key: string, data: OfflineSyncOperation[]): void {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      this.toastService.showError('Almacenamiento local lleno. Algunos cambios offline no pudieron guardarse.');
    }
  }
}
