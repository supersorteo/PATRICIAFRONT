import { CommonModule } from '@angular/common';
import { Component, HostListener } from '@angular/core';
import { ConfirmDialogState, ConfirmService } from '../../services/confirm.service';

@Component({
  selector: 'app-global-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './global-confirm-dialog.component.html',
  styleUrl: './global-confirm-dialog.component.scss'
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

  trackDialog(state: ConfirmDialogState | null): ConfirmDialogState | null {
    return state;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.cancel();
  }
}
