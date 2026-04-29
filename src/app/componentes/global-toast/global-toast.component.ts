import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ToastItem, ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-global-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './global-toast.component.html',
  styleUrl: './global-toast.component.scss'
})
export class GlobalToastComponent {
  readonly toasts$ = this.toastService.toasts$;

  constructor(private readonly toastService: ToastService) {}

  dismiss(toast: ToastItem): void {
    this.toastService.dismiss(toast.id);
  }

  trackByToastId(index: number, toast: ToastItem): number {
    return toast.id;
  }
}
