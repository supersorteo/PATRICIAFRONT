import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener } from '@angular/core';
import { ConfirmDialogState, ConfirmService, ConfirmVariant } from '../../services/confirm.service';

@Component({
  selector: 'app-global-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './global-confirm-dialog.component.html',
  styleUrls: ['./global-confirm-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GlobalConfirmDialogComponent {
  readonly dialog$ = this.confirmService.dialog$;

  constructor(private readonly confirmService: ConfirmService) {}

  cancel(): void {
    this.confirmService.cancel();
  }

  accept(): void {
    this.confirmService.accept();
  }

  variantIcon(variant: ConfirmVariant): string {
    switch (variant) {
      case 'danger':
        return 'fa-trash-can';
      case 'warning':
        return 'fa-triangle-exclamation';
      case 'primary':
      default:
        return 'fa-circle-question';
    }
  }

  variantBadge(variant: ConfirmVariant): string {
    switch (variant) {
      case 'danger':
        return 'Accion sensible';
      case 'warning':
        return 'Confirmacion requerida';
      case 'primary':
      default:
        return 'Decision pendiente';
    }
  }

  trackDialog(state: ConfirmDialogState | null): ConfirmDialogState | null {
    return state;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.cancel();
  }
}
