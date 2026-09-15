import { Component, Input, OnChanges, OnDestroy, SimpleChanges, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BillingApiService, BillingReport } from '../../services/api/billing-api.service';

@Component({
  selector: 'app-billing-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './billing-banner.component.html',
  styleUrls: ['./billing-banner.component.scss']
})
export class BillingBannerComponent implements OnChanges, OnDestroy {

  @Input() token = '';

  reports: BillingReport[] = [];
  panelOpen = false;
  deleteMode = false;
  selectedReport: BillingReport | null = null;
  reportData: any = null;
  deletingId: number | null = null;
  loading = false;

  constructor(private billingApi: BillingApiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    const tok = changes['token']?.currentValue;
    if (tok) {
      this.loadAll(tok);
    }
  }

  ngOnDestroy(): void {}

  @HostListener('window:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (e.ctrlKey && e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      if (this.panelOpen) {
        this.deleteMode = !this.deleteMode;
      }
    }
    if (e.key === 'Escape' && this.panelOpen) {
      if (this.deleteMode) { this.deleteMode = false; }
      else { this.closePanel(); }
    }
  }

  loadAll(token?: string): void {
    const tok = token || this.token;
    if (!tok) return;
    this.loading = true;
    this.billingApi.getAll(tok).subscribe(list => {
      this.reports = list.sort((a, b) => b.id - a.id);
      this.loading = false;
    });
  }

  get pendingCount(): number {
    return this.reports.filter(r => r.status === 'PENDING').length;
  }

  get latestPending(): BillingReport | undefined {
    return this.reports.find(r => r.status === 'PENDING');
  }

  togglePanel(): void {
    this.panelOpen = !this.panelOpen;
    if (this.panelOpen) {
      this.loadAll();
      this.selectedReport = null;
      this.reportData = null;
    } else {
      this.deleteMode = false;
    }
  }

  closePanel(): void {
    this.panelOpen = false;
    this.deleteMode = false;
    this.selectedReport = null;
    this.reportData = null;
  }

  openDetail(report: BillingReport): void {
    this.selectedReport = report;
    try {
      this.reportData = JSON.parse(report.reportJson);
    } catch {
      this.reportData = null;
    }
  }

  closeDetail(): void {
    this.selectedReport = null;
    this.reportData = null;
  }

  deleteReport(id: number): void {
    if (this.deletingId === id) return;
    this.deletingId = id;
    this.billingApi.delete(id, this.token).subscribe(ok => {
      if (ok) {
        this.reports = this.reports.filter(r => r.id !== id);
        if (this.selectedReport?.id === id) {
          this.selectedReport = null;
          this.reportData = null;
        }
      }
      this.deletingId = null;
    });
  }

  getServices(): any[] {
    return this.reportData?.svcs ?? [];
  }

  getSvcTotal(svc: any): number {
    return (svc.items ?? []).reduce((t: number, it: any) => t + (+(it.c) || 0), 0);
  }

  getGrandTotal(): number {
    return this.getServices().reduce((t, s) => t + this.getSvcTotal(s), 0);
  }

  getTotalConAdmin(): number {
    return this.getGrandTotal() + (+(this.reportData?.adminCost) || 0);
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return iso; }
  }
}
