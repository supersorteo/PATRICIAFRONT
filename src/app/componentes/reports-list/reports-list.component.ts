import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, HostListener, OnInit, Output } from '@angular/core';
import { Report } from '../../models/autolavado.model';
import { AutolavadoService } from '../../services/autolavado.service';
import { environment } from '../../../environments/environment';

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
  imports: [CommonModule],
  templateUrl: './reports-list.component.html',
  styleUrl: './reports-list.component.scss'
})
export class ReportsListComponent implements OnInit{
  @Output() closed = new EventEmitter<void>();

  reports: Report[] = [];
  reportRows: ReportListRow[] = [];
  private apiBase = environment.apiUrl;

   constructor(private http: HttpClient, private autolavadoService:AutolavadoService) {}

   ngOnInit(): void {
    this.loadReports();
  }

  loadReports(): void {
    this.http.get<Report[]>(`${this.apiBase}/reports`).subscribe({
      next: (data) => {
        this.reports = [...data].sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        this.reportRows = this.reports.map((r) => this.toRow(r));
        console.log('Reportes recibidos:', this.reportRows);
      },
      error: (error) => {
        console.error('Error loading reports', error);
        alert('Error al cargar reportes: ' + error.message + '. Verifica backend.');
        this.reports = [];
        this.reportRows = [];
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
        alert('Error al ver reporte');
      }
    });
  }

  deleteReport(id: number): void {
    if (confirm('¿Eliminar reporte ID ' + id + '?')) {
      this.http.delete<void>(`${this.apiBase}/reports/${id}`).subscribe({
        next: () => {
          this.loadReports();
          alert('Reporte eliminado.');
        },
        error: (error) => {
          console.error('Error deleting report', error);
          alert('Error al eliminar.');
        }
      });
    }
  }

  refreshReports(): void {
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
