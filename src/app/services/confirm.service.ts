import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ConfirmVariant = 'primary' | 'danger' | 'warning';

export interface ConfirmDialogState {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  variant: ConfirmVariant;
}

interface PendingConfirm extends ConfirmDialogState {
  resolve: (value: boolean) => void;
}

@Injectable({
  providedIn: 'root'
})
export class ConfirmService {
  private readonly dialogSubject = new BehaviorSubject<ConfirmDialogState | null>(null);
  readonly dialog$ = this.dialogSubject.asObservable();
  private pendingConfirm: PendingConfirm | null = null;

  confirm(options: Partial<ConfirmDialogState> & { message: string }): Promise<boolean> {
    if (this.pendingConfirm) {
      this.pendingConfirm.resolve(false);
    }

    return new Promise<boolean>((resolve) => {
      this.pendingConfirm = {
        title: options.title || 'Confirmar acción',
        message: options.message,
        confirmText: options.confirmText || 'Continuar',
        cancelText: options.cancelText || 'Cancelar',
        variant: options.variant || 'primary',
        resolve
      };

      this.dialogSubject.next({
        title: this.pendingConfirm.title,
        message: this.pendingConfirm.message,
        confirmText: this.pendingConfirm.confirmText,
        cancelText: this.pendingConfirm.cancelText,
        variant: this.pendingConfirm.variant
      });
    });
  }

  accept(): void {
    this.finish(true);
  }

  cancel(): void {
    this.finish(false);
  }

  private finish(result: boolean): void {
    if (!this.pendingConfirm) {
      this.dialogSubject.next(null);
      return;
    }

    this.pendingConfirm.resolve(result);
    this.pendingConfirm = null;
    this.dialogSubject.next(null);
  }
}
