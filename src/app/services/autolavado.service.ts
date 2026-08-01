import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, forkJoin, Observable, of } from 'rxjs';
import { catchError, finalize, map, switchMap, tap } from 'rxjs/operators';
import { ClientVehicle, HistoricalService, Report, VehicleType } from '../models/autolavado.model';
import { environment } from '../../environments/environment';
import { ClientsApiService } from './api/clients-api.service';
import { OfflineSyncService } from './offline-sync.service';
import { ReportsApiService } from './api/reports-api.service';
import { ServiceHistoryApiService } from './api/service-history-api.service';
import { SpacesApiService } from './api/spaces-api.service';
import { StorageSyncService } from './storage-sync.service';

// Interfaces
export interface Subsuelo {
  id: string;
  label: string;
}

export interface Space {
  key: string;
  subsueloId: string;
  occupied: boolean;
  hold: boolean;
  clientId: string | null;
  //client: Client | null;
  client?: Client | null;
  startTime: number | null;
  displayName?: string;
  whatsappSent?: boolean;
}

 export interface Client {
  id: any;
  code: string;
  name: string;
  dni?: string;
  phoneIntl: string;
  phoneRaw: string;
  vehicle?: string;
  plate?: string;
  notes?: string;
  spaceKey: any;
  qrText: string;
  category?: string;  // Nueva propiedad opcional
  price?: any;
  //vehicleType?: VehicleType | null;
 // vehicleTypes?: VehicleType[];
  clientVehicles?: ClientVehicle[];
  paymentMethod?: string;  // ← NUEVO
  clover?: number | null;
  entryTimestamp?: any;
  exitTimestamp?: any;
  lastDayClosed?:any;
}





export interface ClientData {
  name: string;
  phone: string;
  vehicle?: string;
  plate?: string;
  notes?: string;
}

export interface PagedResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export interface ResetDataResult {
  offlineQueued?: boolean;
}

export interface ClientReservationsLookupResult {
  reservations: Client[];
  source: 'server' | 'local';
}





@Injectable({
  providedIn: 'root'
})
export class AutolavadoService {
  private readonly LS_KEYS = {
    subs: 'alw_subsuelos',
    spaces: 'alw_spaces',
    clients: 'alw_clients',
    currentSub: 'alw_current_sub',
    vehicleTypes: 'alw_vehicle_types'
  };

  // Subjects para estado reactivo
  public subsuelosSubject = new BehaviorSubject<Subsuelo[]>([]);
  public spacesSubject = new BehaviorSubject<{ [key: string]: Space }>({});
  public clientsSubject = new BehaviorSubject<{ [key: string]: Client }>({});
  public currentSubIdSubject = new BehaviorSubject<string | null>(null);
  public vehicleTypesSubject = new BehaviorSubject<VehicleType[]>([]);
  private searchTermSubject = new BehaviorSubject<string>('');

  private API_BASE = environment.apiUrl;

  // Observables públicos
  public subsuelos$ = this.subsuelosSubject.asObservable();
  public spaces$ = this.spacesSubject.asObservable();
  public clients$ = this.clientsSubject.asObservable();
  public currentSubId$ = this.currentSubIdSubject.asObservable();





public filteredClients$ = combineLatest([this.clients$, this.searchTermSubject, this.spaces$]).pipe(
  map(([clients, searchTerm, spaces]) => {
    const term = searchTerm.trim().toLowerCase();

    const filtered = Object.values(clients)
      .filter(client => {
        const space = spaces[client.spaceKey];
        if (!space || !space.occupied) return false;
        if (!term) return true;
        return (
          (client.name || '').toLowerCase().includes(term) ||
          (client.code || '').toLowerCase().includes(term) ||
          (client.spaceKey || '').toLowerCase().includes(term) ||
          (client.phoneIntl || '').toLowerCase().includes(term) ||
          (client.vehicle || '').toLowerCase().includes(term) ||
          (client.plate || '').toLowerCase().includes(term) ||
          (client.notes || '').toLowerCase().includes(term)
        );
      })
      .map(client => {
        const space = spaces[client.spaceKey];
        return {
          ...client,
          spaceDisplayName: space ? (space.displayName || space.key) : client.spaceKey,
          // Aseguramos price y category con fallback
          price: client.price || 35000,
          category: client.category || 'AUTO'
        };
      });

    // ← TU console.log EXACTAMENTE COMO LO TENÍAS ANTES
    console.log('Filtered Clients enriquecidos:', filtered);

    return filtered;
  })
);




public dailyClients$ = this.clients$.pipe(
  map(clientsMap => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTimestamp = todayStart.getTime();

    return Object.values(clientsMap)
      .filter(client => {
        let entry: number | null = null;

        if (client.entryTimestamp) {
          if (typeof client.entryTimestamp === 'string') {
            entry = new Date(client.entryTimestamp).getTime();
          } else if (typeof client.entryTimestamp === 'number') {
            entry = client.entryTimestamp;
          }
        }

        const isToday = entry !== null && !isNaN(entry) && entry >= todayTimestamp;
        console.log(`Cliente ${client.id} - entryTimestamp: ${client.entryTimestamp} - convertido: ${entry} - isToday: ${isToday}`);

        return isToday;
      })
      .map(client => {
        const space = this.spacesSubject.value[client.spaceKey || ''];
        let entryForElapsed = client.entryTimestamp;
        if (typeof entryForElapsed === 'string') {
          entryForElapsed = new Date(entryForElapsed).getTime();
        }

        return {
          ...client,
          spaceDisplayName: space ? (space.displayName || client.spaceKey || '-') : '-',
          isCurrentlyOccupied: space ? space.occupied : false,
          elapsedTime: entryForElapsed ? this.elapsedFrom(entryForElapsed as number) : 'N/A'
        };
      })
      .sort((a, b) => (b.entryTimestamp ? (typeof b.entryTimestamp === 'string' ? new Date(b.entryTimestamp).getTime() : b.entryTimestamp) : 0) -
                     (a.entryTimestamp ? (typeof a.entryTimestamp === 'string' ? new Date(a.entryTimestamp).getTime() : a.entryTimestamp) : 0));
  })
);


public filteredDailyClients$ = combineLatest([
  this.dailyClients$,
  this.searchTermSubject
]).pipe(
  map(([dailyClients, searchTerm]) => {
    if (!searchTerm.trim()) {
      return dailyClients;
    }

    const term = searchTerm.toLowerCase().trim();

    return dailyClients.filter(client =>
      (client.name?.toLowerCase().includes(term)) ||
      (client.code?.toLowerCase().includes(term)) ||
      (client.phoneIntl?.includes(term)) ||
      (client.vehicle?.toLowerCase().includes(term)) ||
      (client.plate?.toLowerCase().includes(term)) ||
      (client.dni?.includes(term)) ||
      (client.notes?.toLowerCase().includes(term))
    );
  })
);

private isInitializingFromBackend = false;
private hasCompletedInitialBackendSync = false;


  constructor(
    private http: HttpClient,
    private clientsApi: ClientsApiService,
    private offlineSync: OfflineSyncService,
    private reportsApi: ReportsApiService,
    private serviceHistoryApi: ServiceHistoryApiService,
    private spacesApi: SpacesApiService,
    private storageSync: StorageSyncService
  ) {
   this.loadAll();  // Carga desde localStorage
   this.ensureAtLeastOneSubsuelo();
   this.offlineSync.syncCompleted$.subscribe(() => {
    this.initializeDataPreferBackend(true);
    this.loadVehicleTypes().pipe(
      catchError(() => of([]))
    ).subscribe();
   });
  }


loadAllFromBackend(): void {
  forkJoin({
    subsuelos: this.spacesApi.getSubsuelos(),
    spaces: this.spacesApi.getSpaces(),
    clients: this.clientsApi.getAllClients()
  }).subscribe({
    next: ({ subsuelos, spaces, clients }) => {
      console.log('Datos cargados exitosamente desde backend', { subsuelos, spaces, clients });

      // subsuelos → array directo
      this.subsuelosSubject.next(subsuelos);

      // spaces → convertir array a mapa
      const spacesMap: { [key: string]: Space } = {};
      spaces.forEach(space => {
        spacesMap[space.key] = space;
      });
      this.spacesSubject.next(spacesMap);

      // clients → convertir array a mapa (id Long → string)
      const clientsMap: { [key: string]: Client } = {};
      clients.forEach(client => {
        clientsMap[client.id.toString()] = client;
      });
      this.clientsSubject.next(clientsMap);

      // Poblar space.client para espacios ocupados
      Object.values(spacesMap).forEach(space => {
        if (space.occupied && space.clientId) {
          space.client = clientsMap[space.clientId.toString()] || null;
        } else {
          space.client = null;
        }
      });

      // Guardar en localStorage como respaldo
      this.saveAll();

      // Asegurar subsuelo actual
      if (subsuelos.length > 0) {
        this.currentSubIdSubject.next(subsuelos[0].id);
      }
    },
    error: (err) => {
      console.error('Error crítico: no se pudo cargar datos desde backend', err);
      // Opcional: mostrar alerta al usuario
      // alert('No se pudieron cargar los datos. Verifica tu conexión.');
    }
  });
}

  loadSubsuelosFromBackend(): Observable<Subsuelo[]> {
  return this.spacesApi.getSubsuelos();
}

loadSpacesFromBackend(): Observable<Space[]> {
  return this.spacesApi.getSpaces();
}

// GUARDAR SUBSUELO EN BACKEND
saveSubsueloToBackend(subsuelo: Subsuelo): Observable<Subsuelo> {
  return this.spacesApi.createSubsuelo(subsuelo);
}

// GUARDAR ESPACIO EN BACKEND
saveSpaceToBackend(space: Space): Observable<Space> {
  return this.spacesApi.createSpace(space);
}




saveClientToBackend(data: { spaceKey: string; payload: any }): Observable<Client> {
  console.log('Enviando reserva al backend:', data);
  return this.clientsApi.reserveOrUpdateClient({ ...data });
}

queueReservationSync(data: { spaceKey: string; payload: any; existingClientId?: number }): void {
  this.offlineSync.enqueue('reserveClient', data);
}

queueReleaseSpaceSync(spaceKey: string): void {
  this.offlineSync.enqueue('releaseSpace', { spaceKey });
}

queueResetDataSync(): void {
  this.offlineSync.enqueue('resetClients', {});
}

queueAddManualClientSync(clientData: any, tempClientId?: string): void {
  this.offlineSync.enqueue('addManualClient', {
    clientData: this.buildManualClientPayload(clientData),
    tempClientId
  });
}

queueUpdateClientSync(clientId: number | string, updatedData: any): void {
  this.offlineSync.enqueue('updateClient', { clientId, updatedData: this.buildClientUpdatePayload(updatedData) });
}

updatePendingManualClientSync(tempClientId: string, updatedData: any): boolean {
  return this.offlineSync.updatePendingManualClient(tempClientId, this.buildManualClientPayload(updatedData));
}

queueCreateVehicleTypeSync(vehicle: { model: string; category: string; price: number }): void {
  this.offlineSync.enqueue('createVehicleType', { vehicleType: vehicle });
}

initializeDataFromBackend(): void {
  console.log('Inicializando datos desde backend...');

  // Cargar espacios
  this.loadSpacesFromBackend().subscribe({
    next: (spacesFromBackend: Space[]) => {
      const spacesMap: { [key: string]: Space } = {};
      spacesFromBackend.forEach(s => spacesMap[s.key] = s);
      this.spacesSubject.next(spacesMap);

      // Cargar clientes
      this.loadClientsFromBackend().subscribe({
        next: (clientsFromBackend: Client[]) => {
          const clientsMap: { [key: string]: Client } = {};
          clientsFromBackend.forEach(c => clientsMap[c.id.toString()] = c);
          this.clientsSubject.next(clientsMap);

          // Guardar en localStorage los datos REALES del backend
          this.saveAll();

          console.log('Datos inicializados desde backend y localStorage actualizado');
          console.log('Espacios:', Object.keys(spacesMap).length);
          console.log('Clientes:', Object.keys(clientsMap).length);
        },
        error: (err) => console.warn('Error cargando clientes desde backend', err)
      });
    },
    error: (err) => console.warn('Error cargando espacios desde backend', err)
  });
}


initializeDataPreferBackend(force: boolean = false): void {
  if (this.isInitializingFromBackend) {
    console.log('[INIT] Ya hay una inicialización en curso. Se omite llamada duplicada.');
    return;
  }

  if (this.hasCompletedInitialBackendSync && !force) {
    console.log('[INIT] Sync inicial con backend ya completado. Se omite (use force=true para recargar).');
    return;
  }

  this.isInitializingFromBackend = true;
  console.log('[INIT] Inicializando datos (backend primero, localStorage fallback)...', { force });

  forkJoin({
    subsuelosFromBackend: this.loadSubsuelosFromBackend(),
    spacesFromBackend: this.loadSpacesFromBackend(),
    clientsFromBackend: this.loadClientsFromBackend()
  }).pipe(
    tap(({ subsuelosFromBackend, spacesFromBackend, clientsFromBackend }) => {
      console.log('[INIT] Respuesta backend', {
        subsuelos: subsuelosFromBackend?.length || 0,
        spaces: spacesFromBackend?.length || 0,
        clients: clientsFromBackend?.length || 0
      });
    }),
    tap(({ subsuelosFromBackend, spacesFromBackend, clientsFromBackend }) => {
      // 1) Subsuelos
      const subsuelos = [...(subsuelosFromBackend || [])];
      this.subsuelosSubject.next(subsuelos);

      // 2) Spaces -> mapa
      const spacesMap: { [key: string]: Space } = {};
      (spacesFromBackend || []).forEach(s => {
        spacesMap[s.key] = s;
      });

      // 3) Clients -> mapa
      const clientsMap: { [key: string]: Client } = {};
      (clientsFromBackend || []).forEach(c => {
        clientsMap[c.id.toString()] = c;
      });

      // 4) Rehidratar relación space.client para UI
      Object.values(spacesMap).forEach(space => {
        if (space.occupied && space.clientId && clientsMap[space.clientId]) {
          space.client = clientsMap[space.clientId];
        } else {
          space.client = null;
        }
      });

      // 5) Publicar estado
      this.spacesSubject.next({ ...spacesMap });
      this.clientsSubject.next({ ...clientsMap });

      // 6) Asegurar currentSubId válido
      const currentSubId = this.currentSubIdSubject.value;
      const hasCurrent = !!currentSubId && subsuelos.some(s => s.id === currentSubId);

      if (!hasCurrent) {
        if (subsuelos.length > 0) {
          this.currentSubIdSubject.next(subsuelos[0].id);
        } else {
          // Si backend no devuelve subsuelos, mantener estructura mínima local
          this.ensureAtLeastOneSubsuelo();
        }
      }

      // 7) Persistir cache local sincronizado
      this.saveAll();

      this.hasCompletedInitialBackendSync = true;

      console.log('[INIT] Sync backend completado y localStorage actualizado', {
        subsuelos: this.subsuelosSubject.value.length,
        spaces: Object.keys(this.spacesSubject.value || {}).length,
        clients: Object.keys(this.clientsSubject.value || {}).length,
        currentSubId: this.currentSubIdSubject.value,
        lsKeys: this.LS_KEYS
      });
    }),
    catchError((err) => {
      console.warn('[INIT] Backend no disponible. Usando localStorage como fallback.', err);

      this.loadAll();

      // Asegurar estructura mínima si local estaba vacío/corrupto
      this.ensureAtLeastOneSubsuelo();

      console.log('[INIT] Estado cargado desde localStorage (fallback)', {
        subsuelos: this.subsuelosSubject.value.length,
        spaces: Object.keys(this.spacesSubject.value || {}).length,
        clients: Object.keys(this.clientsSubject.value || {}).length,
        currentSubId: this.currentSubIdSubject.value
      });

      return of(null);
    }),
    finalize(() => {
      this.isInitializingFromBackend = false;
      console.log('[INIT] Fin initializeDataPreferBackend (flag liberado)');
    })
  ).subscribe();
}

upsertDailyReportSnapshotBeforeClose$(): Observable<Report | null> {
 // const periodKey = new Date().toISOString().slice(0, 10); // yyyy-MM-dd
  const now = new Date();
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const currentSnapshot = this.buildDailyReportPayloadFromCurrentState(periodKey);
  const currentClients = this.parseJsonArraySafe(currentSnapshot.filteredClients);

  console.log('[CloseDay] upsertDailyReportSnapshotBeforeClose$ start', {
    periodKey,
    currentClients: currentClients.length
  });

  return this.reportsApi.getReports().pipe(
    map((reports) => (reports || []).filter(r => this.isSameDailyReport(r, periodKey))),
    switchMap((existingDailyReports) => {
      console.log('[CloseDay] Reportes diarios existentes del día', {
        periodKey,
        count: existingDailyReports.length,
        ids: existingDailyReports.map(r => r.id)
      });

      const existingClients = this.collectClientsFromReports(existingDailyReports);
      const mergedClients = this.mergeAndDedupReportClients(existingClients, currentClients);

      console.log('[CloseDay] Fusión de clientes para reporte diario', {
        existingClients: existingClients.length,
        currentClients: currentClients.length,
        mergedClients: mergedClients.length
      });

      // Caso 1: no hay reporte previo y no hay clientes actuales -> no crear nada
      if (!existingDailyReports.length && mergedClients.length === 0) {
        console.log('[CloseDay] No hay reporte previo ni servicios actuales. Se omite reporte.');
        return of(null);
      }

      // Caso 2: hay reporte previo pero no hay nuevos servicios -> conservar el último reporte existente
      if (existingDailyReports.length > 0 && currentClients.length === 0) {
        const latestExisting = [...existingDailyReports].sort((a, b) =>
          new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
        )[0];

        console.log('[CloseDay] No hay servicios nuevos. Se conserva reporte diario existente.', {
          reportId: latestExisting?.id
        });

        return of(latestExisting || null);
      }

      // Construir payload final consolidado (usa snapshot actual para stats de espacios del momento del cierre)
      const finalPayload = this.buildDailyReportPayloadWithMergedClients(periodKey, mergedClients, currentSnapshot);

      (finalPayload as any).dailyFinal = true;
      // Borrar reportes diarios existentes del día (si hay) y recrear consolidado
      const deleteCalls = existingDailyReports.map(r =>
        this.reportsApi.deleteReport(r.id).pipe(
          catchError((err) => {
            console.warn('[CloseDay] Error borrando reporte diario previo', { reportId: r.id, err });
            // no aborta; seguimos intentando consolidar
            return of(void 0);
          })
        )
      );

      return (deleteCalls.length ? forkJoin(deleteCalls) : of([])).pipe(
        switchMap(() => this.reportsApi.createReport(finalPayload)),
        tap((saved) => {
          console.log('[CloseDay] Reporte diario consolidado guardado', {
            reportId: saved?.id,
            periodKey,
            mergedClients: mergedClients.length,
            totalCobrado: finalPayload.totalCobrado
          });
        })
      );
    }),
    catchError((err) => {
      console.error('[CloseDay] Error generando/reemplazando reporte diario consolidado', err);
      throw err;
    })
  );
}

finalizeDailyReportAndCloseDayInBackend$(): Observable<void> {
  console.log('[CloseDay] Ejecutando cierre del día en backend (finalizar reporte + reset)...');

  return this.reportsApi.finalizeAndCloseDay().pipe(
    switchMap(() => {
      console.log('[CloseDay] Backend cerró el día. Recargando estado (subsuelos/spaces/clients)...');

      return forkJoin({
        subsuelos: this.loadSubsuelosFromBackend(),
        spaces: this.loadSpacesFromBackend(),
        clients: this.loadClientsFromBackend()
      });
    }),
    tap(({ subsuelos, spaces, clients }) => {
      const spacesMap: { [key: string]: Space } = {};
      spaces.forEach(s => spacesMap[s.key] = s);

      const clientsMap: { [key: string]: Client } = {};
      clients.forEach(c => clientsMap[c.id.toString()] = c);

      // Rehidratar relación space.client para UI
      Object.values(spacesMap).forEach(space => {
        if (space.occupied && space.clientId && clientsMap[space.clientId]) {
          space.client = clientsMap[space.clientId];
        } else {
          space.client = null;
        }
      });

      this.subsuelosSubject.next(subsuelos);
      this.spacesSubject.next({ ...spacesMap });
      this.clientsSubject.next({ ...clientsMap });

      // Asegurar currentSubId válido
      const currentSubId = this.currentSubIdSubject.value;
      const hasCurrent = !!currentSubId && subsuelos.some(s => s.id === currentSubId);
      if (!hasCurrent && subsuelos.length > 0) {
        this.currentSubIdSubject.next(subsuelos[0].id);
      }

      this.saveAll();

      console.log('[CloseDay] Estado sincronizado tras cierre backend', {
        subsuelos: subsuelos.length,
        spaces: Object.keys(spacesMap).length,
        clients: Object.keys(clientsMap).length,
        currentSubId: this.currentSubIdSubject.value
      });
    }),
    map(() => void 0),
    catchError((err) => {
      console.error('[CloseDay] Error en cierre backend unificado', err);
      throw err;
    })
  );
}



private buildDailyReportPayloadFromCurrentState(periodKey: string) {
  const spacesMap = this.spacesSubject.value || {};
  const clientsMap = this.clientsSubject.value || {};
  const spaces = Object.values(spacesMap);
  const clients = Object.values(clientsMap);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();

  const dailyClients = clients
    .filter((client) => {
      const entry = this.toEpochAny(client.entryTimestamp);
      return entry !== null && entry >= todayTs;
    })
    .map((client: any) => {
      const space = spacesMap[client.spaceKey || ''];
      return {
        ...client,
        startTime: space?.startTime || this.toEpochAny(client.entryTimestamp) || null,
        spaceDisplayName: space ? (space.displayName || client.spaceKey || '-') : (client.spaceKey || '-')
      };
    })
    .sort((a: any, b: any) =>
      (this.toEpochAny(b.entryTimestamp) || 0) - (this.toEpochAny(a.entryTimestamp) || 0)
    );

  // Stats generales de espacios
  const totalSpaces = spaces.length;
  const occupiedSpaces = spaces.filter(s => s.occupied).length;
  const freeSpaces = totalSpaces - occupiedSpaces;
  const occupancyRate = totalSpaces > 0 ? Math.round((occupiedSpaces / totalSpaces) * 100) : 0;

  // Stats por subsuelo
  const subsuelos = this.subsuelosSubject.value || [];
  const subsueloStats = subsuelos.map(sub => {
    const subSpaces = spaces.filter(s => s.subsueloId === sub.id);
    const occupied = subSpaces.filter(s => s.occupied).length;
    const total = subSpaces.length;
    const free = total - occupied;
    return {
      id: sub.id,
      label: sub.label,
      total,
      occupied,
      free,
      occupancyRate: total > 0 ? Math.round((occupied / total) * 100) : 0
    };
  });

  // Time stats (basado en entryTimestamp vs now)
  const now = Date.now();
  const timeStats = {
    under1h: 0,
    between1h3h: 0,
    over3h: 0
  };

  dailyClients.forEach((c: any) => {
    const entry = this.toEpochAny(c.entryTimestamp);
    if (entry === null) return;
    const hours = (now - entry) / 3600000;
    if (hours < 1) timeStats.under1h++;
    else if (hours <= 3) timeStats.between1h3h++;
    else timeStats.over3h++;
  });

  // Payment amounts
  const paymentAmounts: Record<string, number> = {
    efectivo: 0,
    credito: 0,
    prepago: 0,
    qr: 0,
    debito: 0,
    scaneo: 0,
    'S/Cargo': 0,
    otros: 0
  };

  dailyClients.forEach((c: any) => {
    const method = ((c.paymentMethod || 'otros') as string).toLowerCase();
    const amount = Number(c.price || 0);
    if (Object.prototype.hasOwnProperty.call(paymentAmounts, method)) {
      paymentAmounts[method] += amount;
    } else {
      paymentAmounts['otros'] += amount;
    }
  });

  const totalCobrado = Object.values(paymentAmounts).reduce((sum, v) => sum + (Number(v) || 0), 0);

  return {
    timestamp: new Date().toISOString(),
    periodType: 'DAILY' as const,
    periodKey,
    totalSpaces,
    occupiedSpaces,
    freeSpaces,
    occupancyRate,
    subsueloStats: JSON.stringify(subsueloStats),
    timeStats: JSON.stringify(timeStats),
    filteredClients: JSON.stringify(dailyClients),
    paymentAmounts: JSON.stringify(paymentAmounts),
    totalCobrado
  };
}


private collectClientsFromReports(reports: Report[]): any[] {
  const all = (reports || []).flatMap(r => this.parseJsonArraySafe(r.filteredClients));

  console.log('[CloseDay] collectClientsFromReports', {
    reports: reports?.length || 0,
    clientsExtracted: all.length
  });

  return all;
}

private mergeAndDedupReportClients(existingClients: any[], currentClients: any[]): any[] {
  const merged = [...(existingClients || []), ...(currentClients || [])];
  const dedup = new Map<string, any>();

  for (const c of merged) {
    const key = [
      c?.id ?? 'x',
      c?.code ?? 'x',
      c?.entryTimestamp ?? 'x',
      c?.exitTimestamp ?? 'x'
    ].join('|');

    // Si hay colisión, preferir el registro más "rico" (el último actual suele traer datos más frescos)
    dedup.set(key, c);
  }

  const result = Array.from(dedup.values()).sort((a, b) =>
    (this.toEpochAny(b?.entryTimestamp) ?? this.toEpochAny(b?.exitTimestamp) ?? 0) -
    (this.toEpochAny(a?.entryTimestamp) ?? this.toEpochAny(a?.exitTimestamp) ?? 0)
  );

  console.log('[CloseDay] mergeAndDedupReportClients', {
    inputExisting: existingClients?.length || 0,
    inputCurrent: currentClients?.length || 0,
    mergedRaw: merged.length,
    deduped: result.length
  });

  return result;
}

private buildDailyReportPayloadWithMergedClients(
  periodKey: string,
  mergedClients: any[],
  currentSnapshot: any
) {
  const paymentAmounts = this.buildPaymentAmountsFromReportClients(mergedClients);
  const totalCobrado = Object.values(paymentAmounts).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const timeStats = this.buildTimeStatsFromReportClients(mergedClients);

  const payload = {
    timestamp: new Date().toISOString(),
    periodType: 'DAILY' as const,
    periodKey,

    // snapshot operativo del momento del cierre (último estado)
    totalSpaces: currentSnapshot.totalSpaces,
    occupiedSpaces: currentSnapshot.occupiedSpaces,
    freeSpaces: currentSnapshot.freeSpaces,
    occupancyRate: currentSnapshot.occupancyRate,
    subsueloStats: currentSnapshot.subsueloStats,

    // recalculados desde clientes fusionados
    timeStats: JSON.stringify(timeStats),
    filteredClients: JSON.stringify(mergedClients),
    paymentAmounts: JSON.stringify(paymentAmounts),
    totalCobrado
  };

  console.log('[CloseDay] buildDailyReportPayloadWithMergedClients', {
    periodKey,
    mergedClients: mergedClients.length,
    totalCobrado,
    timeStats,
    paymentAmounts
  });

  return payload;
}


private buildPaymentAmountsFromReportClients(clients: any[]): Record<string, number> {
  const paymentAmounts: Record<string, number> = {
    efectivo: 0,
    credito: 0,
    prepago: 0,
    qr: 0,
    debito: 0,
    scaneo: 0,
    'S/Cargo': 0,
    otros: 0
  };

  (clients || []).forEach((client) => {
    const methodRaw = (client?.paymentMethod || 'otros').toString().trim();
    const amount = Number(client?.price || 0);

    const methodLower = methodRaw.toLowerCase();

    if (methodLower === 'efectivo') paymentAmounts['efectivo'] += amount;
    else if (methodLower === 'credito') paymentAmounts['credito'] += amount;
    else if (methodLower === 'prepago') paymentAmounts['prepago'] += amount;
    else if (methodLower === 'qr') paymentAmounts['qr'] += amount;
    else if (methodLower === 'debito') paymentAmounts['debito'] += amount;
    else if (methodLower === 'scaneo') paymentAmounts['scaneo'] += amount;
    else if (methodRaw === 'S/Cargo') paymentAmounts['S/Cargo'] += amount;
    else paymentAmounts['otros'] += amount;
  });

  return paymentAmounts;
}


private buildTimeStatsFromReportClients(clients: any[]): { under1h: number; between1h3h: number; over3h: number } {
  const now = Date.now();
  const stats = {
    under1h: 0,
    between1h3h: 0,
    over3h: 0
  };

  (clients || []).forEach((client) => {
    const entryTs = this.toEpochAny(client?.entryTimestamp);
    if (entryTs === null) return;

    const elapsedHours = (now - entryTs) / 3600000;

    if (elapsedHours < 1) stats.under1h++;
    else if (elapsedHours <= 3) stats.between1h3h++;
    else stats.over3h++;
  });

  return stats;
}


private toEpochAny(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : new Date(value).getTime();
  return isNaN(n) ? null : n;
}


private isSameDailyReport(report: Report, periodKey: string): boolean {
  if (!report) return false;

  if (report.periodType === 'MONTHLY') return false;

  if (report.periodKey) {
    return report.periodType === 'DAILY' && report.periodKey === periodKey;
  }

  // Compatibilidad solo para reportes legacy que no tienen periodKey.
  const tsDay = (report.timestamp || '').slice(0, 10);
  return tsDay === periodKey;
}


private parseJsonArraySafe(value?: string): any[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}


reserveOrUpdateClient(data: {
  spaceKey: string;
  payload: any;
  existingClientId?: number
}): Observable<Client> {
  return this.clientsApi.reserveOrUpdateClient(data);
  const { spaceKey, payload, existingClientId } = data;

  if (existingClientId) {
    // Cliente ya existe → ACTUALIZAR (PUT)
    return this.http.put<Client>(`${this.API_BASE}/clients/${existingClientId}`, payload);
  } else {
    // Cliente nuevo → RESERVAR (POST)
    return this.http.post<Client>(`${this.API_BASE}/clients/spaces/${spaceKey}/reserve`, payload);
  }
}

getVehicleTypeById(id: number): Observable<VehicleType> {
  return this.http.get<VehicleType>(`${this.API_BASE}/vehicle-types/${id}`);
}

// Opcional: Crear nuevo tipo de vehículo (para admin futuro)
  loadVehicleTypes(): Observable<VehicleType[]> {
  return this.http.get<VehicleType[]>(`${this.API_BASE}/vehicle-types`).pipe(
    tap(types => {
      this.vehicleTypesSubject.next(types);
      this.saveAll();
    })
  );
}

createVehicleType(vehicle: { model: string; category: string; price: number }): Observable<VehicleType> {
   console.log('Enviando al backend:', vehicle);
  return this.http.post<VehicleType>(`${this.API_BASE}/vehicle-types`, vehicle);
}

createVehicleTypeOffline(vehicle: { model: string; category: string; price: number }): VehicleType {
  const tempVehicle: VehicleType = {
    id: -Date.now(),
    model: vehicle.model,
    category: vehicle.category,
    price: vehicle.price
  };

  const nextVehicleTypes = [...this.vehicleTypesSubject.value, tempVehicle].sort((a, b) =>
    a.model.localeCompare(b.model)
  );

  this.vehicleTypesSubject.next(nextVehicleTypes);
  this.saveAll();

  return tempVehicle;
}




// Opcional: Actualizar tipo de vehículo
updateVehicleType(id: number, vehicleType: VehicleType): Observable<VehicleType> {
  return this.http.put<VehicleType>(`${this.API_BASE}/vehicle-types/${id}`, vehicleType);
}

// Opcional: Eliminar tipo de vehículo
deleteVehicleType(id: number): Observable<void> {
  return this.http.delete<void>(`${this.API_BASE}/vehicle-types/${id}`);
}

// ELIMINAR SUBSUELO EN BACKEND
deleteSubsueloFromBackend(subsueloId: string): Observable<void> {
  return this.spacesApi.deleteSubsuelo(subsueloId);
}

// ELIMINAR ESPACIO EN BACKEND
deleteSpaceFromBackend(spaceKey: string): Observable<void> {
  return this.spacesApi.deleteSpace(spaceKey);
}

// ACTUALIZAR ESPACIO EN BACKEND
updateSpaceInBackend(space: Space): Observable<Space> {
  return this.spacesApi.updateSpace(space);
}

markSpaceWhatsappSent(spaceKey: string, sent: boolean): void {
  const spaces = this.spacesSubject.value;
  const space = spaces[spaceKey];
  if (!space) {
    return;
  }

  space.whatsappSent = sent;
  this.spacesSubject.next({ ...spaces });
  this.saveAll();

  this.updateSpaceInBackend(space).subscribe({
    next: () => {
      console.log('Estado WhatsApp del espacio sincronizado:', spaceKey, sent);
    },
    error: (err) => {
      if (!this.offlineSync.isOfflineError(err)) {
        console.warn('Error actualizando estado WhatsApp del espacio en backend', spaceKey, err);
        return;
      }

      this.offlineSync.enqueue('updateSpace', { space: { ...space } });
    }
  });
}

releaseSpaceInBackend(spaceKey: string): Observable<void> {
  return this.clientsApi.releaseSpace(spaceKey);
}




// ACTUALIZAR SUBSUELO EN BACKEND
updateSubsueloInBackend(subsuelo: Subsuelo): Observable<Subsuelo> {
  return this.spacesApi.updateSubsuelo(subsuelo);
}

getClientFromBackend(clientId: number | string): Observable<Client> {
  return this.clientsApi.getClient(clientId);
}

loadClientsFromBackend(): Observable<Client[]> {
  return this.clientsApi.getAllClients();
}

transferSpaceInBackend(spaceKey: string, newSubsueloId: string): Observable<Space> {
  return this.spacesApi.transferSpace(spaceKey, newSubsueloId);
}

resetDataInBackend(): Observable<void> {
  return this.clientsApi.resetClients();
}

getAllClientsFromBackend(): Observable<Client[]> {
  return this.clientsApi.getAllClients();
}


getUniqueClientsFromBackend(): Observable<Client[]> {
  return this.clientsApi.getUniqueClients();
}

getClientsByDateRange(from: string, to: string): Observable<Client[]> {
  return this.clientsApi.getByDateRange(from, to);
}

getServiceHistoryByDateRange(from: string, to: string): Observable<HistoricalService[]> {
  return this.serviceHistoryApi.getByDateRange(from, to);
}

getUniqueClientsPageFromBackend(page: number = 0, size: number = 20, search: string = ''): Observable<PagedResponse<Client>> {
  return this.clientsApi.getUniqueClientsPage(page, size, search);
}


getMonthlyServiceCountByDni(dni: string, monthKey?: string): Observable<number> {
  const safeDni = (dni || '').trim();
  if (!safeDni) return of(0);

  return this.clientsApi.getMonthlyServiceCountByDni(safeDni, monthKey);
}


getMonthlyServiceCountsByDnis(dnis: string[], monthKey?: string): Observable<Record<string, number>> {
  const cleanDnis = Array.from(new Set((dnis || [])
    .map(d => (d || '').trim())
    .filter(Boolean)));

  if (!cleanDnis.length) return of({});

  return this.clientsApi.getMonthlyServiceCountsByDnis(cleanDnis, monthKey);
}




deleteClientFromBackend(clientId: number): Observable<any> {
  console.log('Eliminando cliente ID:', clientId, 'del backend');
  const targetClient = this.clientsSubject.value[clientId.toString()];

  return this.clientsApi.deleteClient(clientId).pipe(
    tap(() => {
      if (!targetClient) {
        return;
      }

      const nextClients = { ...this.clientsSubject.value };
      const removedClientIds = new Set<string>();

      Object.entries(nextClients).forEach(([key, client]) => {
        if (this.sameClientIdentity(client, targetClient)) {
          removedClientIds.add(key);
          delete nextClients[key];
        }
      });

      const nextSpaces = { ...this.spacesSubject.value };
      Object.values(nextSpaces).forEach(space => {
        const currentClientId = space.clientId?.toString?.() ?? '';
        if (removedClientIds.has(currentClientId)) {
          space.occupied = false;
          space.hold = false;
          space.clientId = null;
          space.startTime = null;
          space.client = null;
        }
      });

      this.clientsSubject.next(nextClients);
      this.spacesSubject.next(nextSpaces);
      this.saveAll();

      console.log('Estado local actualizado: cliente eliminado y espacios liberados sin recarga completa');
    })
  );
}

deleteServiceFromBackend(clientId: number): Observable<any> {
  console.log('Eliminando servicio ID:', clientId, 'del backend');
  const targetClient = this.clientsSubject.value[clientId.toString()];

  return this.clientsApi.deleteService(clientId).pipe(
    tap(() => {
      if (!targetClient) {
        return;
      }

      const nextClients = { ...this.clientsSubject.value };
      delete nextClients[clientId.toString()];

      const nextSpaces = { ...this.spacesSubject.value };
      Object.values(nextSpaces).forEach(space => {
        const currentClientId = space.clientId?.toString?.() ?? '';
        if (currentClientId === clientId.toString()) {
          space.occupied = false;
          space.hold = false;
          space.clientId = null;
          space.startTime = null;
          space.client = null;
        }
      });

      this.clientsSubject.next(nextClients);
      this.spacesSubject.next(nextSpaces);
      this.saveAll();

      console.log('Estado local actualizado: servicio eliminado sin afectar otros servicios del cliente');
    })
  );
}


updateClientInBackend(clientId: any, updatedData: any): Observable<Client> {
  return this.clientsApi.updateClient(clientId, updatedData);
}

updateClientVehiclesByDni(dni: string, vehicles: any[]): Observable<void> {
  return this.clientsApi.updateVehiclesByDni(dni, vehicles);
}

getClientReservationsByDni(dni: string): Observable<Client[]> {
  return this.getClientReservationsByDniWithSource(dni).pipe(
    map(result => result.reservations)
  );
}

getClientReservationsByDniWithSource(dni: string): Observable<ClientReservationsLookupResult> {
  if (!dni?.trim()) {
    return of({
      reservations: [],
      source: 'server'
    });
  }
  return this.clientsApi.getClientReservationsByDni(dni).pipe(
    map(reservations => ({
      reservations: reservations || [],
      source: 'server' as const
    })),
    catchError(err => {
      if (this.offlineSync.isOfflineError(err)) {
        console.warn('Backend no disponible para reservas por DNI. Usando cache local.', { dni });
        return of({
          reservations: this.getClientReservationsByDniFromLocal(dni),
          source: 'local' as const
        });
      }

      console.error('Error obteniendo reservas por DNI', err);
      return of({
        reservations: [],
        source: 'server' as const
      });
    })
  );
}

private getClientReservationsByDniFromLocal(dni: string): Client[] {
  const safeDni = (dni || '').toString().trim();
  if (!safeDni) return [];

  return Object.values(this.clientsSubject.value || {})
    .filter(client => (client?.dni || '').toString().trim() === safeDni)
    .sort((a, b) => {
      const aTs = this.toLocalTimestamp(a.entryTimestamp) ?? this.toLocalTimestamp(a.exitTimestamp) ?? 0;
      const bTs = this.toLocalTimestamp(b.entryTimestamp) ?? this.toLocalTimestamp(b.exitTimestamp) ?? 0;
      return bTs - aTs;
    });
}

private toLocalTimestamp(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}



loadAll(): void {
  const { subsuelos, spaces, clients, currentSubId, vehicleTypes } = this.storageSync.loadState(this.LS_KEYS);

  this.normalizeLegacySpaceDisplayNames(spaces);

  // Poblar space.client para espacios ocupados
  Object.values(spaces).forEach(space => {
    if (space.occupied && space.clientId && clients[space.clientId]) {
      space.client = clients[space.clientId];
    } else {
      space.client = null;
    }
  });

  this.subsuelosSubject.next(subsuelos);
  this.spacesSubject.next(spaces);
  this.clientsSubject.next(clients);
  this.currentSubIdSubject.next(currentSubId);
  if (vehicleTypes.length > 0) {
    this.vehicleTypesSubject.next(vehicleTypes);
  }
}

private normalizeLegacySpaceDisplayNames(spaces: { [key: string]: Space }): void {
  Object.values(spaces || {}).forEach(space => {
    if (!space?.displayName) return;

    const legacyMatch = space.displayName.match(/^Nombre\s+(\d+)$/i);
    if (legacyMatch) {
      space.displayName = `SERVICIO ${legacyMatch[1]}`;
    }
  });
}




   saveAll(): void {
    this.storageSync.saveState(this.LS_KEYS, {
      subsuelos: this.subsuelosSubject.value,
      spaces: this.spacesSubject.value,
      clients: this.clientsSubject.value,
      currentSubId: this.currentSubIdSubject.value,
      vehicleTypes: this.vehicleTypesSubject.value
    });
  }

  // Gestión de subsuelos
  private ensureAtLeastOneSubsuelo(): void {
    const subsuelos = this.subsuelosSubject.value;
    if (subsuelos.length === 0) {
      const id = 'SUB1';
      const newSub: Subsuelo = { id, label: 'Subsuelo 1' };
      const spaces = this.spacesSubject.value;
      this.createSpacesForSubsuelo(id, 10, spaces);

      this.subsuelosSubject.next([newSub]);
      this.spacesSubject.next(spaces);
      this.currentSubIdSubject.next(id);
      this.saveAll();
    } else {
      const currentSubId = this.currentSubIdSubject.value;
      const hasCurrent = !!currentSubId && subsuelos.some(sub => sub.id === currentSubId);
      this.currentSubIdSubject.next(hasCurrent ? currentSubId : subsuelos[0].id);
    }
  }






addSubsuelo(): void {
  const subsuelos = this.subsuelosSubject.value;
  let maxNum = 0;
  subsuelos.forEach(sub => {
    const numMatch = sub.id.match(/^SUB(\d+)$/);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  const nextNum = maxNum + 1;
  const id = `SUB${nextNum}`;
  const newSub: Subsuelo = { id, label: `Subsuelo ${nextNum}` };

  const spaces = this.spacesSubject.value;
  this.createSpacesForSubsuelo(id, 5, spaces);

  // GUARDAR EN LOCAL (principal)
  this.subsuelosSubject.next([...subsuelos, newSub]);
  this.spacesSubject.next({ ...spaces });
  this.currentSubIdSubject.next(id);
  this.saveAll();
  const newSpaces = Object.values(spaces).filter(s => s.subsueloId === id);

  // GUARDAR EN BACKEND (respaldo)
  /*this.saveSubsueloToBackend(newSub).subscribe({
    next: (serverSub) => console.log('Subsuelo respaldado en servidor:', serverSub),
    error: (err) => console.warn('No se pudo respaldar subsuelo (funciona offline)', err)
  });

  // Guardar espacios nuevos en backend
  const newSpaces = Object.values(spaces).filter(s => s.subsueloId === id);
  newSpaces.forEach(space => {
    this.saveSpaceToBackend(space).subscribe({
      next: () => {},
      error: (err) => console.warn('Error respaldando espacio', err)
    });
  });
  */

  console.log('Respaldo backend: creando subsuelo', newSub);
  this.saveSubsueloToBackend(newSub).subscribe({
    next: (serverSub) => {
      console.log('Subsuelo respaldado en servidor:', serverSub);
      console.log(`Respaldo backend: creando ${newSpaces.length} espacios para ${id}`);
      newSpaces.forEach(space => {
        this.saveSpaceToBackend(space).subscribe({
          next: (serverSpace) => console.log('Espacio respaldado en servidor:', serverSpace.key),
          error: (err) => {
            if (!this.offlineSync.isOfflineError(err)) return;
            console.warn('Error respaldando espacio', err);
            this.offlineSync.enqueue('createSpace', { space });
          }
        });
      });
    },
    error: (err) => {
      if (!this.offlineSync.isOfflineError(err)) return;
      console.warn('No se pudo respaldar subsuelo (funciona offline)', err);
      this.offlineSync.enqueue('createSubsuelo', { subsuelo: newSub });
      newSpaces.forEach(space => this.offlineSync.enqueue('createSpace', { space }));
    }
  });

  console.log('Nuevo subsuelo creado:', newSub);
}





private createSpacesForSubsuelo(subsueloId: string, count: number, spaces: { [key: string]: Space }): void {
  for (let i = 1; i <= count; i++) {
    const key = this.formatSpaceCode(subsueloId, i);
    const newSpace: Space = {
      key,
      subsueloId,
      occupied: false,
      hold: false,
      clientId: null,
      startTime: null,
      displayName: `SERVICIO ${i}`,
      client: null,  // No enviar

    };
    spaces[key] = newSpace;
  }
}






updateSubsuelo(id: string, newLabel: string): void {
  const subsuelos = this.subsuelosSubject.value;
  const index = subsuelos.findIndex(sub => sub.id === id);
  if (index === -1) {
    throw new Error('Subsuelo no encontrado');
  }

  // === ACTUALIZAR EN LOCAL (tu lógica actual) ===
  const updatedSubsuelo = { ...subsuelos[index], label: newLabel.trim() };
  subsuelos[index] = updatedSubsuelo;

  this.subsuelosSubject.next([...subsuelos]);
  this.saveAll();

  console.log('Subsuelo actualizado localmente:', updatedSubsuelo.id, updatedSubsuelo.label);

  // === ACTUALIZAR EN BACKEND (respaldo) ===
  this.updateSubsueloInBackend(updatedSubsuelo).subscribe({
    next: (serverSubsuelo) => {
      console.log('Subsuelo actualizado en backend:', serverSubsuelo.id);
    },
    error: (err) => {
      if (!this.offlineSync.isOfflineError(err)) return;
      console.warn('Error actualizando subsuelo en backend (ya actualizado localmente)', id, err);
      this.offlineSync.enqueue('updateSubsuelo', { subsuelo: updatedSubsuelo });
    }
  });
}



addSpacesToCurrent(count: number): void {
  const currentSubId = this.currentSubIdSubject.value;
  if (!currentSubId) return;

  const spaces = this.spacesSubject.value;
  const existingKeys = Object.keys(spaces)
    .filter(k => spaces[k].subsueloId === currentSubId)
    .map(k => Number(k.split('-')[1]))
    .sort((a, b) => a - b);

  const start = existingKeys.length ? existingKeys[existingKeys.length - 1] : 0;

  const newSpacesCreated: Space[] = []; // Para enviar al backend

  for (let i = 1; i <= count; i++) {
    const n = start + i;
    const key = this.formatSpaceCode(currentSubId, n);
    const newSpace: Space = {
      key,
      subsueloId: currentSubId,
      occupied: false,
      hold: false,
      clientId: null,
      startTime: null,
      client: null,
      displayName: `SERVICIO ${n}`
    };

    spaces[key] = newSpace;
    newSpacesCreated.push(newSpace); // Guardamos para enviar al backend
  }

  // GUARDAR EN LOCAL (tu lógica principal)
  this.spacesSubject.next({ ...spaces });
  this.saveAll();

  // GUARDAR EN BACKEND (respaldo)
  newSpacesCreated.forEach(space => {
    this.saveSpaceToBackend(space).subscribe({
      next: (serverSpace) => {
        console.log('Espacio respaldado en servidor:', serverSpace.key);
      },
      error: (err) => {
        if (!this.offlineSync.isOfflineError(err)) return;
        console.warn('No se pudo respaldar espacio en backend (funciona offline)', space.key, err);
        this.offlineSync.enqueue('createSpace', { space });
      }
    });
  });

  console.log(`Se agregaron ${count} espacios al subsuelo ${currentSubId}`);
}


  setCurrentSubsuelo(id: string): void {
    if (this.subsuelosSubject.value.some(sub => sub.id === id)) {
      this.currentSubIdSubject.next(id);
      this.saveAll();
    }
  }






saveClient(clientData: any, spaceKey: string): Client {
  const currentSpaces = this.spacesSubject.value;
  const currentClients = this.clientsSubject.value;
  const targetSpace = currentSpaces[spaceKey];

  console.log('[AutolavadoService.saveClient] Inicio', {
    spaceKey,
    clientData,
    spacesCount: Object.keys(currentSpaces || {}).length,
    clientsCount: Object.keys(currentClients || {}).length
  });

  if (!targetSpace) {
    throw new Error('Espacio no encontrado');
  }

  if (targetSpace.occupied) {
    throw new Error('El espacio ya está ocupado');
  }

  // Generar código local
  const code = this.generateClientCode();

  // Teléfono: usar lo que el usuario escribió, limpiar caracteres inválidos
  let phoneIntl = (clientData.phone || '').toString().trim();
  phoneIntl = phoneIntl.replace(/[^0-9+]/g, '');

  const digitsOnly = phoneIntl.replace(/[^0-9]/g, '');
  if (digitsOnly.length < 8 || digitsOnly.length > 15) {
    throw new Error('Número de teléfono inválido (debe tener entre 8 y 15 dígitos)');
  }

  const category = clientData.category || 'AUTO';
  const price = clientData.price && Number(clientData.price) > 0 ? Number(clientData.price) : 35000;

  // ID temporal local
  const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

  const client: Client = {
    id: tempId,
    code,
    dni: (clientData.dni || '').toString().trim(),
    name: (clientData.name || '').toString().trim(),
    phoneIntl,
    phoneRaw: (clientData.phone || '').toString().trim(),
    vehicle: (clientData.vehicle || '').toString().trim(),
    plate: (clientData.plate || '').toString().trim(),
    notes: (clientData.notes || '').toString().trim(),
    spaceKey,
    qrText: '',
    category,
    price,
    entryTimestamp: Date.now()
  };

  // Clonar estructura para evitar mutaciones inesperadas sobre referencias compartidas
  const nextSpaces = { ...currentSpaces };
  const nextClients = { ...currentClients };

  const nextSpace: Space = {
    ...targetSpace,
    occupied: true,
    clientId: tempId,
    startTime: Date.now(),
    hold: false,
    whatsappSent: false,
    client: client
  };

  // Generar QR con el espacio resultante
  client.qrText = this.buildQRText(client, nextSpace);

  nextSpaces[spaceKey] = nextSpace;
  nextClients[tempId] = client;

  this.spacesSubject.next(nextSpaces);
  this.clientsSubject.next(nextClients);
  this.saveAll();

  console.log('[AutolavadoService.saveClient] Guardado local optimista OK', {
    tempId,
    spaceKey,
    client,
    nextSpace
  });

  return client;
}



private buildManualClientPayload(clientData: any): any {
  return {
    name: clientData.name,
    dni: clientData.dni || null,
    phoneIntl: clientData.phoneIntl || null,
    vehicle: clientData.vehicle || null,
    plate: clientData.plate || null,
    category: clientData.category || null,
    price: clientData.price || null,
    notes: clientData.notes || null,
    paymentMethod: clientData.paymentMethod || null,
    clover: clientData.clover ?? null,
    clientVehicles: clientData.clientVehicles || [],
    spaceKey: null,
    entryTimestamp: null,
    exitTimestamp: null,
    code: null
  };
}

private buildClientUpdatePayload(updatedData: any): any {
  return {
    name: updatedData.name,
    dni: updatedData.dni || null,
    phoneIntl: updatedData.phoneIntl || null,
    vehicle: updatedData.vehicle || null,
    plate: updatedData.plate || null,
    notes: updatedData.notes || null,
    category: updatedData.category || null,
    price: updatedData.price ?? null,
    paymentMethod: updatedData.paymentMethod || null,
    clover: updatedData.clover ?? null
  };
}

updateClientOffline(clientId: number | string, updatedData: any): Client | null {
  const currentClients = this.clientsSubject.value;
  const clientKey = String(clientId);
  const existingClient = currentClients[clientKey];

  if (!existingClient) {
    return null;
  }

  const payload = this.buildClientUpdatePayload(updatedData);
  const nextClient: Client = {
    ...existingClient,
    ...payload,
    phoneRaw: (payload.phoneIntl || existingClient.phoneRaw || '').toString().replace(/\D/g, ''),
    clientVehicles: existingClient.clientVehicles || []
  };

  const nextClients = {
    ...currentClients,
    [clientKey]: nextClient
  };

  const nextSpaces = { ...this.spacesSubject.value };
  Object.values(nextSpaces).forEach(space => {
    if (space.clientId && String(space.clientId) === clientKey) {
      space.client = nextClient;
    }
  });

  this.clientsSubject.next(nextClients);
  this.spacesSubject.next(nextSpaces);
  this.saveAll();

  return nextClient;
}

addManualClientOffline(clientData: any): Client {
  const cleanData = this.buildManualClientPayload(clientData);
  const tempId = 'temp-manual-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  const nextClient: Client = {
    id: tempId,
    code: '',
    name: cleanData.name,
    dni: cleanData.dni || undefined,
    phoneIntl: cleanData.phoneIntl || '',
    phoneRaw: (cleanData.phoneIntl || '').toString().replace(/\D/g, ''),
    vehicle: cleanData.vehicle || undefined,
    plate: cleanData.plate || undefined,
    notes: cleanData.notes || undefined,
    spaceKey: null,
    qrText: '',
    category: cleanData.category || undefined,
    price: cleanData.price ?? null,
    clientVehicles: cleanData.clientVehicles || [],
    paymentMethod: cleanData.paymentMethod || undefined,
    clover: cleanData.clover ?? null,
    entryTimestamp: null,
    exitTimestamp: null
  };

  this.clientsSubject.next({
    ...this.clientsSubject.value,
    [tempId]: nextClient
  });
  this.saveAll();

  return nextClient;
}

addManualClient(clientData: any): Observable<Client> {
  return this.clientsApi.addManualClient(this.buildManualClientPayload(clientData));
}





releaseSpace(spaceKey: string): Observable<any> {
  const spaces = this.spacesSubject.value;
  const clients = this.clientsSubject.value;
  const space = spaces[spaceKey];

  if (!space) {
    console.warn('Espacio no encontrado:', spaceKey);
    return of(null);
  }

  // Snapshot para rollback si backend falla
  const spacesBefore = JSON.parse(JSON.stringify(spaces)) as { [key: string]: Space };
  const clientsBefore = JSON.parse(JSON.stringify(clients)) as { [key: string]: Client };

  const clientId = space.clientId;

  // 1) Actualización local optimista
  if (clientId) {
    const client = clients[clientId];
    if (client) {
      client.exitTimestamp = Date.now();
      // No limpiar otros datos: se preserva histórico local temporal
    }
    this.clientsSubject.next({ ...clients });
  }

  space.occupied = false;
  space.clientId = null;
  space.startTime = null;
  space.hold = false;
  space.whatsappSent = false;
  space.client = null;

  this.spacesSubject.next({ ...spaces });
  this.saveAll();

  console.log('Espacio liberado localmente:', spaceKey);

  // 2) Confirmar en backend conservando el estado local ya aplicado
  return this.releaseSpaceInBackend(spaceKey).pipe(
    tap(() => {
      this.saveAll();
      console.log('Espacio liberado en backend sin recarga completa de espacios/clientes');
    }),
    catchError((err) => {
      if (this.offlineSync.isOfflineError(err)) {
        console.warn('Sin conexion al liberar espacio. Se conserva el cambio local y se encola sincronizacion.', err);
        this.queueReleaseSpaceSync(spaceKey);
        throw err;
      }

      console.error('Error liberando espacio en backend. Rollback local aplicado.', err);

      // Rollback del estado local
      this.spacesSubject.next(spacesBefore);
      this.clientsSubject.next(clientsBefore);
      this.saveAll();

      throw err;
    })
  );
}

private sameClientIdentity(a: Client, b: Client): boolean {
  const aDni = (a?.dni || '').toString().trim();
  const bDni = (b?.dni || '').toString().trim();
  if (aDni && bDni) {
    return aDni === bDni;
  }

  const aPhone = (a?.phoneIntl || a?.phoneRaw || '').toString().replace(/\D/g, '');
  const bPhone = (b?.phoneIntl || b?.phoneRaw || '').toString().replace(/\D/g, '');
  if (aPhone && bPhone) {
    return aPhone === bPhone;
  }

  const aName = (a?.name || '').toString().trim().toLowerCase();
  const bName = (b?.name || '').toString().trim().toLowerCase();
  return !!aName && aName === bName;
}




searchClientByDni(dni: string): Observable<Client | null> {
  if (!dni || dni.trim() === '') {
    return of(null);
  }
  return this.clientsApi.searchClientByDni(dni).pipe(
    catchError(err => {
      if (err.status === 404) {
        return of(null);
      }
      throw err;
    })
  );
}





resetData(): Observable<ResetDataResult> {
  const spaces = this.spacesSubject.value;
  const clients = this.clientsSubject.value;

  // Snapshot para rollback si backend falla
  const spacesBefore = JSON.parse(JSON.stringify(spaces)) as { [key: string]: Space };
  const clientsBefore = JSON.parse(JSON.stringify(clients)) as { [key: string]: Client };

  console.log('[RESET] Cerrando día: liberando espacios localmente...');

  // 1. Liberar espacios localmente (optimista)
  Object.values(spaces).forEach(space => {
    space.occupied = false;
    space.clientId = null;
    space.startTime = null;
    space.hold = false;
    space.client = null;
  });

  this.spacesSubject.next({ ...spaces });

  // 2. Mantener historial de clientes, pero limpiar relación activa local
  Object.values(clients).forEach(client => {
    client.spaceKey = null;
    client.entryTimestamp = null;
    // NO borrar vehicle/plate/notes/payment/etc
  });

  this.clientsSubject.next({ ...clients });

  // Persistir estado local temporal
  this.saveAll();
  console.log('[RESET] Estado local limpiado temporalmente. Confirmando en backend...');

  // 3. Confirmar en backend y recargar todo fresco
  return this.resetDataInBackend().pipe(
    switchMap(() => {
      console.log('[RESET] Backend confirmado. Recargando espacios y clientes frescos...');

      return forkJoin({
        spacesFromBackend: this.loadSpacesFromBackend(),
        clientsFromBackend: this.loadClientsFromBackend()
      });
    }),
    tap(({ spacesFromBackend, clientsFromBackend }) => {
      const spacesMap: { [key: string]: Space } = {};
      spacesFromBackend.forEach(s => spacesMap[s.key] = s);

      const clientsMap: { [key: string]: Client } = {};
      clientsFromBackend.forEach(c => clientsMap[c.id.toString()] = c);

      // Rehidratar relación space.client
      Object.values(spacesMap).forEach(space => {
        if (space.occupied && space.clientId && clientsMap[space.clientId]) {
          space.client = clientsMap[space.clientId];
        } else {
          space.client = null;
        }
      });

      this.spacesSubject.next({ ...spacesMap });
      this.clientsSubject.next({ ...clientsMap });
      this.saveAll();

      console.log('[RESET] localStorage actualizado con datos reales del backend');
      console.log('[RESET] Resumen:', {
        spaces: Object.keys(spacesMap).length,
        clients: Object.keys(clientsMap).length
      });
    }),
    map(() => ({ offlineQueued: false })),
    catchError((err) => {
      if (this.offlineSync.isOfflineError(err)) {
        console.warn('[RESET] Sin conexion con backend. Se conserva el cierre local y se encola sincronizacion.', err);
        this.queueResetDataSync();
        return of({ offlineQueued: true });
      }

      console.error('[RESET] Error en backend. Aplicando rollback local...', err);

      // Rollback del estado local
      this.spacesSubject.next(spacesBefore);
      this.clientsSubject.next(clientsBefore);
      this.saveAll();

      throw err;
    }),
  );
}



  // Gestión de búsqueda
  setSearchTerm(term: string): void {
    this.searchTermSubject.next(term);
  }

  // Utilidades


  private generateClientCode(): string {
  return `C-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36).toUpperCase()}`;
}

  private padNumber(n: number): string {
    return String(n).padStart(3, '0');
  }



  private formatSpaceCode(subId: string, idx: number): string {
  return `${subId}-${String(idx).padStart(3, '0')}`; // Mantiene numérico para agregar, pero permite edición libre
}




  elapsedFrom(ts: number | string | null | undefined): string {
  // Si no hay timestamp o es inválido → vacío
  if (!ts) return '';

  // Convertir a número si es string
  const timestamp = typeof ts === 'string' ? new Date(ts).getTime() : Number(ts);

  // Si no es válido → vacío
  if (isNaN(timestamp)) return '';

  const ms = Date.now() - timestamp;

  // Si es futuro (raro, pero por seguridad) → 0m
  if (ms < 0) return '0m';

  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const mm = m % 60;

  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}



  buildQRText(client: Client, space: Space): string {
    return JSON.stringify({
      t: 'autolavado-ticket',
      client: {
        id: client.id,
        code: client.code,
        name: client.name,
        phone: `+${client.phoneIntl}`
      },
      space: {
        key: space.key,
        subsuelo: space.subsueloId
      },
      start: space.startTime!
    });
  }



buildWhatsAppLink(client: Client, space: Space): string {
  const phone = client.phoneIntl;
  const message = this.buildWhatsAppMessage(client, space);
  const encoded = encodeURIComponent(message);
 // return `https://wa.me/${client.phoneIntl}?text=${encoded}`;
  return `whatsapp://send?phone=${phone}&text=${encoded}`;
}






buildWhatsAppMessage(client: Client, space: Space): string {
  const nombre = client.name.trim();
  const vehiculo = client.vehicle?.trim() || 'No especificado';
  const patente = client.plate?.trim() || 'No especificada';
  const precio = client.price ? client.price.toLocaleString('es-AR') : 'Pendiente';

  return `¡Hola ${nombre}! 🚗

Este mensaje es para confirmar su recepción en Exellssior Luxury Car Detailing. Estamos en contacto para la finalización del servicio. ¡Saludos!

Dato de recepción:
• Nombre y Apellido: ${nombre}
• Vehículo y Patente: ${vehiculo} - ${patente}
• Costo Servicio: $${precio}
• Espacio asignado: ${space.displayName}`;
}


buildWhatsAppMessageRelease(client: Client): string {
  const nombre = client.name.trim();

  return `¡Hola ${nombre}!

El servicio completo de su vehículo ha finalizado. Todo listo para la entrega.

Puede pasar por nuestras instalaciones cuando le sea conveniente, recuerde que nuestro horario de atención es hasta las 19hs. La esperamos para la entrega de llaves y realizar el abono final.

Muchas gracias por confiar en Exellssior. 🚗✨`;
}






  toPhoneAR(input: string): string {
  if (!input) return '';

  // Eliminar cualquier carácter no numérico
  let s = input.replace(/[^0-9]/g, '');

  // Quitar prefijos comunes
  if (s.startsWith('54')) s = s.slice(2); // quitar código país si está
  if (s.startsWith('0')) s = s.replace(/^0+/, ''); // quitar ceros iniciales
  if (s.startsWith('15')) s = s.slice(2); // quitar 15 si está

  // Asegurar que el número comience con 9 (móvil)
  if (!s.startsWith('9')) {
    s = '9' + s;
  }

  const result = `54${s}`;

  // Validar longitud (debería ser 13 dígitos: 54 + 9 + 10)
  if (result.length !== 13) {
    throw new Error('Número de teléfono inválido para WhatsApp');
  }

  return result;
}


  clearAllData(): void {
    this.storageSync.clearState(this.LS_KEYS);

    this.subsuelosSubject.next([]);
    this.spacesSubject.next({});
    this.clientsSubject.next({});
    this.currentSubIdSubject.next(null);
    this.searchTermSubject.next('');

    this.ensureAtLeastOneSubsuelo();
  }



  deleteSpace(spaceKey: string): void {
  const spaces = this.spacesSubject.value;
  const space = spaces[spaceKey];

  if (!space) {
    console.warn('Espacio no encontrado para eliminar:', spaceKey);
    return;
  }

  if (space.occupied) {
    throw new Error('No se puede eliminar un espacio ocupado');
  }

  // === ELIMINAR EN LOCAL (tu lógica principal) ===
  delete spaces[spaceKey];

  this.spacesSubject.next({ ...spaces });
  this.saveAll();

  console.log('Espacio eliminado localmente:', spaceKey);

  // === ELIMINAR EN BACKEND (respaldo) ===
  this.deleteSpaceFromBackend(spaceKey).subscribe({
    next: () => {
      console.log('Espacio eliminado en backend:', spaceKey);
    },
    error: (err) => {
      if (!this.offlineSync.isOfflineError(err)) return;
      console.warn('Error eliminando espacio en backend (ya eliminado localmente)', spaceKey, err);
      this.offlineSync.enqueue('deleteSpace', { spaceKey });
    }
  });
}



deleteSubsuelo(subsueloId: string): void {
  const subsuelos = this.subsuelosSubject.value;
  const spaces = this.spacesSubject.value;

  // Validaciones existentes (perfectas)
  const hasOccupiedSpaces = Object.values(spaces)
    .some(space => space.subsueloId === subsueloId && space.occupied);
  if (hasOccupiedSpaces) {
    throw new Error('No se puede eliminar el subsuelo porque tiene espacios ocupados');
  }

  /*if (subsuelos.length <= 1) {
    throw new Error('No se puede eliminar el único subsuelo');
  }*/

  // === ELIMINAR EN LOCAL (tu lógica actual) ===
  const spaceKeysToDelete = Object.keys(spaces)
    .filter(key => spaces[key].subsueloId === subsueloId);

  spaceKeysToDelete.forEach(key => delete spaces[key]);

  const updatedSubsuelos = subsuelos.filter(sub => sub.id !== subsueloId);

  const currentSubId = this.currentSubIdSubject.value;
  if (currentSubId === subsueloId) {
    this.currentSubIdSubject.next(updatedSubsuelos[0]?.id || null);
  }

  this.subsuelosSubject.next(updatedSubsuelos);
  this.spacesSubject.next({ ...spaces });
  this.saveAll();

  // === ELIMINAR EN BACKEND (respaldo) ===
  // Primero eliminar los espacios
  /*spaceKeysToDelete.forEach(key => {
    this.deleteSpaceFromBackend(key).subscribe({
      error: (err) => console.warn('Error eliminando espacio en backend:', key, err)
    });
  });

  // Luego eliminar el subsuelo
  this.deleteSubsueloFromBackend(subsueloId).subscribe({
    next: () => console.log('Subsuelo eliminado en backend:', subsueloId),
    error: (err) => {
      console.warn('Error eliminando subsuelo en backend:', err);
      this.offlineSync.enqueue('deleteSubsuelo', { subsueloId });
    }
  });
  */
 console.log('Eliminando subsuelo en backend (incluye espacios):', subsueloId);
  this.deleteSubsueloFromBackend(subsueloId).subscribe({
    next: () => console.log('Subsuelo eliminado en backend:', subsueloId),
    error: (err) => console.warn('Error eliminando subsuelo en backend:', err)
  });


}



deleteSpacesFromCurrent(count: number): void {
  const currentSubId = this.currentSubIdSubject.value;
  if (!currentSubId) return;

  const spaces = this.spacesSubject.value;
  const subSpaces = Object.keys(spaces)
    .filter(key => spaces[key].subsueloId === currentSubId)
    .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));

  // Validaciones existentes (perfectas)
  if (subSpaces.length < count) {
    throw new Error(`No hay suficientes espacios en ${currentSubId} para eliminar`);
  }

  // Verificar que los últimos 'count' espacios no estén ocupados ni reservados
  const spacesToDelete = subSpaces.slice(-count);
  const hasOccupiedOrHeld = spacesToDelete.some(key => spaces[key].occupied || spaces[key].hold);
  if (hasOccupiedOrHeld) {
    throw new Error('No se pueden eliminar espacios ocupados o reservados');
  }

  // === ELIMINAR EN LOCAL (tu lógica principal) ===
  spacesToDelete.forEach(key => delete spaces[key]);

  this.spacesSubject.next({ ...spaces });
  this.saveAll();

  // === ELIMINAR EN BACKEND (respaldo) ===
  spacesToDelete.forEach(key => {
    this.deleteSpaceFromBackend(key).subscribe({
      next: () => {
        console.log('Espacio eliminado en backend:', key);
      },
      error: (err) => {
        if (!this.offlineSync.isOfflineError(err)) return;
        console.warn('Error eliminando espacio en backend (ya eliminado localmente)', key, err);
        this.offlineSync.enqueue('deleteSpace', { spaceKey: key });
      }
    });
  });

  console.log(`Eliminados ${count} espacios del subsuelo ${currentSubId}`);
}




editSpace(oldKey: string, newKey: string, editedSpace: Space | null): void {
  if (!editedSpace) return;

  const spaces = this.spacesSubject.value;
  const space = spaces[oldKey];
  if (!space || space.hold) {
    throw new Error('No se puede editar un espacio reservado');
  }

  // El modal de edición de espacio solo permite cambiar el nombre visible.
  space.displayName = editedSpace.displayName || space.displayName;

  this.spacesSubject.next({ ...spaces });
  this.saveAll();

  console.log('Espacio editado localmente:', space.key);

  // === ACTUALIZAR EN BACKEND (respaldo) ===
  this.updateSpaceInBackend(space).subscribe({
    next: (updatedSpace) => {
      console.log('Espacio actualizado en backend:', updatedSpace.key);
    },
    error: (err) => {
      if (!this.offlineSync.isOfflineError(err)) return;
      console.warn('Error actualizando espacio en backend (ya editado localmente)', space.key, err);
      this.offlineSync.enqueue('updateSpace', { space: { ...space } });
    }
  });
}


transferSpace(spaceKey: string, newSubsueloId: string): void {
  const spaces = this.spacesSubject.value;
  const clients = this.clientsSubject.value;
  const space = spaces[spaceKey];
  if (!space) throw new Error('Espacio no encontrado');
  if (space.occupied) throw new Error('No se puede transferir un espacio ocupado');
  if (!this.subsuelosSubject.value.some(sub => sub.id === newSubsueloId)) throw new Error('Subsuelo destino no existe');

  // Verificar unicidad de clave en destino
  if (Object.values(spaces).some(s => s.subsueloId === newSubsueloId && s.key === spaceKey)) {
    throw new Error('La clave ya existe en el subsuelo destino');
  }

  // Verificar coincidencia de displayName en destino
  const destinationSpaces = Object.values(spaces).filter(s => s.subsueloId === newSubsueloId);
  const originalDisplayName = space.displayName || space.key;
  const nameExists = destinationSpaces.some(s => (s.displayName || s.key) === originalDisplayName);
  if (nameExists) {
    throw new Error('Ya existe un space con ese nombre. Cambie el nombre para transferirlo.');
  }

  // Actualizar subsueloId
  space.subsueloId = newSubsueloId;

  // Actualizar cliente si existe
  if (space.client) {
    space.client.spaceKey = spaceKey;
  }

  this.spacesSubject.next({ ...spaces });
  this.clientsSubject.next({ ...clients });
  this.saveAll();

  this.transferSpaceInBackend(spaceKey, newSubsueloId).subscribe({
    next: () => {
      console.log('Espacio transferido en backend:', spaceKey, newSubsueloId);
    },
    error: (err) => {
      if (!this.offlineSync.isOfflineError(err)) return;
      console.warn('Error transfiriendo espacio en backend (ya transferido localmente)', spaceKey, err);
      this.offlineSync.enqueue('transferSpace', { spaceKey, newSubsueloId });
    }
  });
}


refreshClientsFromBackend(): void {
  this.loadClientsFromBackend().subscribe({
    next: (clientsFromBackend: Client[]) => {
      const clientsMap: { [key: string]: Client } = {};
      clientsFromBackend.forEach(c => clientsMap[c.id.toString()] = c);
      this.clientsSubject.next(clientsMap);

      this.saveAll(); // Actualizar localStorage con datos REALES
      console.log('Clientes sincronizados desde backend');
    },
    error: (err) => {
      console.warn('No se pudieron refrescar clientes desde backend', err);
    }
  });
}



generateReportsListHtml(): string { // Sin parámetro; fetch interno
  const apiBase = this.API_BASE;
  const reportHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lista de Reportes - Exellsior</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
  <style>
    body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; margin: 20px; }
    h1 { color: #0ea5e9; text-align: center; }
    .table-dark { --bs-table-bg: #1e293b; --bs-table-striped-bg: #2d446a; }
    .progress { height: 25px; background: #374151; }
    .progress-bar { height: 100%; line-height: 25px; text-align: center; font-size: 0.875em; }
    .no-data { text-align: center; color: #94a3b8; padding: 40px; }
    .loading { text-align: center; color: #94a3b8; padding: 40px; }
  </style>
</head>
<body>
  <h1>Lista de Reportes - Exellsior</h1>
  <div class="container-fluid px-4">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h2 class="h4 mb-0">Lista de Reportes</h2>
      <button onclick="loadReports()" class="btn btn-outline-primary btn-sm">Recargar</button>
    </div>
    <div id="reportsTableContainer" class="loading">Cargando reportes...</div>
  </div>
  <script>
    const API_BASE = '${apiBase}';

    function loadReports() {
      document.getElementById('reportsTableContainer').innerHTML = '<div class="loading">Cargando...</div>';
      fetch(\`\${API_BASE}/reports\`)
        .then(response => response.json())
        .then(reports => {
          if (reports.length === 0) {
            document.getElementById('reportsTableContainer').innerHTML = '<div class="no-data">No hay reportes disponibles</div>';
            return;
          }
          const tbody = reports.map(report => \`
            <tr>
              <td>\${report.id}</td>
              <td>\${new Date(report.timestamp).toLocaleString()}</td>
              <td>\${report.totalSpaces}</td>
              <td><span class="badge bg-danger">\${report.occupiedSpaces}</span></td>
              <td><span class="badge bg-success">\${report.freeSpaces}</span></td>
              <td>
                <div class="progress">
                  <div class="progress-bar bg-\${report.occupancyRate < 50 ? 'success' : report.occupancyRate < 80 ? 'warning' : 'danger'}" style="width: \${report.occupancyRate}%">
                    \${report.occupancyRate}%
                  </div>
                </div>
              </td>
              <td>
                <button onclick="viewReport(\${report.id})" class="btn btn-sm btn-outline-primary me-1">Ver</button>
                <button onclick="deleteReport(\${report.id})" class="btn btn-sm btn-outline-danger">Eliminar</button>
              </td>
            </tr>
          \`).join('');
          document.getElementById('reportsTableContainer').innerHTML = \`
            <div class="table-responsive">
              <table class="table table-dark table-striped">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Fecha</th>
                    <th>Total Espacios</th>
                    <th>Ocupados</th>
                    <th>Libres</th>
                    <th>% Ocupación</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>\${tbody}</tbody>
              </table>
            </div>
          \`;
        })
        .catch(error => {
          document.getElementById('reportsTableContainer').innerHTML = '<div class="no-data">Error al cargar: ' + error + '</div>';
        });
    }

    // Cargar al abrir tab
    window.onload = loadReports;

    function viewReport(id) {
      fetch(\`\${API_BASE}/reports/\${id}\`)
        .then(response => response.json())
        .then(report => {
          const detailHtml = 'HTML detallado del reporte ID ' + report.id; // Implementa como generateReport
          const blob = new Blob([detailHtml], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
        })
        .catch(error => alert('Error: ' + error));
    }

    function deleteReport(id) {
      if (confirm('¿Eliminar reporte ID ' + id + '?')) {
        fetch(\`\${API_BASE}/reports/\${id}\`, { method: 'DELETE' })
          .then(response => {
            if (response.ok) {
              loadReports(); // Refetch sin reload
            } else {
              alert('Error al eliminar');
            }
          })
          .catch(error => alert('Error: ' + error));
      }
    }
  </script>
</body>
</html>`;
  return reportHtml;
}




generateReportDetailHtml(
  report: Report,
  options?: { periodLabel?: string; periodDateLabel?: string }
): string {
  // Parsear los JSON
  const subsueloStats = JSON.parse(report.subsueloStats || '[]');
  const timeStats = JSON.parse(report.timeStats || '{}');
  let filteredClients: any[] = [];
  try {
    filteredClients = JSON.parse(report.filteredClients || '[]');
  } catch (e) {
    console.error('Error parsing filteredClients', e);
  }

  // Parsear montos y total
  const paymentAmounts = JSON.parse(report.paymentAmounts || '{}') as Record<string, number>;
  const totalCobrado = report.totalCobrado || 0;

  // Fecha del reporte
  const reportDate = new Date(report.timestamp);
  const formattedReportDate = reportDate.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Títulos dinámicos (diario/mensual)
  const periodLabel = options?.periodLabel || 'Servicios del día';
  const periodDateLabel = options?.periodDateLabel || formattedReportDate;

  // Helpers locales para timestamps robustos
  const toMs = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const ms = typeof v === 'number' ? v : new Date(v).getTime();
    return isNaN(ms) ? null : ms;
  };

  // Enriquecer clientes (tiempo correcto para cerrados y activos)
  const now = Date.now();
  filteredClients = filteredClients.map((client: any) => {
    let elapsedTime = 'N/A';
    let formattedStart = '-';

    const startMs = toMs(client.entryTimestamp);
    const endMs = toMs(client.exitTimestamp) ?? now;

    if (startMs !== null) {
      const ms = Math.max(0, endMs - startMs);
      const mins = Math.floor(ms / 60000);
      const hours = Math.floor(mins / 60);
      const min = mins % 60;
      elapsedTime = hours > 0 ? `${hours}h ${min}m` : `${min}m`;

      const date = new Date(startMs);
      formattedStart =
        date.toLocaleDateString('es-AR', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        }) +
        ' ' +
        date.toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit'
        }) +
        ' hs';
    }

    return { ...client, elapsedTime, formattedStart };
  });

  const promedioServicio = filteredClients.length > 0
    ? Math.round(totalCobrado / filteredClients.length)
    : 0;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Detalle Reporte ID ${report.id} - Exellsior</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; margin: 20px; }
    h1 { color: #0ea5e9; text-align: center; }
    h2 { color: #0ea5e9; margin-bottom: 20px; }
    .section { margin-bottom: 30px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .stat-card { background: #1e293b; padding: 15px; border-radius: 8px; text-align: center; border-left: 4px solid #0ea5e9; }
    .stat-number { font-size: 2em; font-weight: bold; color: #0ea5e9; }
    .total-cobrado { border-left-color: #10b981 !important; }
    .total-number { color: #10b981 !important; font-size: 2.5em !important; }
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #334155; }
    th { background: #16213e; font-weight: bold; color: #0ea5e9; }
    tr:hover { background: #2d446a; }
    .progress { background: #374151; border-radius: 4px; height: 20px; overflow: hidden; }
    .progress-bar { height: 100%; line-height: 20px; text-align: center; font-size: 0.875em; }
    .time-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }
    .time-card { background: #1e293b; padding: 15px; border-radius: 8px; text-align: center; border-left: 4px solid #0ea5e9; }
    .time-number { font-size: 1.5em; font-weight: bold; }
    .no-data { text-align: center; color: #94a3b8; padding: 40px; }
    .badge { padding: 0.5em 0.75em; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>Detalle Reporte ID ${report.id} - ${new Date(report.timestamp).toLocaleString('es-AR')}</h1>

  <div class="container-fluid px-4">
    <div class="section">
      <h2>Resumen General</h2>
      <div class="stats">
        <div class="stat-card total-cobrado">
          <div class="stat-number total-number">$${totalCobrado.toLocaleString('es-AR')}</div>
          <div>Total Cobrado</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${report.totalSpaces}</div>
          <div>Total Espacios</div>
        </div>
        <div class="stat-card">
          <div class="stat-number text-success">${report.occupiedSpaces}</div>
          <div>Ocupados Ahora</div>
        </div>
        <div class="stat-card">
          <div class="stat-number text-info">${report.freeSpaces}</div>
          <div>Libres</div>
        </div>
        <div class="stat-card">
          <div class="stat-number text-warning">${report.occupancyRate}%</div>
          <div>Ocupación Actual</div>
        </div>
        <div class="stat-card">
          <div class="stat-number text-primary">${filteredClients.length}</div>
          <div>${periodLabel}</div>
        </div>
        <div class="stat-card">
          <div class="stat-number text-info">$${promedioServicio.toLocaleString('es-AR')}</div>
          <div>Promedio por Servicio</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Montos Cobrados por Método de Pago</h2>
      <div class="time-stats">
        <div class="time-card" style="border-left-color: #1e7e34;">
          <div class="time-number" style="color: #1e7e34;">$${(paymentAmounts['efectivo'] || 0).toLocaleString('es-AR')}</div>
          <div>Efectivo</div>
        </div>
        <div class="time-card" style="border-left-color: #c45c00;">
          <div class="time-number" style="color: #c45c00;">$${(paymentAmounts['credito'] || 0).toLocaleString('es-AR')}</div>
          <div>Crédito</div>
        </div>
        <div class="time-card" style="border-left-color: #0c5460;">
          <div class="time-number" style="color: #0c5460;">$${(paymentAmounts['debito'] || 0).toLocaleString('es-AR')}</div>
          <div>Débito</div>
        </div>
        <div class="time-card" style="border-left-color: #5a2d91;">
          <div class="time-number" style="color: #5a2d91;">$${(paymentAmounts['prepago'] || 0).toLocaleString('es-AR')}</div>
          <div>Prepago</div>
        </div>
        <div class="time-card" style="border-left-color: #a71d2a;">
          <div class="time-number" style="color: #a71d2a;">$${(paymentAmounts['qr'] || 0).toLocaleString('es-AR')}</div>
          <div>QR</div>
        </div>
        <div class="time-card" style="border-left-color: #b35c00;">
          <div class="time-number" style="color: #b35c00;">$${(paymentAmounts['scaneo'] || 0).toLocaleString('es-AR')}</div>
          <div>Escaneo</div>
        </div>
        <div class="time-card" style="border-left-color: #5a6268;">
          <div class="time-number" style="color: #5a6268;">$${(paymentAmounts['S/Cargo'] || 0).toLocaleString('es-AR')}</div>
          <div>Sin Cargo</div>
        </div>
        ${(paymentAmounts['otros'] || 0) > 0 ? `
        <div class="time-card" style="border-left-color: #6c757d;">
          <div class="time-number" style="color: #6c757d;">$${(paymentAmounts['otros'] || 0).toLocaleString('es-AR')}</div>
          <div>Otros</div>
        </div>
        ` : ''}
      </div>
    </div>

    <div class="section">
      <h2>Tiempo de Ocupación</h2>
      <div class="time-stats">
        <div class="time-card">
          <div class="time-number" style="color: #10b981;">${timeStats.under1h || 0}</div>
          <div>Menos de 1h</div>
        </div>
        <div class="time-card">
          <div class="time-number" style="color: #f59e0b;">${timeStats.between1h3h || 0}</div>
          <div>1h - 3h</div>
        </div>
        <div class="time-card">
          <div class="time-number" style="color: #ef4444;">${timeStats.over3h || 0}</div>
          <div>Más de 3h</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>${periodLabel} ${periodDateLabel} (${filteredClients.length})</h2>
      ${filteredClients.length > 0 ? `
        <table class="table table-dark table-striped">
          <thead>
            <tr>
              <th>Código</th>
              <th>Cliente</th>
              <th>Espacio</th>
              <th>Teléfono</th>
              <th>Vehículo</th>
              <th>Categoría</th>
              <th>Precio</th>
              <th>Método Pago</th>
              <th>Clover</th>
              <th>Ingreso</th>
              <th>Tiempo</th>
              <th>Salida</th>
            </tr>
          </thead>
          <tbody>
            ${filteredClients.map((client: any) => `
              <tr>
                <td><span style="background: #1e293b; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${client.code || '-'}</span></td>
                <td>${client.name}</td>
                <td style="color: #3b82f6;">${client.spaceDisplayName || client.spaceKey || '-'}</td>
                <td>${client.phoneIntl || '-'}</td>
                <td>${client.vehicle || '-'}</td>
                <td>
                  <span class="badge bg-${client.category === 'SUV' ? 'primary' : client.category === 'AUTO' ? 'success' : client.category === 'PICKUP' ? 'warning' : client.category === 'ALTO PORTE' ? 'danger' : 'secondary'}">
                    ${client.category || 'Sin categoría'}
                  </span>
                </td>
                <td style="color: #10b981; font-weight: bold;">
                  $${client.price ? client.price.toLocaleString('es-AR') : 'Pendiente'}
                </td>
                <td>
                  <span class="badge bg-light text-dark">${client.paymentMethod || '-'}</span>
                </td>
                <td>
                  <strong>${client.clover ? client.clover.toString().padStart(4, '0') : '-'}</strong>
                </td>
                <td>${client.formattedStart}</td>
                <td style="color: #f59e0b; font-weight: bold;">${client.elapsedTime}</td>
                <td>
                  <span class="text-warning">
                    ${client.exitTimestamp ? new Date(client.exitTimestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs' : 'Aún en servicio'}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<div class="no-data">No hay clientes en este reporte</div>'}
    </div>
  </div>

  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>
  `;
}



}
