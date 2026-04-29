import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, EventEmitter, HostListener, OnInit, Output } from '@angular/core';
import { Report } from '../../models/autolavado.model';
import { AutolavadoService, PagedResponse } from '../../services/autolavado.service';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../services/toast.service';
import { ConfirmService } from '../../services/confirm.service';

interface ReportListRow {
  raw: Report;
  id: number;
  timestamp: string;
  periodTypeLabel: 'Diario' | 'Mensual';
  periodTitle: string;      // Para tabla
  periodLabel: string;      // Para HTML detalle
  periodDateLabel: string;  // Para HTML detalle
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
  styleUrls: ['./reports-list.component.scss']
})
export class ReportsListComponent implements OnInit{
  @Output() closed = new EventEmitter<void>();

  reports: Report[] = [];
  reportRows: ReportListRow[] = [];
  isLoading = false;
  searchTerm = '';
  periodTypeFilter = '';
  page = 0;
  pageSize = 20;
  totalPages = 0;
  totalElements = 0;
  private searchTimer: any = null;
  private apiBase = environment.apiUrl;

   constructor(
    private http: HttpClient,
    private autolavadoService: AutolavadoService,
    private toastService: ToastService,
    private confirmService: ConfirmService
  ) {}

   ngOnInit(): void {
    this.loadReports();
  }

  loadReports(): void {
    this.isLoading = true;

    let params = new HttpParams()
      .set('page', this.page.toString())
      .set('size', this.pageSize.toString());

    const normalizedSearch = this.searchTerm.trim();
    const normalizedPeriodType = this.periodTypeFilter.trim();

    if (normalizedSearch) {
      params = params.set('search', normalizedSearch);
    }

    if (normalizedPeriodType) {
      params = params.set('periodType', normalizedPeriodType);
    }

    this.http.get<PagedResponse<Report>>(`${this.apiBase}/reports/page`, { params }).subscribe({
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
      },
      error: (error) => {
        console.error('Error loading reports', error);
        this.toastService.showError('Error al cargar reportes: ' + error.message + '. Verifica backend.');
        this.reports = [];
        this.reportRows = [];
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  viewReport(id: number): void {
    this.http.get<Report>(`${this.apiBase}/reports/${id}`).subscribe({
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

    this.http.delete<void>(`${this.apiBase}/reports/${id}`).subscribe({
      next: () => {
        this.loadReports();
        this.toastService.showSuccess('Reporte eliminado correctamente.');
      },
      error: (error) => {
        console.error('Error deleting report', error);
        this.toastService.showError('Error al eliminar el reporte.');
      }
    });
  }

  refreshReports(): void {
    this.page = 0;
    this.loadReports();
  }

  onSearchChange(): void {
    this.page = 0;
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => this.loadReports(), 300);
  }

  onPeriodTypeChange(): void {
    this.page = 0;
    this.loadReports();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.periodTypeFilter = '';
    this.page = 0;
    this.loadReports();
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

    return {
      raw: report,
      id: report.id,
      timestamp: report.timestamp,
      periodTypeLabel: periodType,
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


  trackByReportId(index: number, row: ReportListRow): number {
  return row?.id ?? index;
}


}
