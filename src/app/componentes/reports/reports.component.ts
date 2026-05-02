import { ChangeDetectionStrategy, Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, combineLatest, catchError, of, map, switchMap, forkJoin } from 'rxjs';
import { Client, HistoricalService, Report, Space, Subsuelo } from '../../models/autolavado.model';
import { AutolavadoService } from '../../services/autolavado.service';
import { ReportsListComponent } from "../reports-list/reports-list.component";
import { FormatPhonePipe } from "../../services/format-phone.pipe";
import { ReportScheduleConfig, ReportsApiService } from '../../services/reports-api.service';
import { ToastService } from '../../services/toast.service';
import { ConfirmService } from '../../services/confirm.service';

declare const bootstrap: any;

interface RankingClienteView {
  position: number;
  name: string;
  dni: string;
  phone: string;
  totalServices: number;
  lastVisit: string;
  tier: 'oro' | 'plata' | 'bronce' | 'ninguno';
}

interface StatsWeekOption {
  label: string;
  from: string;
  to: string;
}

interface StatsMonthOption {
  value: number;
  label: string;
  shortLabel: string;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, ReportsListComponent, FormatPhonePipe],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private readonly reportServerTimeZone = 'America/Argentina/Buenos_Aires';

  subsuelos: Subsuelo[] = [];
  spaces: { [key: string]: Space } = {};
  clients: { [key: string]: Client } = {};
  filteredClients: any[] = [];
  searchTerm = '';
  isEditClientOpen = false;

currentPageDaily = 1;
pageSizeDaily = 5;

  editForm: {
  valor: number;
  clave: string;
 // clover: number | null;
  clover: string;
  metodoPago: 'efectivo' | 'credito' | 'prepago'| 'qr'| 'debito'| 'S/Cargo'| 'scaneo';
} = {
  valor: 0,
  clave: '',
  clover: '',
  metodoPago: 'efectivo'
};
  editingClient: Client | null = null;
  totalSpaces = 0;
  occupiedSpaces = 0;
  freeSpaces = 0;
  occupancyRate = 0;

  subsueloStats: any[] = [];
  timeStats = {
    under1h: 0,
    between1h3h: 0,
    over3h: 0
  };

  dailyTotalCobrado = 0;
  paymentStats = {
  efectivo: { count: 0, pct: 0 },
  credito: { count: 0, pct: 0 },
  prepago: { count: 0, pct: 0 },
  qr: { count: 0, pct: 0 },
  otros: { count: 0, pct: 0 }
};


  pageSize = 5;
  currentPage = 1;
  currentClients!: Client[];
  editClientHeaderMessage = '';
  private editClientHeaderTimer: any = null;

  showReportsList = false;
  showClientsRanking = false;
  currentRankingPage = 1;
  rankingPageSize = 12;
  isLoadingRanking = false;

  showStatsPanel = false;
  statsDateInput = '';
  statsMonthInput = '';
  statsMode: 'month' | 'day' | 'week' = 'month';
  statsWeekOptions: StatsWeekOption[] = [];
  statsSelectedWeekIndex = 0;
  statsSelectedYear = new Date().getFullYear();
  statsSelectedMonth = new Date().getMonth() + 1;
  statsClients: HistoricalService[] = [];
  statsCurrentPage = 1;
  readonly statsPageSize = 10;
  isLoadingStats = false;
  readonly statsMonthOptions: StatsMonthOption[] = [
    { value: 1, label: 'Enero', shortLabel: 'Ene' },
    { value: 2, label: 'Febrero', shortLabel: 'Feb' },
    { value: 3, label: 'Marzo', shortLabel: 'Mar' },
    { value: 4, label: 'Abril', shortLabel: 'Abr' },
    { value: 5, label: 'Mayo', shortLabel: 'May' },
    { value: 6, label: 'Junio', shortLabel: 'Jun' },
    { value: 7, label: 'Julio', shortLabel: 'Jul' },
    { value: 8, label: 'Agosto', shortLabel: 'Ago' },
    { value: 9, label: 'Septiembre', shortLabel: 'Sep' },
    { value: 10, label: 'Octubre', shortLabel: 'Oct' },
    { value: 11, label: 'Noviembre', shortLabel: 'Nov' },
    { value: 12, label: 'Diciembre', shortLabel: 'Dic' }
  ];

rankingList: RankingClienteView[] = [];

scheduledTime: string = ''; // Hora programada en servidor (HH:mm)
scheduledTimeServer = '';
lastScheduledSnapshotDay = '';
currentPageToday = 1;
pageSizeToday = 5;
dailyClients: Client[] = [];
Math: any;

paymentMethodColors: { [key: string]: string } = {
  efectivo:   'rgba(15, 92, 46, 0.5)',
  credito:    'rgba(140, 63, 0, 0.5)',
  debito:     'rgba(8, 76, 97, 0.5)',
  prepago:    'rgba(63, 29, 110, 0.5)',
  qr:         'rgba(122, 26, 34, 0.5)',
  scaneo:     'rgba(140, 68, 0, 0.5)',
  'S/Cargo':  'rgba(73, 80, 87, 0.5)',
  '':         'rgba(33, 37, 41, 0.5)'
};

paymentColorsByClientId: { [clientId: string]: string } = {};
private readonly PAYMENT_COLORS_KEY = 'exellsior_payment_colors';
filteredDailyClientsList: Client[] = [];  // Lista filtrada real (no getter)
paginatedDailyClientsList: Client[] = []; // Lista paginada real

private statsRefreshIntervalId: any = null;
private scheduleStatusPollId: any = null;

  constructor(
    private autolavadoService: AutolavadoService,
    private cdr: ChangeDetectorRef,
    private reportsApi: ReportsApiService,
    private toastService: ToastService,
    private confirmService: ConfirmService,
    private ngZone: NgZone
  ) {}


  ngOnInit(): void {
    combineLatest([
      this.autolavadoService.subsuelos$,
      this.autolavadoService.spaces$,
      this.autolavadoService.clients$,
      //this.autolavadoService.filteredClients$,
      this.autolavadoService.dailyClients$

    ]).pipe(takeUntil(this.destroy$))
    .subscribe(([subsuelos, spaces, clients, dailyClients]) => {
      this.subsuelos = subsuelos;
      this.spaces = spaces;
      this.clients = clients;
      this.filteredClients = dailyClients;
      this.dailyClients = dailyClients;
      console.log('Filtered Clients cargados:', dailyClients);

      console.log('[Reports] combineLatest update', {
      subsuelos: subsuelos.length,
      spaces: Object.keys(spaces || {}).length,
      clients: Object.keys(clients || {}).length,
      dailyClients: dailyClients.length
    });

    this.applyDailyClientFiltersAndPagination();

      this.calculateStats();
      this.cdr.markForCheck();
    });

    this.ngZone.runOutsideAngular(() => {
      this.statsRefreshIntervalId = setInterval(() => {
        if (!this.shouldRefreshLiveStats()) {
          return;
        }

        this.calculateStats();
        this.ngZone.run(() => this.cdr.markForCheck());
      }, 60000);
    });

   /* setInterval(() => {
      this.calculateStats();
      this.cdr.detectChanges();
    }, 60000);*/



  this.loadReportScheduleConfig();

  this.ngZone.runOutsideAngular(() => {
    this.scheduleStatusPollId = setInterval(() => {
      this.ngZone.run(() => this.loadReportScheduleConfig('poll'));
    }, 30000);
  });



  /*this.autolavadoService.dailyClients$.subscribe(() => {
    this.calculateStats();
    this.cdr.detectChanges();
  });*/

this.loadPaymentColors();
  }





  ngOnDestroy(): void {
  if (this.statsRefreshIntervalId) {
    clearInterval(this.statsRefreshIntervalId);
    this.statsRefreshIntervalId = null;
  }
  if (this.scheduleStatusPollId) {
    clearInterval(this.scheduleStatusPollId);
    this.scheduleStatusPollId = null;
  }

  this.destroy$.next();
  this.destroy$.complete();
}



private toTimestamp(value: any, fallback?: any): number | null {
  if (value === null || value === undefined || value === '') {
    if (fallback !== undefined) return this.toTimestamp(fallback);
    return null;
  }
  if (typeof value === 'number') return isNaN(value) ? null : value;
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}


private getClientIdentityKey(c: Client): string {
  const dni = (c.dni || '').toString().trim();
  const phone = (c.phoneIntl || '').toString().replace(/\D/g, '');
  const name = (c.name || '').toString().trim().toLowerCase();

  if (dni) return `dni:${dni}`;
  if (phone) return `phone:${phone}`;
  return `name:${name}`;
}


private buildMonthlyRanking(): RankingClienteView[] {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

  const allClients = Object.values(this.clients || {});
  const map = new Map<string, {
    sample: Client;
    count: number;
    lastTs: number;
  }>();

  allClients.forEach(c => {
   // const ts = this.toTimestamp(c.entryTimestamp);
    const ts = this.toTimestamp(c.entryTimestamp, c.exitTimestamp);

    if (ts === null || ts < monthStart || ts >= nextMonthStart) return;

    const key = this.getClientIdentityKey(c);
    const current = map.get(key);

    if (!current) {
      map.set(key, { sample: c, count: 1, lastTs: ts });
    } else {
      current.count += 1;
      if (ts > current.lastTs) {
        current.lastTs = ts;
        current.sample = c;
      }
    }
  });

  const ranking = Array.from(map.values())
    .map(item => ({
      position: 0,
      name: item.sample.name || '-',
      dni: item.sample.dni || '-',
      phone: item.sample.phoneIntl || '-',
      totalServices: item.count,
      lastVisit: new Date(item.lastTs).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }),
      tier: 'ninguno' as RankingClienteView['tier']
    }))
    .sort((a, b) => b.totalServices - a.totalServices);

  ranking.forEach((r, i) => {
    r.position = i + 1;
    if (r.position === 1) r.tier = 'oro';
    else if (r.position === 2) r.tier = 'plata';
    else if (r.position === 3) r.tier = 'bronce';
  });

  return ranking;
}



  private loadPaymentColors() {
  const saved = localStorage.getItem(this.PAYMENT_COLORS_KEY);
  if (saved) {
    try {
      this.paymentColorsByClientId = JSON.parse(saved);
    } catch (e) {
      console.warn('Error cargando colores de pago', e);
    }
  }
}

private savePaymentColors() {
  localStorage.setItem(this.PAYMENT_COLORS_KEY, JSON.stringify(this.paymentColorsByClientId));
}

toggleReportsList(): void {
  this.showReportsList = !this.showReportsList;
  if (this.showReportsList) {
    this.refreshStats(); // Actualiza stats al abrir
  }
}

closeReportsList(): void {
  this.showReportsList = false;
}



toggleClientsRanking(): void {
  this.showClientsRanking = !this.showClientsRanking;
  if (this.showClientsRanking) {
    this.currentRankingPage = 1;
    this.loadRankingFromBackend();
  }
}

closeClientsRanking(): void {
  this.showClientsRanking = false;
}

private loadRankingFromBackend(): void {
  this.isLoadingRanking = true;
  this.cdr.markForCheck();

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  this.autolavadoService.getUniqueClientsFromBackend().pipe(
    takeUntil(this.destroy$),
    switchMap(clients => {
      const dnis = clients.map((c: Client) => c.dni).filter(Boolean) as string[];
      return this.autolavadoService.getMonthlyServiceCountsByDnis(dnis, monthKey).pipe(
        map((counts: Record<string, number>) => ({ clients, counts }))
      );
    })
  ).subscribe({
    next: ({ clients, counts }) => {
      this.rankingList = this.buildRankingFromBackendData(clients as Client[], counts as Record<string, number>);
      this.isLoadingRanking = false;
      this.cdr.markForCheck();
    },
    error: () => {
      this.isLoadingRanking = false;
      this.cdr.markForCheck();
    }
  });
}

private buildRankingFromBackendData(clients: Client[], counts: Record<string, number>): RankingClienteView[] {
  const ranking = clients
    .map(c => {
      const count = c.dni ? (counts[c.dni] || 0) : 0;
      const ts = c.exitTimestamp || (c.entryTimestamp ? new Date(c.entryTimestamp).getTime() : 0);
      return {
        position: 0,
        name: c.name || '-',
        dni: c.dni || '-',
        phone: c.phoneIntl || c.phoneRaw || '-',
        totalServices: count,
        lastVisit: ts ? new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
        tier: 'ninguno' as RankingClienteView['tier']
      };
    })
    .filter(r => r.totalServices > 0)
    .sort((a, b) => b.totalServices - a.totalServices)
    .slice(0, 100);

  ranking.forEach((r, i) => {
    r.position = i + 1;
    if (i === 0) r.tier = 'oro';
    else if (i === 1) r.tier = 'plata';
    else if (i === 2) r.tier = 'bronce';
  });

  return ranking;
}

toggleStatsPanel(): void {
  this.showStatsPanel = !this.showStatsPanel;
  if (this.showStatsPanel) {
    if (!this.statsDateInput) {
      this.statsDateInput = this.formatDateInputValue(new Date());
    }
    if (!this.statsMonthInput) {
      this.statsMonthInput = this.formatMonthInputValue(new Date());
    }
    this.syncStatsSelectorsFromMonthInput();
    this.refreshStatsWeekOptions();
    this.loadStats();
  }
}

closeStatsPanel(): void {
  this.showStatsPanel = false;
}

setStatsMode(mode: 'month' | 'week' | 'day'): void {
  this.statsMode = mode;

  if (!this.statsDateInput) {
    this.statsDateInput = this.formatDateInputValue(new Date());
  }
  if (!this.statsMonthInput) {
    this.statsMonthInput = this.formatMonthInputValue(new Date());
  }
  this.syncStatsSelectorsFromMonthInput();
  if (mode === 'day') {
    this.ensureStatsDateInsideSelectedMonth();
  }
  if (mode === 'week') {
    this.refreshStatsWeekOptions();
  }

  this.loadStats();
}

onStatsMonthChange(): void {
  if (!this.statsMonthInput) return;
  this.syncStatsSelectorsFromMonthInput();
  this.ensureStatsDateInsideSelectedMonth();
  this.refreshStatsWeekOptions();
  this.loadStats();
}

onStatsMonthSelectionChange(): void {
  this.statsMonthInput = `${this.statsSelectedYear}-${String(this.statsSelectedMonth).padStart(2, '0')}`;
  this.onStatsMonthChange();
}

onStatsWeekChange(): void {
  this.loadStats();
}

onStatsDateChange(): void {
  this.syncStatsMonthWithDate();
  this.loadStats();
}

loadStats(): void {
  if (this.statsMode === 'day') {
    if (!this.statsDateInput) return;
    const baseDate = new Date(this.statsDateInput + 'T12:00:00');
    if (isNaN(baseDate.getTime())) return;
    const day = this.formatDateInputValue(baseDate);
    this.fetchStatsByRange(day, day);
    return;
  }

  if (this.statsMode === 'week') {
    if (!this.statsMonthInput) return;
    this.refreshStatsWeekOptions();
    const selectedWeek = this.statsWeekOptions[this.statsSelectedWeekIndex];
    if (!selectedWeek) return;
    this.fetchStatsByRange(selectedWeek.from, selectedWeek.to);
    return;
  }

  if (!this.statsMonthInput) return;
  const baseDate = this.parseMonthInput(this.statsMonthInput);
  if (!baseDate) return;
  const { from, to } = this.getMonthRange(baseDate);
  this.fetchStatsByRange(from, to);
}

private fetchStatsByRange(from: string, to: string): void {
  this.isLoadingStats = true;
  this.cdr.markForCheck();
  this.autolavadoService.getServiceHistoryByDateRange(from, to).pipe(
    map(historyServices => this.mergeStatsServices(
      historyServices,
      this.rangeIncludesToday(from, to) ? this.buildLiveStatsServices(from, to) : []
    )),
    takeUntil(this.destroy$)
  ).subscribe({
    next: services => {
      this.statsClients = services;
      this.statsCurrentPage = 1;
      this.isLoadingStats = false;
      this.cdr.markForCheck();
    },
    error: () => {
      this.statsClients = [];
      this.statsCurrentPage = 1;
      this.isLoadingStats = false;
      this.cdr.markForCheck();
    }
  });
}

private rangeIncludesToday(from: string, to: string): boolean {
  const today = this.formatDateInputValue(new Date());
  return from <= today && today <= to;
}

private buildLiveStatsServices(from: string, to: string): HistoricalService[] {
  const rangeStart = new Date(`${from}T00:00:00`).getTime();
  const rangeEnd = new Date(`${to}T23:59:59`).getTime();

  return Object.values(this.clients || {})
    .filter(client => {
      const entryTs = this.toTimestamp(client.entryTimestamp);
      if (!entryTs || entryTs < rangeStart || entryTs > rangeEnd) {
        return false;
      }

      const space = this.spaces[client.spaceKey || ''];
      return !!space?.occupied;
    })
    .map(client => ({
      id: Number(client.id) || 0,
      sourceClientId: Number(client.id) || undefined,
      code: client.code || '',
      name: client.name || '',
      dni: client.dni || '',
      phoneIntl: client.phoneIntl || '',
      phoneRaw: client.phoneRaw || '',
      plate: client.plate || '',
      notes: client.notes || '',
      spaceKey: client.spaceKey || '',
      vehicle: client.vehicle || '',
      category: client.category || '',
      price: client.price || 0,
      paymentMethod: client.paymentMethod || '',
      clover: client.clover ?? null,
      entryTimestamp: this.toTimestamp(client.entryTimestamp),
      exitTimestamp: this.toTimestamp(client.exitTimestamp),
      serviceDate: from,
      archivedBy: 'LIVE'
    }));
}

private mergeStatsServices(historyServices: HistoricalService[], liveServices: HistoricalService[]): HistoricalService[] {
  const merged = new Map<string, HistoricalService>();

  for (const service of [...(historyServices || []), ...(liveServices || [])]) {
    const key = [
      service.sourceClientId ?? service.id ?? 'anon',
      service.entryTimestamp ?? 0,
      (service.vehicle || '').trim().toLowerCase(),
      (service.plate || '').trim().toLowerCase()
    ].join('|');

    const previous = merged.get(key);
    merged.set(key, {
      ...(previous || {}),
      ...service
    });
  }

  return Array.from(merged.values()).sort((a, b) => {
    const aTs = a.entryTimestamp || a.exitTimestamp || 0;
    const bTs = b.entryTimestamp || b.exitTimestamp || 0;
    return bTs - aTs;
  });
}


get statsTotalCobrado(): number {
  return this.statsClients.reduce((sum, c) => sum + (c.price || 0), 0);
}

get statsPaymentBreakdown(): { method: string; count: number; amount: number }[] {
  const map = new Map<string, { count: number; amount: number }>();
  for (const c of this.statsClients) {
    const method = c.paymentMethod || 'otros';
    const cur = map.get(method) || { count: 0, amount: 0 };
    cur.count++;
    cur.amount += c.price || 0;
    map.set(method, cur);
  }
  return Array.from(map.entries())
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.count - a.count);
}

formatEntryDate(ts: any): string {
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

get paginatedStatsClients(): HistoricalService[] {
  const start = (this.statsCurrentPage - 1) * this.statsPageSize;
  return this.statsClients.slice(start, start + this.statsPageSize);
}

get statsTotalPages(): number {
  return Math.max(1, Math.ceil(this.statsClients.length / this.statsPageSize));
}

get statsPageNumbers(): number[] {
  const total = this.statsTotalPages;
  const current = this.statsCurrentPage;
  const maxPages = 5;
  let start = Math.max(1, current - Math.floor(maxPages / 2));
  let end = Math.min(total, start + maxPages - 1);

  if (end - start + 1 < maxPages) {
    start = Math.max(1, end - maxPages + 1);
  }

  const pages: number[] = [];
  for (let page = start; page <= end; page++) {
    pages.push(page);
  }
  return pages;
}

setStatsPage(page: number): void {
  if (page < 1 || page > this.statsTotalPages) {
    return;
  }
  this.statsCurrentPage = page;
  this.cdr.markForCheck();
}

get statsPeriodLabel(): string {
  if (this.statsMode === 'day') {
    if (!this.statsDateInput) return '';
    const baseDate = new Date(this.statsDateInput + 'T12:00:00');
    if (isNaN(baseDate.getTime())) return '';
    return baseDate.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  if (this.statsMode === 'week') {
    return this.statsWeekOptions[this.statsSelectedWeekIndex]?.label || '';
  }

  const baseDate = this.parseMonthInput(this.statsMonthInput);
  if (!baseDate) return '';
  return baseDate.toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric'
  });
}

get statsDayMinDate(): string {
  const monthBase = this.parseMonthInput(this.statsMonthInput);
  if (!monthBase) return '';
  return this.getMonthRange(monthBase).from;
}

get statsDayMaxDate(): string {
  const monthBase = this.parseMonthInput(this.statsMonthInput);
  if (!monthBase) return '';
  return this.getMonthRange(monthBase).to;
}

private getWeekRange(baseDate: Date, includeDates = false): { from: string; to: string; fromDate?: Date; toDate?: Date } {
  const dayOfWeek = baseDate.getDay();
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const range: { from: string; to: string; fromDate?: Date; toDate?: Date } = {
    from: this.formatDateInputValue(monday),
    to: this.formatDateInputValue(sunday)
  };

  if (includeDates) {
    range.fromDate = monday;
    range.toDate = sunday;
  }

  return range;
}

private refreshStatsWeekOptions(): void {
  const baseDate = this.parseMonthInput(this.statsMonthInput);
  if (!baseDate) {
    this.statsWeekOptions = [];
    this.statsSelectedWeekIndex = 0;
    return;
  }

  const nextOptions = this.buildWeekOptionsForMonth(baseDate);
  const previous = this.statsWeekOptions[this.statsSelectedWeekIndex];
  this.statsWeekOptions = nextOptions;

  if (!nextOptions.length) {
    this.statsSelectedWeekIndex = 0;
    return;
  }

  if (previous) {
    const matchedIndex = nextOptions.findIndex(option => option.from === previous.from && option.to === previous.to);
    if (matchedIndex >= 0) {
      this.statsSelectedWeekIndex = matchedIndex;
      return;
    }
  }

  const currentMonthKey = this.formatMonthInputValue(new Date());
  if (this.statsMonthInput === currentMonthKey) {
    const today = this.formatDateInputValue(new Date());
    const currentWeekIndex = nextOptions.findIndex(option => option.from <= today && option.to >= today);
    this.statsSelectedWeekIndex = currentWeekIndex >= 0 ? currentWeekIndex : 0;
    return;
  }

  this.statsSelectedWeekIndex = 0;
}

private ensureStatsDateInsideSelectedMonth(): void {
  const monthBase = this.parseMonthInput(this.statsMonthInput);
  if (!monthBase) return;

  const { from, to } = this.getMonthRange(monthBase);
  if (!this.statsDateInput || this.statsDateInput < from || this.statsDateInput > to) {
    const today = this.formatDateInputValue(new Date());
    this.statsDateInput = today >= from && today <= to ? today : from;
  }
}

private syncStatsMonthWithDate(): void {
  if (!this.statsDateInput) return;
  const selectedDate = new Date(this.statsDateInput + 'T12:00:00');
  if (isNaN(selectedDate.getTime())) return;
  this.statsMonthInput = this.formatMonthInputValue(selectedDate);
  this.syncStatsSelectorsFromMonthInput();
  this.refreshStatsWeekOptions();
}

private syncStatsSelectorsFromMonthInput(): void {
  const parsed = this.parseMonthInput(this.statsMonthInput);
  if (!parsed) return;
  this.statsSelectedYear = parsed.getFullYear();
  this.statsSelectedMonth = parsed.getMonth() + 1;
}

private buildWeekOptionsForMonth(baseDate: Date): StatsWeekOption[] {
  const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const monthEnd = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  const options: StatsWeekOption[] = [];
  const labelFormatter = (value: Date) => value.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short'
  });

  let cursor = new Date(monthStart);
  while (cursor <= monthEnd) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekStart.getDate() + 6);
    if (weekEnd > monthEnd) {
      weekEnd.setTime(monthEnd.getTime());
    }

    options.push({
      label: `${labelFormatter(weekStart)} - ${labelFormatter(weekEnd)} ${weekEnd.getFullYear()}`,
      from: this.formatDateInputValue(weekStart),
      to: this.formatDateInputValue(weekEnd)
    });

    cursor = new Date(weekEnd);
    cursor.setDate(cursor.getDate() + 1);
  }

  return options;
}

private getMonthRange(baseDate: Date): { from: string; to: string } {
  const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const monthEnd = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);

  return {
    from: this.formatDateInputValue(monthStart),
    to: this.formatDateInputValue(monthEnd)
  };
}

private formatDateInputValue(date: Date): string {
  return date.toISOString().split('T')[0];
}

private formatMonthInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

private parseMonthInput(monthValue: string): Date | null {
  if (!monthValue) return null;
  const parsed = new Date(`${monthValue}-01T12:00:00`);
  return isNaN(parsed.getTime()) ? null : parsed;
}

get statsYearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  const minYear = Math.min(currentYear - 3, this.statsSelectedYear);
  const maxYear = Math.max(currentYear + 1, this.statsSelectedYear + 1);
  const years: number[] = [];

  for (let year = maxYear; year >= minYear; year--) {
    years.push(year);
  }

  return years;
}



get totalRankingPages(): number {
  return Math.max(1, Math.ceil(this.rankingList.length / this.rankingPageSize));
}

get paginatedRankingPreview(): RankingClienteView[] {
  const start = (this.currentRankingPage - 1) * this.rankingPageSize;
  return this.rankingList.slice(start, start + this.rankingPageSize);
}

setRankingPage(page: number): void {
  if (page >= 1 && page <= this.totalRankingPages) {
    this.currentRankingPage = page;
  }
}

get rankingPageNumbers(): number[] {
  const total = this.totalRankingPages;
  const current = this.currentRankingPage;
  const maxPages = 7;
  let start = Math.max(1, current - Math.floor(maxPages / 2));
  let end = Math.min(total, start + maxPages - 1);

  if (end - start + 1 < maxPages) {
    start = Math.max(1, end - maxPages + 1);
  }

  const pages: number[] = [];
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  return pages;
}




isToday(startTime: number | null): boolean {
  if (!startTime) return false;
  const date = new Date(startTime);
  const today = new Date();
  return date.getDate() === today.getDate() &&
         date.getMonth() === today.getMonth() &&
         date.getFullYear() === today.getFullYear();
}

get todaysClients(): Client[] {
  return this.filteredClients.filter(client => {
    const space = this.spaces[client.spaceKey];
    return space && space.occupied && this.isToday(space.startTime);
  });
}

get activeTodaysClients(): Client[] {
  return this.filteredClients.filter(client => {
    const space = this.spaces[client.spaceKey];
    return space && space.occupied && this.isToday(space.startTime);
  });
}

get paginatedTodaysClients(): Client[] {
  const start = (this.currentPageToday - 1) * this.pageSizeToday;
  return this.todaysClients.slice(start, start + this.pageSizeToday);
}



getAverageServicePrice(): number {
  if (this.dailyClients.length === 0) return 0;
  return Math.round(this.dailyTotalCobrado / this.dailyClients.length);
}

get totalPagesToday(): number {
  return Math.ceil(this.todaysClients.length / this.pageSizeToday);
}

setPageToday(page: number): void {
  if (page >= 1 && page <= this.totalPagesToday) {
    this.currentPageToday = page;
  }
}

todayDate(): string {
  return new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

get pageNumbersToday(): number[] {
  const total = this.totalPagesToday;
  const current = this.currentPageToday;
  const maxPages = 5;
  let start = Math.max(1, current - Math.floor(maxPages / 2));
  let end = Math.min(total, start + maxPages - 1);
  if (end - start + 1 < maxPages) {
    start = Math.max(1, end - maxPages + 1);
  }
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);
  return pages;
}


get pageNumbersDaily(): number[] {
  const total = this.totalPagesDaily;
  const current = this.currentPageDaily;
  const maxPages = 5;
  let start = Math.max(1, current - Math.floor(maxPages / 2));
  let end = Math.min(total, start + maxPages - 1);

  if (end - start + 1 < maxPages) {
    start = Math.max(1, end - maxPages + 1);
  }

  const pages: number[] = [];
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  return pages;
}



setPageDaily(page: number): void {
  const totalPages = this.totalPagesDaily;

  if (page < 1 || page > totalPages) return;

  this.currentPageDaily = page;
  this.applyDailyClientFiltersAndPagination();
}




private showEditClientHeaderMessage(message: string): void {
  this.editClientHeaderMessage = message;
  if (this.editClientHeaderTimer) {
    clearTimeout(this.editClientHeaderTimer);
  }
  this.editClientHeaderTimer = setTimeout(() => {
    this.editClientHeaderMessage = '';
    this.editClientHeaderTimer = null;
    this.closeEditClient();
  }, 3000);
}




getPaymentColor(clientId: string | number | undefined): string | null {
  if (!clientId) return null;
  const idStr = clientId.toString();
  return this.paymentColorsByClientId[idStr] || null;
}


getPaymentRowStyle(client: Client): { backgroundColor: string } {
  if (!client?.id) {
    //console.log('getPaymentRowStyle: sin client o id â†’ default');
    return { backgroundColor: '#34495e' };
  }

  const idStr = client.id.toString();
  const savedColor = this.paymentColorsByClientId[idStr];
  const method = (client.paymentMethod || '').trim().toLowerCase();

  //console.log(`getPaymentRowStyle para ID ${idStr}: mÃ©todo = "${method}", color guardado = ${savedColor || 'ninguno'}`);

  // Prioridad 1: color persistente
  if (savedColor) {
   // console.log(`â†’ Usando color persistente: ${savedColor}`);
    return { backgroundColor: savedColor };
  }

  // Prioridad 2: color segÃºn mÃ©todo actual
  const colors = this.paymentMethodColors;
  const color = colors[method] || '#34495e';
  //console.log(`â†’ Usando color por mÃ©todo "${method}": ${color}`);

  return { backgroundColor: color };
}


acceptEditClient(): void {
  console.log('BotÃ³n Guardar cambios pulsado');

  if (!this.editingClient) return;

  const clientId = this.editingClient.id;
  if (!clientId) {
    this.showErrorToast('Error: cliente sin ID');
    return;
  }

  // ValidaciÃ³n Clover
  if (this.editForm.clover && !/^\d{4}$/.test(this.editForm.clover)) {
    this.toastService.showWarning('El codigo Clover debe tener exactamente 4 digitos numericos.');
    return;
  }

  const updatedData = {
    price: this.editForm.valor,
    code: this.editForm.clave || null,
    clover: this.editForm.clover ? parseInt(this.editForm.clover, 10) : null,
    paymentMethod: this.editForm.metodoPago
    // <-- eliminar vehicleType (ya no existe en backend)
  };

  console.log('Payload enviado al backend:', updatedData);

  this.autolavadoService.updateClientInBackend(clientId, updatedData).pipe(takeUntil(this.destroy$)).subscribe({
    next: (updatedClient) => {
      console.log('Cliente actualizado:', updatedClient);

      const clientsMap = this.autolavadoService.clientsSubject.value;
      const clientKey = clientId.toString();
      if (clientsMap[clientKey]) {
        clientsMap[clientKey].price = updatedClient.price;
        clientsMap[clientKey].code = updatedClient.code;
        clientsMap[clientKey].paymentMethod = updatedClient.paymentMethod;
        clientsMap[clientKey].clover = updatedClient.clover;
        this.autolavadoService.clientsSubject.next({ ...clientsMap });
        this.autolavadoService.saveAll();
      }

      const method = updatedClient.paymentMethod?.trim().toLowerCase() || '';
      if (method && this.paymentMethodColors[method]) {
        this.paymentColorsByClientId[clientId.toString()] = this.paymentMethodColors[method];
        console.log(`Color persistente GUARDADO para ${clientId}: ${this.paymentMethodColors[method]}`);
      } else {
        delete this.paymentColorsByClientId[clientId.toString()];
        console.log(`Color eliminado para ${clientId} (mÃ©todo vacÃ­o)`);
      }
      this.savePaymentColors();

      this.calculateStats();
      this.cdr.markForCheck();

      this.showEditClientHeaderMessage('Datos actualizados correctamente');
    },
    error: (err) => {
      console.error('Error al actualizar:', err);
      this.showErrorToast('Error al actualizar');
    }
  });
}



isCloverInvalid(): boolean {
  const clover = this.editForm.clover;
  if (!clover) return false;
  return clover.toString().length !== 4 || !/^\d{4}$/.test(clover.toString());
}

isClientPaid(client: Client): boolean {
  const paymentMethod = (client.paymentMethod || '').toString().trim();
  const hasPaymentMethod = paymentMethod.length > 0;

  if (client.clover === null || client.clover === undefined) {
    return false;
  }

  const cloverRaw = client.clover.toString().trim();
  const cloverNormalized = /^\d+$/.test(cloverRaw) ? cloverRaw.padStart(4, '0') : cloverRaw;
  const hasValidClover = /^\d{4}$/.test(cloverNormalized);

  return hasPaymentMethod && hasValidClover;
}



  closeEditClient(): void {
  this.isEditClientOpen = false;
  this.editingClient = null;

  // Reset limpio
  this.editForm = {
    valor: 0,
    clave: '',
    clover: '',
    metodoPago: 'efectivo'
  };
}


private calculateStats(): void {
  const spacesArray = Object.values(this.spaces || {});
  const dailyClients = this.dailyClients || [];
  const now = Date.now();

  console.log('[Reports.calculateStats] Inicio', {
    spaces: spacesArray.length,
    subsuelos: this.subsuelos?.length || 0,
    dailyClients: dailyClients.length
  });

  // -----------------------------
  // 1) EstadÃ­sticas generales + por subsuelo (una sola pasada en spaces)
  // -----------------------------
  let occupiedCount = 0;

  const subsueloAccumulator: Record<string, { total: number; occupied: number }> = {};
  for (const sub of this.subsuelos || []) {
    subsueloAccumulator[sub.id] = { total: 0, occupied: 0 };
  }

  for (const space of spacesArray) {
    if (space.occupied) occupiedCount++;

    const subId = space.subsueloId;
    if (!subId) continue;

    if (!subsueloAccumulator[subId]) {
      subsueloAccumulator[subId] = { total: 0, occupied: 0 };
    }

    subsueloAccumulator[subId].total += 1;
    if (space.occupied) {
      subsueloAccumulator[subId].occupied += 1;
    }
  }

  this.totalSpaces = spacesArray.length;
  this.occupiedSpaces = occupiedCount;
  this.freeSpaces = this.totalSpaces - this.occupiedSpaces;
  this.occupancyRate =
    this.totalSpaces > 0
      ? Math.round((this.occupiedSpaces / this.totalSpaces) * 100)
      : 0;

  this.subsueloStats = (this.subsuelos || []).map(sub => {
    const acc = subsueloAccumulator[sub.id] || { total: 0, occupied: 0 };
    const free = acc.total - acc.occupied;
    const occupancyRate = acc.total > 0 ? Math.round((acc.occupied / acc.total) * 100) : 0;

    return {
      id: sub.id,
      label: sub.label,
      total: acc.total,
      occupied: acc.occupied,
      free,
      occupancyRate
    };
  });

  // -----------------------------
  // 2) EstadÃ­sticas del dÃ­a (una sola pasada en dailyClients)
  // -----------------------------
  let totalCobrado = 0;

  const paymentCounts = {
    efectivo: 0,
    credito: 0,
    prepago: 0,
    qr: 0,
    otros: 0
  };

  const nextTimeStats = {
    under1h: 0,
    between1h3h: 0,
    over3h: 0
  };

  for (const c of dailyClients) {
    totalCobrado += Number(c.price || 0);

    const method = ((c.paymentMethod || 'otros') as string).toString().trim().toLowerCase();
    if (method === 'efectivo' || method === 'credito' || method === 'prepago' || method === 'qr') {
      paymentCounts[method]++;
    } else {
      paymentCounts.otros++;
    }

    const entryTs = this.toTimestamp(c.entryTimestamp);
    if (entryTs !== null) {
      const elapsedMs = now - entryTs;
      const elapsedHours = elapsedMs / 3600000;

      if (elapsedHours < 1) nextTimeStats.under1h++;
      else if (elapsedHours <= 3) nextTimeStats.between1h3h++;
      else nextTimeStats.over3h++;
    }
  }

  this.dailyTotalCobrado = totalCobrado;

  const totalServices = dailyClients.length;
  const pct = (count: number) => (totalServices > 0 ? Math.round((count / totalServices) * 100) : 0);

  this.paymentStats = {
    efectivo: { count: paymentCounts.efectivo, pct: pct(paymentCounts.efectivo) },
    credito: { count: paymentCounts.credito, pct: pct(paymentCounts.credito) },
    prepago: { count: paymentCounts.prepago, pct: pct(paymentCounts.prepago) },
    qr: { count: paymentCounts.qr, pct: pct(paymentCounts.qr) },
    otros: { count: paymentCounts.otros, pct: pct(paymentCounts.otros) }
  };

  this.timeStats = nextTimeStats;

  console.log('[Reports.calculateStats] Resultado', {
    totalSpaces: this.totalSpaces,
    occupiedSpaces: this.occupiedSpaces,
    freeSpaces: this.freeSpaces,
    occupancyRate: this.occupancyRate,
    dailyTotalCobrado: this.dailyTotalCobrado,
    paymentStats: this.paymentStats,
    timeStats: this.timeStats,
    subsueloStats: this.subsueloStats
  });
}

openEditClient(client: Client): void {
  this.editingClient = client;

  this.editForm = {
    valor: client.price || 0,
    clave: client.code || '',
    clover: client.clover ? client.clover.toString().padStart(4, '0') : '',
    metodoPago: (client.paymentMethod as 'efectivo' | 'credito' | 'prepago' | 'qr') || 'efectivo'
  };

  this.isEditClientOpen = true;
}



  getProgressBarClass(rate: number): string {
    if (rate < 50) return 'bg-success';
    if (rate < 80) return 'bg-warning';
    return 'bg-danger';
  }

  getElapsedTime(spaceKey: string): string {
    const space = this.spaces[spaceKey];
    return this.autolavadoService.elapsedFrom(space?.startTime);
  }



onSearchClients(): void {
  this.currentPageDaily = 1;
  this.applyDailyClientFiltersAndPagination();
}


  get paginatedClients(): Client[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredClients.slice(start, start + this.pageSize);
  }


get filteredDailyClients(): Client[] {
  return this.filteredDailyClientsList || [];
}


get totalPagesDaily(): number {
  return Math.max(1, Math.ceil((this.filteredDailyClientsList?.length || 0) / this.pageSizeDaily));
}


get paginatedDailyClients(): Client[] {
  return this.paginatedDailyClientsList || [];
}

  get totalPages(): number {
    return Math.ceil(this.filteredClients.length / this.pageSize);
  }



getElapsedTimeForClient(client: Client): string {
  if (!client.entryTimestamp) return 'N/A';

  // Convertir a number si es string (del backend)
  let entryTime: number;
  if (typeof client.entryTimestamp === 'string') {
    entryTime = new Date(client.entryTimestamp).getTime();
  } else {
    entryTime = client.entryTimestamp;
  }

  if (isNaN(entryTime)) return 'N/A';  // Seguridad extra

  const ms = Date.now() - entryTime;
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const min = mins % 60;

  return hours > 0 ? `${hours}h ${min}m` : `${min}m`;
}




  get pageNumbers(): number[] {
    const total = this.totalPages;
    const current = this.currentPage;
    const maxPages = 5;
    let start = Math.max(1, current - Math.floor(maxPages / 2));
    let end = Math.min(total, start + maxPages - 1);

    if (end - start + 1 < maxPages) {
      start = Math.max(1, end - maxPages + 1);
    }

    const pages: number[] = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  setPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  refreshStats(): void {
    this.calculateStats();
  }

  exportData(): void {
    const data = {
      timestamp: new Date().toISOString(),
      subsuelos: this.subsuelos,
      spaces: this.spaces,
      clients: this.clients,
      stats: {
        total: this.totalSpaces,
        occupied: this.occupiedSpaces,
        free: this.freeSpaces,
        occupancyRate: this.occupancyRate
      }
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `exellssior_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }




saveScheduledTime(): void {
  const normalizedTime = (this.scheduledTime || '').trim();
  const normalizedServerTime = this.localTimeToServerTime(normalizedTime);
  const payload: ReportScheduleConfig = {
    enabled: !!normalizedServerTime,
    dailySnapshotTime: normalizedServerTime || null,
    lastSnapshotDay: null
  };

  console.log('%c[REPORT-SCHEDULE][FRONT] Guardando programacion', 'color:#38bdf8;font-weight:bold;', {
    localTimeSelected: normalizedTime || null,
    serverTimeSent: normalizedServerTime || null,
    serverZone: this.reportServerTimeZone,
    browserTime: new Date().toISOString()
  });

  this.reportsApi.updateScheduleConfig(payload).pipe(takeUntil(this.destroy$)).subscribe({
    next: (config) => {
      this.applyScheduleConfig(config, 'save');
      if (config.enabled && config.dailySnapshotTime) {
        this.showSuccessToast(`Reporte automatico programado para las ${this.scheduledTime} de tu hora local.`);
      } else {
        this.showWarningToast('Programacion automatica desactivada.');
      }
    },
    error: (error) => {
      console.error('Error guardando configuracion de reporte automatico', error);
      this.showErrorToast('No se pudo guardar la programacion automatica en el servidor.');
    }
  });
}

private loadReportScheduleConfig(source: 'init' | 'poll' | 'save' = 'init'): void {
  this.reportsApi.getScheduleConfig().pipe(takeUntil(this.destroy$)).subscribe({
    next: (config) => {
      this.applyScheduleConfig(config, source);
    },
    error: (error) => {
      console.error('Error cargando configuracion de reporte automatico', error);
    }
  });
}

private applyScheduleConfig(config: ReportScheduleConfig | null | undefined, source: 'init' | 'poll' | 'save'): void {
  const previousTime = this.scheduledTime || '';
  const previousLastDay = this.lastScheduledSnapshotDay || '';

  this.scheduledTimeServer = config?.dailySnapshotTime || '';
  this.scheduledTime = this.serverTimeToLocalTime(this.scheduledTimeServer) || '';
  this.lastScheduledSnapshotDay = config?.lastSnapshotDay || '';

  console.log('[REPORT-SCHEDULE][FRONT]', {
    source,
    enabled: !!config?.enabled,
    scheduledTimeLocal: this.scheduledTime || null,
    scheduledTimeServer: this.scheduledTimeServer || null,
    serverZone: this.reportServerTimeZone,
    lastSnapshotDay: this.lastScheduledSnapshotDay || null,
    browserTime: new Date().toISOString()
  });

  if (source === 'poll' && this.lastScheduledSnapshotDay && this.lastScheduledSnapshotDay !== previousLastDay) {
    console.log('%c[REPORT-SCHEDULE][FRONT] Snapshot automatico detectado en backend', 'color:#22c55e;font-weight:bold;', {
      scheduledTimeLocal: this.scheduledTime || null,
      scheduledTimeServer: this.scheduledTimeServer || null,
      lastSnapshotDay: this.lastScheduledSnapshotDay
    });
  }

  if (source === 'save' && previousTime !== this.scheduledTime) {
    const nextRun = this.computeNextScheduledRunLabel(this.scheduledTime);
    console.log('%c[REPORT-SCHEDULE][FRONT] Programacion actualizada con conversion local->servidor.', 'color:#f59e0b;font-weight:bold;', {
      previousTime: previousTime || null,
      newTimeLocal: this.scheduledTime || null,
      newTimeServer: this.scheduledTimeServer || null,
      lastSnapshotDay: this.lastScheduledSnapshotDay || null,
      nextExpectedRun: nextRun
    });
  }

  this.cdr.markForCheck();
}

private computeNextScheduledRunLabel(rawTime: string | null | undefined): string | null {
  const value = (rawTime || '').trim();
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hour, minute] = value.split(':').map(Number);
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setSeconds(0, 0);
  nextRun.setHours(hour, minute, 0, 0);

  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  return nextRun.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

private localTimeToServerTime(localTime: string | null | undefined): string | null {
  const value = (localTime || '').trim();
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hour, minute] = value.split(':').map(Number);
  const localCandidate = new Date();
  localCandidate.setHours(hour, minute, 0, 0);

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: this.reportServerTimeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(localCandidate);
}

private serverTimeToLocalTime(serverTime: string | null | undefined): string | null {
  const value = (serverTime || '').trim();
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hour, minute] = value.split(':').map(Number);
  const now = new Date();
  const serverDateParts = this.getDatePartsForTimeZone(now, this.reportServerTimeZone);
  const utcGuess = Date.UTC(serverDateParts.year, serverDateParts.month - 1, serverDateParts.day, hour, minute, 0, 0);
  const serverOffset = this.getTimeZoneOffsetMinutes(new Date(utcGuess), this.reportServerTimeZone);
  const instant = new Date(utcGuess - serverOffset * 60000);

  return `${String(instant.getHours()).padStart(2, '0')}:${String(instant.getMinutes()).padStart(2, '0')}`;
}

private getDatePartsForTimeZone(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(date);
  return {
    year: Number(parts.find(part => part.type === 'year')?.value || date.getFullYear()),
    month: Number(parts.find(part => part.type === 'month')?.value || date.getMonth() + 1),
    day: Number(parts.find(part => part.type === 'day')?.value || date.getDate())
  };
}

private getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);
  const hour = Number(parts.find(part => part.type === 'hour')?.value);
  const minute = Number(parts.find(part => part.type === 'minute')?.value);
  const second = Number(parts.find(part => part.type === 'second')?.value);
  const utcTime = Date.UTC(year, month - 1, day, hour, minute, second);

  return (utcTime - date.getTime()) / 60000;
}





private shouldRefreshLiveStats(): boolean {
  const spacesArray = Object.values(this.spaces || {});
  if (spacesArray.some(space => !!space?.occupied && !!space?.startTime)) {
    return true;
  }

  return (this.dailyClients || []).some(client => this.toTimestamp(client?.entryTimestamp) !== null);
}

private applyDailyClientFiltersAndPagination(): void {
  const source = this.dailyClients || [];
  const rawTerm = (this.searchTerm || '').toString().trim().toLowerCase();

  let filtered: Client[];

  if (!rawTerm) {
    filtered = [...source];
  } else {
    filtered = source.filter(client =>
      (client.name?.toLowerCase().includes(rawTerm)) ||
      (client.code?.toLowerCase().includes(rawTerm)) ||
      (client.phoneIntl?.includes(rawTerm)) ||
      (client.vehicle?.toLowerCase().includes(rawTerm)) ||
      (client.plate?.toLowerCase().includes(rawTerm)) ||
      (client.dni?.includes(rawTerm))
    );
  }

  this.filteredDailyClientsList = filtered;

  const totalPages = Math.max(1, Math.ceil(filtered.length / this.pageSizeDaily));

  // Ajustar pÃ¡gina actual si quedÃ³ fuera de rango
  if (this.currentPageDaily > totalPages) {
    this.currentPageDaily = totalPages;
  }
  if (this.currentPageDaily < 1) {
    this.currentPageDaily = 1;
  }

  const start = (this.currentPageDaily - 1) * this.pageSizeDaily;
  const end = start + this.pageSizeDaily;

  this.paginatedDailyClientsList = filtered.slice(start, end);

  console.log('[Reports] applyDailyClientFiltersAndPagination', {
    source: source.length,
    searchTerm: this.searchTerm,
    filtered: this.filteredDailyClientsList.length,
    currentPageDaily: this.currentPageDaily,
    pageSizeDaily: this.pageSizeDaily,
    paginated: this.paginatedDailyClientsList.length,
    totalPages
  });
}


generateAndSaveReport(isManual: boolean = false): void {
  if (!isManual) {
    this.executeGenerateAndSaveReport(false);
    return;
  }
  void this.generateAndSaveReportWithConfirm(isManual);
}

private async generateAndSaveReportWithConfirm(isManual: boolean): Promise<void> {
  const servicesCount = (this.dailyClients || []).length;
  const confirmed = await this.confirmService.confirm({
    title: isManual ? 'Generar reporte diario' : 'Generar snapshot diario',
    message: isManual
      ? `Se generara un reporte diario manual con ${servicesCount} servicio(s) registrados hoy. Deseas continuar?`
      : `Se generara un snapshot diario automatico con ${servicesCount} servicio(s) registrados hoy. Deseas continuar?`,
    confirmText: isManual ? 'Generar reporte' : 'Generar snapshot',
    cancelText: 'Cancelar',
    variant: 'warning'
  });

  if (!confirmed) {
    this.showInfoToast('Generacion del reporte diario cancelada.');
    return;
  }

  this.executeGenerateAndSaveReport(isManual);
}

private executeGenerateAndSaveReport(isManual: boolean = false): void {
  const type = isManual ? 'MANUAL' : 'AUTOMATICO';
  console.log(`%cINICIANDO GENERACION DE REPORTE ${type}`, 'color: #0ea5e9; font-weight: bold;');

  const clientsForReport = this.dailyClients || [];
  const enrichedClients = this.enrichClientsForReport(clientsForReport);

  // âœ… periodKey local (evita problemas UTC cerca de medianoche)
  const now = new Date();
  //const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const periodKey = this.getLocalPeriodKey();

  console.log('[DIARIO] generateAndSaveReport input', {
    type,
    periodKey,
    currentDailyClients: clientsForReport.length,
    enrichedClients: enrichedClients.length
  });

  this.reportsApi.getAll().pipe(
    map((reports) => (reports || []).filter(r => this.isSameDailyReportByPeriodKey(r, periodKey))),
    switchMap((existingDailyReports) => {
      const existingClients = existingDailyReports.flatMap(r => this.parseJsonArraySafe(r.filteredClients));
      const mergedClients = this.mergeAndDedupDailyReportClients(existingClients, enrichedClients);

      console.log('[DIARIO] merge resultado', {
        periodKey,
        existingReports: existingDailyReports.length,
        existingClients: existingClients.length,
        currentClients: enrichedClients.length,
        mergedClients: mergedClients.length,
        existingReportIds: existingDailyReports.map(r => r.id)
      });

      // Si no hay nada para reportar ni antes ni ahora
      if (!mergedClients.length) {
        if (isManual) this.toastService.showInfo('No hay clientes para generar el reporte del dia.');
        return of(null);
      }

      // Construir payload consolidado del dÃ­a (pero NO final)
      const reportData: any = this.buildDailyReportPayloadMerged(mergedClients, periodKey);
      reportData.dailyFinal = false; // âœ… manual/auto intermedio

      console.log('[DIARIO] payload consolidado (dailyFinal=false):', reportData);

      // Borrar diarios previos del mismo dÃ­a y recrear consolidado Ãºnico
      const deleteCalls = existingDailyReports.map(r =>
        this.reportsApi.delete(r.id).pipe(
          catchError((err) => {
            console.warn('[DIARIO] Error borrando reporte diario previo', { reportId: r.id, err });
            // No aborta; seguimos para no bloquear operaciÃ³n del usuario
            return of(void 0);
          })
        )
      );

      return (deleteCalls.length ? forkJoin(deleteCalls) : of([])).pipe(
        switchMap(() => this.reportsApi.create(reportData)),
        map((savedReport) => ({ savedReport, reportData, periodKey }))
      );
    }),
    takeUntil(this.destroy$)
  ).subscribe({
    next: (result) => {
      if (!result) return;

      const { savedReport, reportData, periodKey } = result;

      const detailHtml = this.autolavadoService.generateReportDetailHtml({
        ...reportData,
        id: savedReport.id,
        timestamp: savedReport.timestamp,
        subsueloStats: reportData.subsueloStats,
        timeStats: reportData.timeStats,
        filteredClients: reportData.filteredClients,
        paymentAmounts: reportData.paymentAmounts,
        totalCobrado: reportData.totalCobrado,
        dailyFinal: false
      } as Report);

      const blob = new Blob([detailHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte_exellsior_${periodKey}_${isManual ? 'manual' : 'automatico'}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showSuccessToast(
        isManual
          ? 'Reporte diario generado/actualizado (consolidado del dÃ­a, no final)'
          : 'Reporte diario automÃ¡tico generado/actualizado (no final)'
      );
    },
    error: (error) => {
      console.error('[DIARIO] Error al generar reporte diario consolidado', error);
      this.showErrorToast('Error al generar el reporte diario');
    }
  });
}

private getLocalPeriodKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}


private isSameDailyReportByPeriodKey(report: Report, periodKey: string): boolean {
  if (!report) return false;

  // Excluir mensuales
  if (report.periodType === 'MONTHLY') return false;

  // Si el reporte ya tiene periodKey, esa es la fuente de verdad.
  if (report.periodKey) {
    return report.periodType === 'DAILY' && report.periodKey === periodKey;
  }

  // Compatibilidad solo para reportes legacy que realmente no tienen periodKey.
  const tsDay = (report.timestamp || '').slice(0, 10);
  return tsDay === periodKey;
}


private mergeAndDedupDailyReportClients(existingClients: any[], currentClients: any[]): any[] {
  const merged = [...(existingClients || []), ...(currentClients || [])];
  const dedup = new Map<string, any>();

  for (const c of merged) {
    const key = this.buildDailyReportClientKey(c);
    const previous = dedup.get(key);
    dedup.set(key, previous ? this.mergeDailyReportClientSnapshots(previous, c) : c);
  }

  const result = Array.from(dedup.values()).sort((a, b) =>
    (this.toEpoch(b?.entryTimestamp) ?? this.toEpoch(b?.exitTimestamp) ?? 0) -
    (this.toEpoch(a?.entryTimestamp) ?? this.toEpoch(a?.exitTimestamp) ?? 0)
  );

  console.log('[DIARIO] mergeAndDedupDailyReportClients', {
    existingClients: existingClients?.length || 0,
    currentClients: currentClients?.length || 0,
    mergedRaw: merged.length,
    deduped: result.length
  });

  return result;
}

private buildDailyReportClientKey(client: any): string {
  const entryTs = this.toEpoch(client?.entryTimestamp);
  const code = this.normalizeSnapshotText(client?.code);
  const dni = this.normalizeSnapshotText(client?.dni);
  const phone = this.normalizeSnapshotDigits(client?.phoneIntl || client?.phoneRaw);
  const name = this.normalizeSnapshotText(client?.name)?.toLowerCase();
  const vehicle = this.normalizeSnapshotText(client?.vehicle)?.toLowerCase();
  const plate = this.normalizeSnapshotText(client?.plate)?.toLowerCase();
  const id = this.normalizeSnapshotText(client?.id);

  if (code || entryTs !== null) {
    return `code:${code ?? 'x'}|entry:${entryTs ?? 'x'}`;
  }

  if (dni || phone || name) {
    return `fallback:${dni ?? 'x'}|${phone ?? 'x'}|${name ?? 'x'}|${entryTs ?? 'x'}|${vehicle ?? 'x'}|${plate ?? 'x'}`;
  }

  return `id:${id ?? 'x'}|entry:${entryTs ?? 'x'}`;
}

private mergeDailyReportClientSnapshots(previous: any, incoming: any): any {
  const merged = { ...(previous || {}) };

  for (const [key, value] of Object.entries(incoming || {})) {
    if (this.isMeaningfulSnapshotValue(value)) {
      merged[key] = value;
    }
  }

  const previousEntry = this.toEpoch(previous?.entryTimestamp);
  const incomingEntry = this.toEpoch(incoming?.entryTimestamp);
  if (incomingEntry !== null || previousEntry !== null) {
    merged.entryTimestamp = incomingEntry ?? previousEntry;
  }

  const previousExit = this.toEpoch(previous?.exitTimestamp);
  const incomingExit = this.toEpoch(incoming?.exitTimestamp);
  if (incomingExit !== null || previousExit !== null) {
    merged.exitTimestamp = incomingExit ?? previousExit;
  }

  return merged;
}

private normalizeSnapshotText(value: any): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'x') {
    return null;
  }
  return text;
}

private normalizeSnapshotDigits(value: any): string | null {
  const text = this.normalizeSnapshotText(value);
  if (!text) return null;
  const digits = text.replace(/\D+/g, '');
  return digits || null;
}

private isMeaningfulSnapshotValue(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return !!trimmed && trimmed.toLowerCase() !== 'null';
  }
  return true;
}


private buildTimeStatsFromReportClients(clients: any[]): { under1h: number; between1h3h: number; over3h: number } {
  const now = Date.now();
  const stats = {
    under1h: 0,
    between1h3h: 0,
    over3h: 0
  };

  (clients || []).forEach((c) => {
    const entryTs = this.toEpoch(c?.entryTimestamp);
    if (entryTs === null) return;

    const hours = (now - entryTs) / 3600000;

    if (hours < 1) stats.under1h++;
    else if (hours <= 3) stats.between1h3h++;
    else stats.over3h++;
  });

  return stats;
}

private buildDailyReportPayloadMerged(mergedClients: any[], periodKey: string) {
  const paymentAmounts = this.buildPaymentAmounts(mergedClients);
  const totalCobrado = Object.values(paymentAmounts).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const mergedTimeStats = this.buildTimeStatsFromReportClients(mergedClients);

  const payload = {
    timestamp: new Date().toISOString(),
    periodType: 'DAILY' as const,
    periodKey,

    // Snapshot del estado actual al momento de generar
    totalSpaces: this.totalSpaces,
    occupiedSpaces: this.occupiedSpaces,
    freeSpaces: this.freeSpaces,
    occupancyRate: this.occupancyRate,
    subsueloStats: JSON.stringify(this.subsueloStats),

    // Recalculados desde servicios fusionados del dÃ­a
    timeStats: JSON.stringify(mergedTimeStats),
    filteredClients: JSON.stringify(mergedClients),
    paymentAmounts: JSON.stringify(paymentAmounts),
    totalCobrado
  };

  console.log('[DIARIO] buildDailyReportPayloadMerged', {
    periodKey,
    mergedClients: mergedClients.length,
    totalCobrado,
    paymentAmounts,
    mergedTimeStats
  });

  return payload;
}


// En reports.component.ts - MÃ©todos de Toast (CORREGIDOS)

showSuccessToast(message: string): void {
  this.toastService.showSuccess(message);
}

showErrorToast(message: string): void {
  this.toastService.showError(message);
}

showWarningToast(message: string): void {
  this.toastService.showWarning(message);
}

showInfoToast(message: string): void {
  this.toastService.showInfo(message);
}

getSpaceByKey(spaceKey: string | null): Space | undefined {
  if (!spaceKey) return undefined;
  return this.autolavadoService.spacesSubject.value[spaceKey];
}



eliminarServicio(client: Client): void {
  void this.eliminarServicioWithGlobalConfirm(client);
}

private async eliminarServicioWithGlobalConfirm(client: Client): Promise<void> {
  const clientName = client.name || 'este cliente';
  const vehicle = client.vehicle ? `(${client.vehicle})` : '';

  const confirmed = await this.confirmService.confirm({
    title: 'Eliminar servicio',
    message:
      `Eliminar definitivamente el servicio de ${clientName} ${vehicle}?\n\n` +
      `Se liberara el espacio si esta ocupado y el registro no se podra recuperar.`,
    confirmText: 'Eliminar servicio',
    cancelText: 'Cancelar',
    variant: 'danger'
  });

  if (!confirmed) {
    return;
  }

  const spaceKey = client.spaceKey;
  const space = this.getSpaceByKey(spaceKey);

  const deleteFromBDAndUpdateUI = () => {
    this.autolavadoService.deleteClientFromBackend(client.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        delete this.paymentColorsByClientId[client.id.toString()];
        this.savePaymentColors();
        this.dailyClients = this.dailyClients.filter(c => c.id !== client.id);
        this.filteredDailyClientsList = this.dailyClients.filter(c => c.id !== client.id);
        this.paginatedDailyClientsList = this.filteredDailyClientsList.slice(
          (this.currentPageDaily - 1) * this.pageSizeDaily,
          (this.currentPageDaily - 1) * this.pageSizeDaily + this.pageSizeDaily
        );
        this.showSuccessToast(`Servicio de ${clientName} eliminado correctamente`);
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error al eliminar cliente', err);
        this.showErrorToast('Error al eliminar el servicio. Intenta de nuevo.');
      }
    });
  };

  if (space && space.occupied) {
    this.autolavadoService.releaseSpace(spaceKey).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => deleteFromBDAndUpdateUI(),
      error: (err) => {
        if (Number(err?.status || 0) === 0) {
          this.showWarningToast('Espacio liberado localmente. Se sincronizara cuando vuelva la conexion.');
          return;
        }

        console.error('Error al liberar espacio', err);
        this.showErrorToast('Error al liberar el espacio. El servicio no se elimino.');
      }
    });
    return;
  }

  deleteFromBDAndUpdateUI();
}




generateReport(): void {
  // Preparar datos para backend
  const reportData = {
    timestamp: new Date().toISOString(),
    totalSpaces: this.totalSpaces,
    occupiedSpaces: this.occupiedSpaces,
    freeSpaces: this.freeSpaces,
    occupancyRate: this.occupancyRate,
    subsueloStats: JSON.stringify(this.subsueloStats), // String JSON
    timeStats: JSON.stringify(this.timeStats), // String JSON
    filteredClients: JSON.stringify(this.filteredClients) // String JSON
  };

  console.log('Enviando reporte al backend:', reportData);

  // POST al backend
  this.reportsApi.create(reportData).pipe(
    catchError(error => {
      console.error('Error saving report to backend', error);
      this.showWarningToast('Reporte descargado localmente, pero hubo un error al guardarlo en backend: ' + error.message);
      return of(null);
    }),
    takeUntil(this.destroy$)
  ).subscribe(response => {
    console.log('Reporte guardado en backend:', response);
  });

  // GeneraciÃ³n y descarga HTML local (tu cÃ³digo original)
  const reportHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte Exellsior - ${new Date().toLocaleString()}</title>
   <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
  <style>
    body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; margin: 20px; }
    h1 { color: #0ea5e9; text-align: center; }
    .section { margin-bottom: 30px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .stat-card { background: #1e293b; padding: 15px; border-radius: 8px; text-align: center; border-left: 4px solid #0ea5e9; }
    .stat-number { font-size: 2em; font-weight: bold; color: #0ea5e9; }
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #334155; }
    th { background: #16213e; font-weight: bold; color: #0ea5e9; }
    tr:hover { background: #2d446a; }
    .progress { background: #374151; border-radius: 4px; height: 20px; overflow: hidden; }
    .progress-bar { height: 100%; line-height: 20px; text-align: center; font-size: 0.875em; }
    .time-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }
    .time-card { background: #1e293b; padding: 15px; border-radius: 8px; text-align: center; border-left: 4px solid #0ea5e9; }
    .time-number { font-size: 1.5em; font-weight: bold; }
    .no-data { text-align: center; color: #94a3b8; font-style: italic; padding: 40px; }
  </style>
</head>
<body>
  <h1>Reporte Exellssior - ${new Date().toLocaleString()}</h1>

  <div class="section">
    <h2>Resumen General</h2>
    <div class="stats">
      <div class="stat-card">
        <div class="stat-number">${this.totalSpaces}</div>
        <div>Total Espacios</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" style="color: #10b981;">${this.occupiedSpaces}</div>
        <div>Ocupados</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" style="color: #3b82f6;">${this.freeSpaces}</div>
        <div>Libres</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" style="color: #f59e0b;">${this.occupancyRate}%</div>
        <div>OcupaciÃ³n</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Detalle por Subsuelo</h2>
    <table>
      <thead>
        <tr>
          <th>Subsuelo</th>
          <th>Total</th>
          <th>Ocupados</th>
          <th>Libres</th>
          <th>% OcupaciÃ³n</th>
        </tr>
      </thead>
      <tbody>
        ${this.subsueloStats.map(stat => `
          <tr>
            <td>${stat.label}</td>
            <td>${stat.total}</td>
            <td><span class="badge bg-danger">${stat.occupied}</span></td>
            <td><span class="badge bg-success">${stat.free}</span></td>
            <td>
              <div class="progress">
                <div class="progress-bar bg-${this.getProgressBarClass(stat.occupancyRate)}" style="width: ${stat.occupancyRate}%">
                  ${stat.occupancyRate}%
                </div>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>DistribuciÃ³n por Tiempo</h2>
    <div class="time-stats">
      <div class="time-card">
        <div class="time-number" style="color: #10b981;">${this.timeStats.under1h}</div>
        <div>Menos de 1h</div>
      </div>
      <div class="time-card">
        <div class="time-number" style="color: #f59e0b;">${this.timeStats.between1h3h}</div>
        <div>1h - 3h</div>
      </div>
      <div class="time-card">
        <div class="time-number" style="color: #ef4444;">${this.timeStats.over3h}</div>
        <div>MÃ¡s de 3h</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Clientes Activos (${this.filteredClients.length})</h2>
    ${this.filteredClients.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>CÃ³digo</th>
            <th>Cliente</th>
            <th>Espacio</th>
            <th>TelÃ©fono</th>
            <th>VehÃ­culo</th>
            <th>Tiempo</th>
          </tr>
        </thead>
        <tbody>
          ${this.filteredClients.map(client => `
            <tr>
              <td><span style="background: #1e293b; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${client.code}</span></td>
              <td>${client.name}</td>
              <td style="color: #3b82f6;">${client.spaceDisplayName}</td>
              <td>+${client.phoneIntl}</td>
              <td>${client.vehicle || '-'}</td>
              <td style="color: #f59e0b;">${this.getElapsedTime(client.spaceKey)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<div class="no-data">No hay clientes actualmente</div>'}
  </div>

  <script>
    // Auto-imprimir al cargar
    window.onload = function() { window.print(); };
  </script>
</body>
</html>
  `;

  const blob = new Blob([reportHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `reporte_exellssior_${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


private toEpoch(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : new Date(value).getTime();
  return isNaN(n) ? null : n;
}



private enrichClientsForReport(clients: Client[]): any[] {
  return clients.map(client => {
    const space = this.spaces[client.spaceKey || ''];
    return {
      ...client,
      startTime: space?.startTime || client.entryTimestamp || null,
      spaceDisplayName: space ? (space.displayName || client.spaceKey) : client.spaceKey || '-'
    };
  });
}

private buildPaymentAmounts(clients: any[]): { [k: string]: number } {
  const paymentAmounts: { [k: string]: number } = {
    efectivo: 0,
    credito: 0,
    prepago: 0,
    qr: 0,
    debito: 0,
    scaneo: 0,
    'S/Cargo': 0,
    otros: 0
  };

  clients.forEach(client => {
    const method = (client.paymentMethod || 'otros').toLowerCase();
    const amount = Number(client.price || 0);
    if (method in paymentAmounts) paymentAmounts[method] += amount;
    else paymentAmounts['otros'] += amount;
  });

  return paymentAmounts;
}

private buildReportPayload(enrichedClients: any[], periodType: 'DAILY' | 'MONTHLY', periodKey: string) {
  const paymentAmounts = this.buildPaymentAmounts(enrichedClients);
  const totalCobrado = Object.values(paymentAmounts).reduce((sum, val) => sum + val, 0);

  return {
    timestamp: new Date().toISOString(),
    periodType,
    periodKey,
    totalSpaces: this.totalSpaces,
    occupiedSpaces: this.occupiedSpaces,
    freeSpaces: this.freeSpaces,
    occupancyRate: this.occupancyRate,
    subsueloStats: JSON.stringify(this.subsueloStats),
    timeStats: JSON.stringify(this.timeStats),
    filteredClients: JSON.stringify(enrichedClients),
    paymentAmounts: JSON.stringify(paymentAmounts),
    totalCobrado
  };
}


trackByClientId(index: number, client: Client): any {
  return client?.id ?? index;
}

trackBySubsueloStatId(index: number, stat: any): any {
  return stat?.id ?? index;
}

trackByPageNumber(index: number, page: number): number {
  return page;
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

private parseJsonObjectSafe<T extends Record<string, any>>(value?: string): T {
  if (!value) return {} as T;
  try {
    const parsed = JSON.parse(value);
    return (parsed && typeof parsed === 'object') ? parsed as T : {} as T;
  } catch {
    return {} as T;
  }
}

private getReportTotalCobrado(report: Report): number {
  if (typeof report.totalCobrado === 'number') return report.totalCobrado;

  const pa = this.parseJsonObjectSafe<Record<string, number>>(report.paymentAmounts);
  return Object.values(pa).reduce((sum, v) => sum + (Number(v) || 0), 0);
}




generateAndSaveMonthlyReport(isManual: boolean = true): void {
  if (!isManual) {
    this.executeGenerateAndSaveMonthlyReport(false, this.isTodayEndOfMonth());
    return;
  }
  void this.generateAndSaveMonthlyReportWithConfirm(isManual);
}

private async generateAndSaveMonthlyReportWithConfirm(isManual: boolean): Promise<void> {
  const isEndOfMonth = this.isTodayEndOfMonth();
  const now = new Date();
  const monthLabel = now.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const todayLabel = now.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const confirmed = await this.confirmService.confirm({
    title: isEndOfMonth ? 'Generar reporte mensual' : 'Generar acumulado del mes',
    message: isEndOfMonth
      ? `Hoy es ${todayLabel}. Estas al cierre del mes de ${monthLabel}. Deseas generar el reporte mensual definitivo?`
      : `Hoy es ${todayLabel}. Aun no estamos a fin de mes.\n\nSi continuas, se generara un reporte acumulado del mes de ${monthLabel} hasta la fecha de hoy, no el cierre mensual definitivo. Deseas continuar?`,
    confirmText: isEndOfMonth ? 'Generar mensual' : 'Generar acumulado',
    cancelText: 'Cancelar',
    variant: 'warning'
  });

  if (!confirmed) {
    this.showInfoToast('Generacion del reporte mensual cancelada.');
    return;
  }

  this.executeGenerateAndSaveMonthlyReport(isManual, isEndOfMonth);
}

private executeGenerateAndSaveMonthlyReport(isManual: boolean = true, isEndOfMonth = this.isTodayEndOfMonth()): void {
  const type = isManual ? 'MENSUAL-MANUAL' : 'MENSUAL-AUTO';
  const now = new Date();

  // âœ… monthKey local (evita desfase por UTC cerca de medianoche)
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const monthLabel = now.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const runDateLabel = now.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  console.log(`%cINICIANDO REPORTE ${type}`, 'color: #0ea5e9; font-weight: bold;');
  console.log('[MENSUAL] monthKey local:', monthKey);

  // âœ… El backend aplica la lÃ³gica correcta:
  //    - preferir DAILY con dailyFinal=true
  //    - fallback al Ãºltimo DAILY por dÃ­a si no hay final
  this.reportsApi.generateMonthly(monthKey).pipe(takeUntil(this.destroy$)).subscribe({
    next: (savedReport) => {
      console.log('[MENSUAL] Reporte mensual generado por backend', savedReport);

      const detailHtml = this.autolavadoService.generateReportDetailHtml(
        savedReport as Report,
        {
          periodLabel: isEndOfMonth ? 'Servicios del mes' : 'Servicios acumulados del mes',
          periodDateLabel: `${monthLabel} hasta ${runDateLabel}`
        }
      );

      const blob = new Blob([detailHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte_mensual_exellsior_${monthKey}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);

      this.showSuccessToast(
        isEndOfMonth
          ? `Reporte mensual generado (${monthLabel})`
          : `Reporte acumulado del mes generado hasta hoy (${monthLabel})`
      );
    },
    error: (error) => {
      console.error('[MENSUAL] Error generando reporte mensual en backend', error);
      this.showErrorToast('Error al generar el reporte mensual');
    }
  });
}

private isTodayEndOfMonth(): boolean {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return now.getMonth() !== tomorrow.getMonth();
}

get monthlyReportButtonLabel(): string {
  return this.isTodayEndOfMonth()
    ? 'Generar Mensual + Guardar'
    : 'Generar Acumulado + Guardar';
}



}

