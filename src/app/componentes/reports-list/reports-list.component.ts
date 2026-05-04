import { CommonModule } from '@angular/common';
import { HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, HostListener, OnInit, Output } from '@angular/core';
import { Report } from '../../models/autolavado.model';
import { AutolavadoService } from '../../services/autolavado.service';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../services/toast.service';
import { ConfirmService } from '../../services/confirm.service';
import { ReportsApiService } from '../../services/reports-api.service';
import { ServiceHistoryApiService } from '../../services/api/service-history-api.service';

interface ReportListRow {
  raw: Report;
  id: number;
  timestamp: string;
  periodTypeLabel: 'Diario' | 'Mensual';
  reportTypeLabel: string;
  reportTypeBadgeClass: string;
  periodTitle: string;
  periodLabel: string;
  periodDateLabel: string;
  totalSpaces: number;
  occupiedSpaces: number;
  freeSpaces: number;
  occupancyRate: number;
  servicesCount: number;
  totalCobrado: number;
}

@Component({
  selector: 'app-reports-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports-list.component.html',
  styleUrls: ['./reports-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportsListComponent implements OnInit{
  @Output() closed = new EventEmitter<void>();

  reports: Report[] = [];
  reportRows: ReportListRow[] = [];
  isLoading = false;
  dateFrom = '';
  dateTo = '';
  periodTypeFilter = '';
  page = 0;
  pageSize = 20;
  totalPages = 0;
  totalElements = 0;
  private searchTimer: any = null;
  readonly reportTypeOptions = [
    { value: '', label: 'Todos los periodos' },
    { value: 'DAILY', label: 'Diarios' },
    { value: 'MONTHLY', label: 'Mensuales' }
  ];

  constructor(
    private reportsApi: ReportsApiService,
    private serviceHistoryApi: ServiceHistoryApiService,
    private autolavadoService: AutolavadoService,
    private toastService: ToastService,
    private confirmService: ConfirmService,
    private cdr: ChangeDetectorRef
  ) {}

   ngOnInit(): void {
    this.loadReports();
  }

  loadReports(): void {
    this.isLoading = true;

    let params = new HttpParams()
      .set('page', this.page.toString())
      .set('size', this.pageSize.toString());

    if (this.dateFrom) {
      params = params.set('dateFrom', this.dateFrom);
    }

    if (this.dateTo) {
      params = params.set('dateTo', this.dateTo);
    }

    const normalizedPeriodType = this.periodTypeFilter.trim();

    if (normalizedPeriodType) {
      params = params.set('periodType', normalizedPeriodType);
    }

    this.reportsApi.getPage(params).subscribe({
      next: (response) => {
        const data = response?.content || [];
        this.reports = [...data].sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        this.reportRows = this.reports.map((r) => this.toRow(r));
        this.page = response?.page ?? 0;
        this.pageSize = response?.size ?? this.pageSize;
        this.totalPages = response?.totalPages ?? 0;
        this.totalElements = response?.totalElements ?? 0;
        console.log('Reportes recibidos:', this.reportRows);
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error loading reports', error);
        this.toastService.showError('Error al cargar reportes: ' + error.message + '. Verifica backend.');
        this.reports = [];
        this.reportRows = [];
        this.cdr.markForCheck();
      },
      complete: () => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  viewReport(id: number): void {
    this.reportsApi.getById(id).subscribe({
      next: (report) => {
        const row = this.toRow(report);
        const detailHtml = this.autolavadoService.generateReportDetailHtml(report, {
          periodLabel: row.periodLabel,
          periodDateLabel: row.periodDateLabel
        });

        const blob = new Blob([detailHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      },
      error: (error) => {
        console.error('Error viewing report', error);
        this.toastService.showError('Error al ver el reporte.');
      }
    });
  }

  deleteReport(id: number): void {
    void this.deleteReportWithConfirm(id);
  }

  deleteReportMethod1(id: number): void {
    void this.deleteReportMethod1WithConfirm(id);
  }

  private async deleteReportWithConfirm(id: number): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Eliminar reporte',
      message: `Eliminar reporte ID ${id}? Esta accion no se puede deshacer.`,
      confirmText: 'Eliminar reporte',
      cancelText: 'Cancelar',
      variant: 'danger'
    });

    if (!confirmed) {
      return;
    }

    this.reportsApi.delete(id).subscribe({
      next: () => {
        this.loadReports();
        this.toastService.showSuccess('Reporte eliminado correctamente.');
      },
      error: (error) => {
        console.error('Error deleting report', error);
        const msg = error?.error?.error ?? 'Error al eliminar el reporte.';
        this.toastService.showError(msg);
      }
    });
  }

  private async deleteReportMethod1WithConfirm(id: number): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Eliminar reporte de prueba',
      message:
        `Eliminar reporte ID ${id} usando method1?\n\n` +
        `Este metodo es solo para pruebas: si el reporte es un cierre diario final, tambien puede eliminar el mensual dependiente para permitir volver a probar el cierre.`,
      confirmText: 'Eliminar con method1',
      cancelText: 'Cancelar',
      variant: 'danger'
    });

    if (!confirmed) {
      return;
    }

    this.reportsApi.deleteMethod1(id).subscribe({
      next: () => {
        this.loadReports();
        this.toastService.showSuccess('Reporte eliminado con method1.');
      },
      error: (error) => {
        console.error('Error deleting report with method1', error);
        const msg = error?.error?.error ?? 'Error al eliminar el reporte con method1.';
        this.toastService.showError(msg);
      }
    });
  }

  refreshReports(): void {
    this.page = 0;
    this.loadReports();
  }

  onDateChange(): void {
    this.page = 0;
    this.loadReports();
  }

  onPeriodTypeChange(): void {
    this.page = 0;
    this.loadReports();
  }

  clearFilters(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.dateFrom = '';
    this.dateTo = '';
    this.periodTypeFilter = '';
    this.page = 0;
    this.loadReports();
  }

  get hasActiveFilters(): boolean {
    return !!this.dateFrom || !!this.dateTo || !!this.periodTypeFilter.trim();
  }

  get currentPageLabel(): number {
    return this.page + 1;
  }

  get canGoPrevPage(): boolean {
    return this.page > 0;
  }

  get canGoNextPage(): boolean {
    return this.page + 1 < this.totalPages;
  }

  goPrevPage(): void {
    if (!this.canGoPrevPage) return;
    this.page -= 1;
    this.loadReports();
  }

  goNextPage(): void {
    if (!this.canGoNextPage) return;
    this.page += 1;
    this.loadReports();
  }

  closeModal(): void {
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.closeModal();
  }

  private toRow(report: Report): ReportListRow {
    const ts = new Date(report.timestamp);
    const periodType = report.periodType === 'MONTHLY' ? 'Mensual' : 'Diario';

    const monthText = ts.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    const dayText = ts.toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const periodLabel = report.periodType === 'MONTHLY' ? 'Servicios del mes' : 'Servicios del día';
    const periodDateLabel =
      report.periodType === 'MONTHLY'
        ? `${monthText} (hasta ${ts.toLocaleDateString('es-AR')})`
        : dayText;

    const servicesCount = this.safeParseArray(report.filteredClients).length;
    const totalCobrado = this.resolveTotalCobrado(report);

    const { reportTypeLabel, reportTypeBadgeClass } = this.resolveReportType(report);

    return {
      raw: report,
      id: report.id,
      timestamp: report.timestamp,
      periodTypeLabel: periodType,
      reportTypeLabel,
      reportTypeBadgeClass,
      periodTitle: periodDateLabel,
      periodLabel,
      periodDateLabel,
      totalSpaces: report.totalSpaces,
      occupiedSpaces: report.occupiedSpaces,
      freeSpaces: report.freeSpaces,
      occupancyRate: report.occupancyRate,
      servicesCount,
      totalCobrado
    };
  }

  private resolveReportType(report: Report): { reportTypeLabel: string; reportTypeBadgeClass: string } {
    switch (report.reportType) {
      case 'DAY_CLOSE':  return { reportTypeLabel: 'Cierre del día', reportTypeBadgeClass: 'bg-success' };
      case 'SCHEDULED':  return { reportTypeLabel: 'Programado',     reportTypeBadgeClass: 'bg-info text-dark' };
      case 'MONTHLY':    return { reportTypeLabel: 'Mensual',         reportTypeBadgeClass: 'bg-warning text-dark' };
      case 'MANUAL':     return { reportTypeLabel: 'Manual',          reportTypeBadgeClass: 'bg-secondary' };
      default:
        if (report.periodType === 'MONTHLY') return { reportTypeLabel: 'Mensual', reportTypeBadgeClass: 'bg-warning text-dark' };
        if (report.dailyFinal)               return { reportTypeLabel: 'Cierre del día', reportTypeBadgeClass: 'bg-success' };
        return { reportTypeLabel: 'Manual', reportTypeBadgeClass: 'bg-secondary' };
    }
  }

  private safeParseArray(json: string | undefined): any[] {
    if (!json) return [];
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private resolveTotalCobrado(report: Report): number {
    if (typeof report.totalCobrado === 'number') return report.totalCobrado;

    try {
      const pa = JSON.parse(report.paymentAmounts || '{}') as Record<string, number>;
      return Object.values(pa).reduce((acc, v) => acc + (Number(v) || 0), 0);
    } catch {
      return 0;
    }
  }


  triggerDayClose(): void {
    void this.triggerDayCloseWithConfirm();
  }

  private async triggerDayCloseWithConfirm(): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Cierre manual del día',
      message: 'Esto cerrará el día actual (hora Argentina), generará el reporte DAY_CLOSE y reseteará los espacios activos. Solo ejecutar si el cierre automático no funcionó.',
      confirmText: 'Ejecutar cierre',
      cancelText: 'Cancelar',
      variant: 'danger'
    });
    if (!confirmed) return;

    this.reportsApi.manualDayClose().subscribe({
      next: () => {
        this.toastService.showSuccess('Cierre del día ejecutado correctamente.');
        this.loadReports();
      },
      error: (err) => {
        this.toastService.showError('Error al ejecutar el cierre: ' + (err?.error?.message ?? err?.message ?? 'Error desconocido'));
      }
    });
  }

  resetHistory(): void {
    void this.resetHistoryWithConfirm();
  }

  private async resetHistoryWithConfirm(): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Reset del histórico',
      message: 'Esto eliminará TODOS los registros del histórico de servicios. Los reportes existentes no se borran pero las estadísticas quedarán vacías hasta que se generen nuevos cierres. Esta acción no se puede deshacer.',
      confirmText: 'Resetear histórico',
      cancelText: 'Cancelar',
      variant: 'danger'
    });
    if (!confirmed) return;

    this.serviceHistoryApi.resetAll().subscribe({
      next: () => {
        this.toastService.showSuccess('Histórico reseteado correctamente. Los nuevos servicios se acumularán desde ahora.');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.toastService.showError('Error al resetear el histórico: ' + (err?.error?.message ?? err?.message ?? 'Error desconocido'));
      }
    });
  }

  trackByReportId(index: number, row: ReportListRow): number {
  return row?.id ?? index;
}


}
