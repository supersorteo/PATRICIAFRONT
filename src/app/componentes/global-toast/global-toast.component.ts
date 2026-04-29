import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { ToastItem, ToastService, ToastVariant } from '../../services/toast.service';

@Component({
  selector: 'app-global-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './global-toast.component.html',
  styleUrls: ['./global-toast.component.scss']
})
export class GlobalToastComponent {
  readonly toasts$: Observable<ToastItem[]> = this.toastService.toasts$;

  constructor(private readonly toastService: ToastService) {}

  dismiss(toast: ToastItem): void {
    this.toastService.dismiss(toast.id);
  }

  trackByToastId(index: number, toast: ToastItem): number {
    return toast.id;
  }

  iconClass(variant: ToastVariant): string {
    switch (variant) {
      case 'success':
        return 'fa-circle-check';
      case 'error':
        return 'fa-circle-xmark';
      case 'warning':
        return 'fa-triangle-exclamation';
      case 'info':
      default:
        return 'fa-circle-info';
    }
  }

  variantLabel(variant: ToastVariant): string {
    switch (variant) {
      case 'success':
        return 'Exito';
      case 'error':
        return 'Error';
      case 'warning':
        return 'Atencion';
      case 'info':
      default:
        return 'Info';
    }
  }
}
