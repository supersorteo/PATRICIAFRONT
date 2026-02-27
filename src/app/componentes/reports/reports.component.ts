import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, combineLatest, catchError, of, map, switchMap, forkJoin } from 'rxjs';
import { Client, Report, Space, Subsuelo } from '../../models/autolavado.model';
import { AutolavadoService } from '../../services/autolavado.service';
import { HttpClient } from '@angular/common/http';
import { ReportsListComponent } from "../reports-list/reports-list.component";
import { FormatPhonePipe } from "../../services/format-phone.pipe";

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

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, ReportsListComponent, FormatPhonePipe],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss']
})
export class ReportsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

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

  //private API_BASE = 'http://localhost:8080/api'
  //private API_BASE = 'https://excellsiorback-production.up.railway.app/api'
    //danilo pruebas
  private API_BASE = "https://exellssiorpruebadanilo1-production.up.railway.app/api"

  showReportsList = false;
  showClientsRanking = false;
  currentRankingPage = 1;
  rankingPageSize = 12;

  //private readonly TIER_ORO = 10;
  //private readonly TIER_PLATA = 5;
  //private readonly TIER_BRONCE = 3;

 /* rankingPreview: RankingClienteView[] = Array.from({ length: 100 }, (_, i) => ({
    position: i + 1,
    name: `Cliente ${String(i + 1).padStart(3, '0')}`,
    dni: `${42000000 + i}`,
    phone: `+54 9 11 ${String(1000 + i).padStart(4, '0')}-${String(2000 + i).padStart(4, '0')}`,
    totalServices: Math.max(1, 100 - i),
    lastVisit: '-'
  }));*/

rankingList: RankingClienteView[] = [];

scheduledTime: string = ''; // Hora guardada (ej. "23:30")
private dailyInterval: any;
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

  constructor(private autolavadoService: AutolavadoService, private cdr: ChangeDetectorRef, private http: HttpClient) {}


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
      this.cdr.detectChanges();
    });

    this.statsRefreshIntervalId = setInterval(() => {
    this.calculateStats();
    this.cdr.detectChanges();
  }, 60000);

   /* setInterval(() => {
      this.calculateStats();
      this.cdr.detectChanges();
    }, 60000);*/



    const saved = localStorage.getItem('dailyReportTime');
  if (saved) {
    this.scheduledTime = saved;
    this.startDailyScheduler();
  }



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

  if (this.dailyInterval) {
    clearInterval(this.dailyInterval);
    this.dailyInterval = null;
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

/*private getTierByCount(count: number): 'oro' | 'plata' | 'bronce' | 'ninguno' {
  if (count >= this.TIER_ORO) return 'oro';
  if (count >= this.TIER_PLATA) return 'plata';
  if (count >= this.TIER_BRONCE) return 'bronce';
  return 'ninguno';
}*/







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
    this.rankingList = this.buildMonthlyRanking();
    this.currentRankingPage = 1;
  }
}

closeClientsRanking(): void {
  this.showClientsRanking = false;
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

setPageDaily0(page: number): void {
  if (page >= 1 && page <= this.totalPagesDaily) {
    this.currentPageDaily = page;
  }
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
    this.cdr.detectChanges();
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
    //console.log('getPaymentRowStyle: sin client o id → default');
    return { backgroundColor: '#34495e' };
  }

  const idStr = client.id.toString();
  const savedColor = this.paymentColorsByClientId[idStr];
  const method = (client.paymentMethod || '').trim().toLowerCase();

  //console.log(`getPaymentRowStyle para ID ${idStr}: método = "${method}", color guardado = ${savedColor || 'ninguno'}`);

  // Prioridad 1: color persistente
  if (savedColor) {
   // console.log(`→ Usando color persistente: ${savedColor}`);
    return { backgroundColor: savedColor };
  }

  // Prioridad 2: color según método actual
  const colors = this.paymentMethodColors;
  const color = colors[method] || '#34495e';
  //console.log(`→ Usando color por método "${method}": ${color}`);

  return { backgroundColor: color };
}

// Función auxiliar para oscurecer un color (opcional)
private darkenColor(hex: string, factor: number = 0.2): string {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  return '#' +
    Math.round(r * (1 - factor)).toString(16).padStart(2, '0') +
    Math.round(g * (1 - factor)).toString(16).padStart(2, '0') +
    Math.round(b * (1 - factor)).toString(16).padStart(2, '0');
}






acceptEditClient(): void {
  console.log('Botón Guardar cambios pulsado');

  if (!this.editingClient) return;

  const clientId = this.editingClient.id;
  if (!clientId) {
    alert('Error: cliente sin ID');
    return;
  }

  // Validación Clover
  if (this.editForm.clover && !/^\d{4}$/.test(this.editForm.clover)) {
    alert('El código Clover debe tener exactamente 4 dígitos numéricos');
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

  this.autolavadoService.updateClientInBackend(clientId, updatedData).subscribe({
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
        console.log(`Color eliminado para ${clientId} (método vacío)`);
      }
      this.savePaymentColors();

      this.calculateStats();
      this.cdr.detectChanges();
      this.cdr.markForCheck();

      this.showEditClientHeaderMessage('Datos actualizados correctamente');
    },
    error: (err) => {
      console.error('Error al actualizar:', err);
      alert('Error al actualizar');
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




private calculateStats0(): void {
  const spacesArray = Object.values(this.spaces);

  // Estadísticas generales (espacios actuales - se mantienen)
  this.totalSpaces = spacesArray.length;
  this.occupiedSpaces = spacesArray.filter(s => s.occupied).length;
  this.freeSpaces = this.totalSpaces - this.occupiedSpaces;
  this.occupancyRate = this.totalSpaces > 0 ? Math.round((this.occupiedSpaces / this.totalSpaces) * 100) : 0;

  // Por subsuelo (actuales - se mantienen)
  this.subsueloStats = this.subsuelos.map(sub => {
    const subSpaces = spacesArray.filter(s => s.subsueloId === sub.id);
    const subOccupied = subSpaces.filter(s => s.occupied).length;
    const subTotal = subSpaces.length;
    const subFree = subTotal - subOccupied;
    const subOccupancyRate = subTotal > 0 ? Math.round((subOccupied / subTotal) * 100) : 0;

    return {
      id: sub.id,
      label: sub.label,
      total: subTotal,
      occupied: subOccupied,
      free: subFree,
      occupancyRate: subOccupancyRate
    };
  });

  // NUEVO: Estadísticas del día completo (basado en dailyClients)
  const dailyClients = this.dailyClients;

  // Total cobrado del día
  this.dailyTotalCobrado = dailyClients.reduce((sum, c) => sum + (c.price || 0), 0);

  // Métodos de pago
  const totalServices = dailyClients.length;
  const paymentCounts = { efectivo: 0, credito: 0, prepago: 0, qr: 0, otros: 0 };

  dailyClients.forEach(c => {
    const method = (c.paymentMethod || 'otros').toLowerCase();
    if (method in paymentCounts) {
      paymentCounts[method as keyof typeof paymentCounts]++;
    } else {
      paymentCounts.otros++;
    }
  });

  this.paymentStats = {
    efectivo: { count: paymentCounts.efectivo, pct: totalServices > 0 ? Math.round((paymentCounts.efectivo / totalServices) * 100) : 0 },
    credito: { count: paymentCounts.credito, pct: totalServices > 0 ? Math.round((paymentCounts.credito / totalServices) * 100) : 0 },
    prepago: { count: paymentCounts.prepago, pct: totalServices > 0 ? Math.round((paymentCounts.prepago / totalServices) * 100) : 0 },
    qr: { count: paymentCounts.qr, pct: totalServices > 0 ? Math.round((paymentCounts.qr / totalServices) * 100) : 0 },
    otros: { count: paymentCounts.otros, pct: totalServices > 0 ? Math.round((paymentCounts.otros / totalServices) * 100) : 0 }
  };

  // Distribución por tiempo (basado en entryTimestamp)
  const now = Date.now();
  this.timeStats = { under1h: 0, between1h3h: 0, over3h: 0 };

  dailyClients.forEach(c => {
    if (!c.entryTimestamp) return;
    const elapsedMs = now - c.entryTimestamp;
    const elapsedHours = elapsedMs / (3600000);

    if (elapsedHours < 1) this.timeStats.under1h++;
    else if (elapsedHours <= 3) this.timeStats.between1h3h++;
    else this.timeStats.over3h++;
  });
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
  // 1) Estadísticas generales + por subsuelo (una sola pasada en spaces)
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
  // 2) Estadísticas del día (una sola pasada en dailyClients)
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


  onSearchClients0(): void {
  this.currentPageDaily = 1;  // Reinicia a página 1 al buscar
}

onSearchClients(): void {
  this.currentPageDaily = 1;
  this.applyDailyClientFiltersAndPagination();
}


  get paginatedClients(): Client[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredClients.slice(start, start + this.pageSize);
  }






get filteredDailyClients0(): Client[] {
  if (!this.searchTerm.trim()) {
    this.filteredDailyClientsList = this.dailyClients;
  } else {
    const term = this.searchTerm.toLowerCase();
    this.filteredDailyClientsList = this.dailyClients.filter(client =>
      (client.name?.toLowerCase().includes(term)) ||
      (client.code?.toLowerCase().includes(term)) ||
      (client.phoneIntl?.includes(term)) ||
      (client.vehicle?.toLowerCase().includes(term)) ||
      (client.plate?.toLowerCase().includes(term)) ||
      (client.dni?.includes(term))
    );
  }
  return this.filteredDailyClientsList;
}


get filteredDailyClients(): Client[] {
  return this.filteredDailyClientsList || [];
}



get paginatedDailyClients0(): Client[] {
  const start = (this.currentPageDaily - 1) * this.pageSizeDaily;
  this.paginatedDailyClientsList = this.filteredDailyClients.slice(start, start + this.pageSizeDaily);
  return this.paginatedDailyClientsList;
}

get totalPagesDaily0(): number {
  return Math.ceil(this.filteredDailyClients.length / this.pageSizeDaily);
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
    this.cdr.detectChanges();
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
  if (!this.scheduledTime) {
    console.warn('Hora programada vacía. No se guarda nada.');
    return;
  }

  console.log('Guardando nueva hora programada:', this.scheduledTime);

  // Guardar la nueva hora
  localStorage.setItem('dailyReportTime', this.scheduledTime);

  // ← CLAVE: Limpiar el último reporte generado para que se pueda generar de nuevo hoy
  localStorage.removeItem('lastDailyReportDate');
  console.log('lastDailyReportDate limpiado para permitir nuevo reporte hoy');

  // Reiniciar el scheduler con la nueva hora
  this.startDailyScheduler();

  this.showSuccessToast(`Reporte programado a las ${this.scheduledTime}. Se podrá generar hoy con la nueva hora.`);
}





private startDailyScheduler(): void {
  console.log('%cIniciando scheduler de reporte automático', 'color: #0ea5e9; font-weight: bold;');
  console.log('Hora programada guardada:', this.scheduledTime);

  if (!this.scheduledTime) {
    console.warn('No hay hora programada. Scheduler detenido.');
    return;
  }

  // Limpiar intervalo anterior
  if (this.dailyInterval) {
    clearInterval(this.dailyInterval);
    console.log('Intervalo anterior limpiado');
  }

  // Verificar inmediatamente
  console.log('Verificando ahora al iniciar...');
  this.checkAndGenerateDailyReport();

  // Verificar cada minuto
  this.dailyInterval = setInterval(() => {
    console.log('%c⏰ Verificando hora programada...', 'color: #3b82f6');
    this.checkAndGenerateDailyReport();
  }, 60 * 1000);

  console.log('Scheduler iniciado: verifica cada minuto');
}



checkIfShouldGenerateDailyReport(): void {
  if (!this.scheduledTime) return;

  const [hour, minute] = this.scheduledTime.split(':').map(Number);
  const now = new Date();
  const scheduled = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);

  // Si ya pasó la hora hoy
  if (now > scheduled) {
    const lastRun = localStorage.getItem('lastDailyReportDate');
    const today = now.toDateString();

    if (lastRun !== today) {
      this.generateAndSaveReport(false);
      localStorage.setItem('lastDailyReportDate', today);
      console.log('Reporte diario automático generado a las', this.scheduledTime);
    }
  }
}




private checkAndGenerateDailyReport(): void {
  if (!this.scheduledTime) {
    console.warn('No hay hora programada configurada');
    return;
  }

  const [hour, minute] = this.scheduledTime.split(':').map(Number);
  const now = new Date();

  console.log(`Hora actual: ${now.toLocaleTimeString()}`);
  console.log(`Hora programada: ${this.scheduledTime}`);

  const todayScheduled = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
  console.log(`Hora programada hoy: ${todayScheduled.toLocaleTimeString()}`);

  const todayKey = now.toDateString();
  const lastRun = localStorage.getItem('lastDailyReportDate');

  console.log(`Clave de hoy: ${todayKey}`);
  console.log(`Último reporte generado: ${lastRun || 'Ninguno'}`);

  const scheduledTimePassed = now >= todayScheduled;
  const alreadyGeneratedToday = lastRun === todayKey;

  console.log(`¿Ya pasó la hora programada? ${scheduledTimePassed ? 'SÍ' : 'NO'}`);
  console.log(`¿Ya se generó hoy? ${alreadyGeneratedToday ? 'SÍ' : 'NO'}`);

  if (scheduledTimePassed && !alreadyGeneratedToday) {
    console.log('%cGENERANDO REPORTE AUTOMÁTICO AHORA', 'color: #10b981; font-weight: bold; font-size: 1.2em;');
    this.generateAndSaveReport(false);
    localStorage.setItem('lastDailyReportDate', todayKey);
    console.log('Reporte marcado como generado para hoy');
  } else if (scheduledTimePassed && alreadyGeneratedToday) {
    console.log('El reporte automático ya se generó hoy. No se vuelve a generar.');
  } else {
    console.log('Aún no es hora del reporte automático. Esperando...');
  }
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

  // Ajustar página actual si quedó fuera de rango
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




generateAndSaveReport0(isManual: boolean = false): void {
  const type = isManual ? 'MANUAL' : 'AUTOMATICO';
  console.log(`%cINICIANDO GENERACION DE REPORTE ${type}`, 'color: #0ea5e9; font-weight: bold;');

  const clientsForReport = this.dailyClients;
  if (!clientsForReport.length) {
    if (isManual) alert('No hay clientes para generar el reporte del dia');
    return;
  }

  const enrichedClients = this.enrichClientsForReport(clientsForReport);
  const periodKey = new Date().toISOString().slice(0, 10); // yyyy-MM-dd
  const reportData = this.buildReportPayload(enrichedClients, 'DAILY', periodKey);

  console.log('[DIARIO] payload reportData:', reportData);

  this.http.post<Report>(`${this.API_BASE}/reports`, reportData).subscribe({
    next: (savedReport) => {
      const detailHtml = this.autolavadoService.generateReportDetailHtml({
        ...reportData,
        id: savedReport.id,
        timestamp: savedReport.timestamp,
        subsueloStats: reportData.subsueloStats,
        timeStats: reportData.timeStats,
        filteredClients: reportData.filteredClients,
        paymentAmounts: reportData.paymentAmounts,
        totalCobrado: reportData.totalCobrado
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

      this.showSuccessToast(isManual ? 'Reporte manual generado y descargado' : 'Reporte diario automatico generado y descargado');
    },
    error: (error) => {
      console.error('Error al generar reporte diario', error);
      this.showErrorToast('Error al generar el reporte');
    }
  });
}

generateAndSaveReport1(isManual: boolean = false): void {
  const type = isManual ? 'MANUAL' : 'AUTOMATICO';

  console.log(`%cINICIANDO GENERACION DE REPORTE ${type}`, 'color: #0ea5e9; font-weight: bold;');

  const clientsForReport = this.dailyClients;
  if (!clientsForReport.length) {
    if (isManual) alert('No hay clientes para generar el reporte del dia');
    return;
  }

  const enrichedClients = this.enrichClientsForReport(clientsForReport);

  const now = new Date();
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const reportData: any = this.buildReportPayload(enrichedClients, 'DAILY', periodKey);
  reportData.dailyFinal = false; // manual/auto intermedio

  console.log('[DIARIO] payload reportData:', reportData);

  this.http.post<Report>(`${this.API_BASE}/reports`, reportData).subscribe({
    next: (savedReport) => {
      const detailHtml = this.autolavadoService.generateReportDetailHtml({
        ...reportData,
        id: savedReport.id,
        timestamp: savedReport.timestamp,
        subsueloStats: reportData.subsueloStats,
        timeStats: reportData.timeStats,
        filteredClients: reportData.filteredClients,
        paymentAmounts: reportData.paymentAmounts,
        totalCobrado: reportData.totalCobrado
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

      this.showSuccessToast(isManual ? 'Reporte manual generado (no final)' : 'Reporte diario automatico generado (no final)');
    },
    error: (error) => {
      console.error('Error al generar reporte diario', error);
      this.showErrorToast('Error al generar el reporte');
    }
  });
}

generateAndSaveReport(isManual: boolean = false): void {
  const type = isManual ? 'MANUAL' : 'AUTOMATICO';
  console.log(`%cINICIANDO GENERACION DE REPORTE ${type}`, 'color: #0ea5e9; font-weight: bold;');

  const clientsForReport = this.dailyClients || [];
  const enrichedClients = this.enrichClientsForReport(clientsForReport);

  // ✅ periodKey local (evita problemas UTC cerca de medianoche)
  const now = new Date();
  //const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const periodKey = this.getLocalPeriodKey();

  console.log('[DIARIO] generateAndSaveReport input', {
    type,
    periodKey,
    currentDailyClients: clientsForReport.length,
    enrichedClients: enrichedClients.length
  });

  this.http.get<Report[]>(`${this.API_BASE}/reports`).pipe(
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
        if (isManual) alert('No hay clientes para generar el reporte del dia');
        return of(null);
      }

      // Construir payload consolidado del día (pero NO final)
      const reportData: any = this.buildDailyReportPayloadMerged(mergedClients, periodKey);
      reportData.dailyFinal = false; // ✅ manual/auto intermedio

      console.log('[DIARIO] payload consolidado (dailyFinal=false):', reportData);

      // Borrar diarios previos del mismo día y recrear consolidado único
      const deleteCalls = existingDailyReports.map(r =>
        this.http.delete<void>(`${this.API_BASE}/reports/${r.id}`).pipe(
          catchError((err) => {
            console.warn('[DIARIO] Error borrando reporte diario previo', { reportId: r.id, err });
            // No aborta; seguimos para no bloquear operación del usuario
            return of(void 0);
          })
        )
      );

      return (deleteCalls.length ? forkJoin(deleteCalls) : of([])).pipe(
        switchMap(() => this.http.post<Report>(`${this.API_BASE}/reports`, reportData)),
        map((savedReport) => ({ savedReport, reportData, periodKey }))
      );
    })
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
          ? 'Reporte diario generado/actualizado (consolidado del día, no final)'
          : 'Reporte diario automático generado/actualizado (no final)'
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

  // Reportes nuevos con periodType/periodKey correctos
  if (report.periodType === 'DAILY' && report.periodKey === periodKey) return true;

  // Compatibilidad legacy (reportes viejos sin periodType/periodKey)
  const tsDay = (report.timestamp || '').slice(0, 10);
  const looksDaily = !report.periodKey || report.periodKey.length === 10;
  return looksDaily && tsDay === periodKey;
}


private mergeAndDedupDailyReportClients(existingClients: any[], currentClients: any[]): any[] {
  const merged = [...(existingClients || []), ...(currentClients || [])];
  const dedup = new Map<string, any>();

  for (const c of merged) {
    const key = [
      c?.id ?? 'x',
      c?.code ?? 'x',
      c?.entryTimestamp ?? 'x',
      c?.exitTimestamp ?? 'x'
    ].join('|');

    // Si colisiona, el último reemplaza al anterior (útil si viene más completo)
    dedup.set(key, c);
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

    // Recalculados desde servicios fusionados del día
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


// En reports.component.ts - Métodos de Toast (CORREGIDOS)

showSuccessToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'toast align-items-center text-bg-success border-0 position-fixed bottom-0 end-0 p-3';
  toast.style.zIndex = '9999';
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body text-white">
        ✓ ${message}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;
  document.body.appendChild(toast);

  const bsToast = new (window as any).bootstrap.Toast(toast, { delay: 4000 });
  bsToast.show();

  toast.addEventListener('hidden.bs.toast', () => toast.remove());
}

showErrorToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'toast align-items-center text-bg-danger border-0 position-fixed bottom-0 end-0 p-3';
  toast.style.zIndex = '9999';
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body text-white">
        ✗ ${message}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;
  document.body.appendChild(toast);

  const bsToast = new (window as any).bootstrap.Toast(toast, { delay: 5000 });
  bsToast.show();

  toast.addEventListener('hidden.bs.toast.toast', () => toast.remove());
}

getSpaceByKey(spaceKey: string | null): Space | undefined {
  if (!spaceKey) return undefined;
  return this.autolavadoService.spacesSubject.value[spaceKey];
}




eliminarServicio0(client: Client): void {
  const clientName = client.name || 'este cliente';
  const vehicle = client.vehicle ? `(${client.vehicle})` : '';

  const confirmDelete = confirm(
    `¿Estás seguro de ELIMINAR DEFINITIVAMENTE el servicio de ${clientName} ${vehicle}?\n\n` +
    `Esto borrará el registro del cliente de la base de datos y liberará el espacio si está ocupado.\n` +
    `No se puede recuperar.`
  );

  if (!confirmDelete) return;

  console.log(`Eliminando servicio del cliente ID: ${client.id} de la BD`);

  const spaceKey = client.spaceKey;
  const space = this.getSpaceByKey(spaceKey);

  if (space && space.occupied) {
    // 1. Si el espacio está ocupado → liberar primero
    console.log(`Espacio ${spaceKey} ocupado. Liberando antes de eliminar cliente...`);

    this.autolavadoService.releaseSpace(spaceKey).subscribe({
      next: () => {
        console.log('Espacio liberado correctamente');
        delete this.paymentColorsByClientId[client.id.toString()];
        this.savePaymentColors();
        // 2. Ahora eliminar el cliente de la BD
        this.eliminarClienteDeBD(client.id, clientName);




      },
      error: (err) => {
        console.error('Error al liberar espacio antes de eliminar:', err);
        alert('Error al liberar el espacio. El servicio no se eliminó.');
      }
    });
  } else {
    // Espacio ya liberado → eliminar directamente de la BD
    this.eliminarClienteDeBD(client.id, clientName);
  }
}

eliminarServicio(client: Client): void {
  const clientName = client.name || 'este cliente';
  const vehicle = client.vehicle ? `(${client.vehicle})` : '';

  const confirmDelete = confirm(
    `¿Estás seguro de ELIMINAR DEFINITIVAMENTE el servicio de ${clientName} ${vehicle}?\n\n` +
    `Esto borrará el registro del cliente de la base de datos y liberará el espacio si está ocupado.\n` +
    `No se puede recuperar.`
  );

  if (!confirmDelete) return;

  console.log(`Eliminando servicio del cliente ID: ${client.id}`);

  const spaceKey = client.spaceKey;
  const space = this.getSpaceByKey(spaceKey);

  // Función interna para eliminar de BD y actualizar UI
  const deleteFromBDAndUpdateUI = () => {
    this.autolavadoService.deleteClientFromBackend(client.id).subscribe({
      next: () => {
        console.log(`Cliente ${client.id} eliminado correctamente`);

        // Eliminar color persistente
        delete this.paymentColorsByClientId[client.id.toString()];
        this.savePaymentColors();
        console.log('Color eliminado para cliente', client.id);

        // Actualizar lista en memoria (eliminar el cliente eliminado)
        this.dailyClients = this.dailyClients.filter(c => c.id !== client.id);

       delete this.paymentColorsByClientId[client.id.toString()];
  this.savePaymentColors();

  // Recargar listas (sin método inexistente)
  this.filteredDailyClientsList = this.dailyClients.filter(c => c.id !== client.id);
  this.paginatedDailyClientsList = this.filteredDailyClientsList.slice(
    (this.currentPageDaily - 1) * this.pageSizeDaily,
    (this.currentPageDaily - 1) * this.pageSizeDaily + this.pageSizeDaily
  );
        // Forzar renderizado
        this.cdr.detectChanges();

        this.showSuccessToast(`Servicio de ${clientName} eliminado correctamente`);
      },
      error: (err) => {
        console.error('Error al eliminar cliente', err);
        this.showErrorToast('Error al eliminar el servicio. Intenta de nuevo.');
      }
    });
  };

  if (space && space.occupied) {
    console.log(`Espacio ${spaceKey} ocupado. Liberando primero...`);
    this.autolavadoService.releaseSpace(spaceKey).subscribe({
      next: () => {
        console.log('Espacio liberado correctamente');
        deleteFromBDAndUpdateUI();
      },
      error: (err) => {
        console.error('Error al liberar espacio', err);
        alert('Error al liberar el espacio. El servicio no se eliminó.');
      }
    });
  } else {
    // Espacio ya libre → eliminar directamente
    deleteFromBDAndUpdateUI();
  }
}


private eliminarClienteDeBD(clientId: number, clientName: string): void {
  this.autolavadoService.deleteClientFromBackend(clientId).subscribe({
    next: () => {
      console.log(`Cliente ${clientId} (${clientName}) eliminado correctamente de la BD`);
      // No necesitas hacer nada más: deleteClientFromBackend ya recarga spaces y clients
      // La tabla se actualiza sola porque dailyClients$ depende de clients$
      this.showSuccessToast(`Servicio de ${clientName} eliminado correctamente`);
    },
    error: (err) => {
      console.error('Error al eliminar cliente de la BD:', err);
      this.showErrorToast('Error al eliminar el servicio. Intenta de nuevo.');
    }
  });
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
  this.http.post<any>(`${this.API_BASE}/reports`, reportData).pipe(
    catchError(error => {
      console.error('Error saving report to backend', error);
      alert('Reporte descargado localmente, pero error al guardar en backend: ' + error.message);
      return of(null);
    })
  ).subscribe(response => {
    console.log('Reporte guardado en backend:', response);
  });

  // Generación y descarga HTML local (tu código original)
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
        <div>Ocupación</div>
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
          <th>% Ocupación</th>
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
    <h2>Distribución por Tiempo</h2>
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
        <div>Más de 3h</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Clientes Activos (${this.filteredClients.length})</h2>
    ${this.filteredClients.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Cliente</th>
            <th>Espacio</th>
            <th>Teléfono</th>
            <th>Vehículo</th>
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


private toMillis(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    return isNaN(ms) ? null : ms;
  }
  return null;
}

/*private getClientEventTs(client: Client): number | null {
  return this.toMillis(client.entryTimestamp) ?? this.toMillis(client.exitTimestamp);
}*/

private getMonthlyClientsForReport(referenceDate: Date = new Date()): Client[] {
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1).getTime();
  const nextMonthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1).getTime();

  return Object.values(this.clients || {})
    .filter(c => {
      const ts = this.getClientEventTs(c);
      return ts !== null && ts >= monthStart && ts < nextMonthStart;
    })
    .sort((a, b) => (this.getClientEventTs(b) || 0) - (this.getClientEventTs(a) || 0));
}



private toEpoch(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : new Date(value).getTime();
  return isNaN(n) ? null : n;
}

private getClientEventTs(c: Client): number | null {
  return this.toEpoch(c.entryTimestamp) ?? this.toEpoch(c.exitTimestamp);
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



//actualizacion

private isDailyReportOfMonth(report: Report, monthKey: string): boolean {
  const tsMonth = (report.timestamp || '').slice(0, 7);
  if (tsMonth !== monthKey) return false;

  if (report.periodType === 'MONTHLY') return false;
  if (report.periodType === 'DAILY') return true;

  // Compatibilidad con reportes viejos sin periodType
  if (report.periodKey) return report.periodKey.length === 10; // yyyy-MM-dd => diario
  return true; // legacy sin periodKey: asumimos diario
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

private buildMonthlyPayloadFromDailyReports(dailyReports: Report[], monthKey: string) {
  const paymentTotals: Record<string, number> = {
    efectivo: 0,
    credito: 0,
    prepago: 0,
    qr: 0,
    debito: 0,
    scaneo: 0,
    'S/Cargo': 0,
    otros: 0
  };

  const mergedTimeStats = {
    under1h: 0,
    between1h3h: 0,
    over3h: 0
  };

  const allClientsRaw = dailyReports.flatMap(r => this.parseJsonArraySafe(r.filteredClients));

  // Evitar duplicados por id+code+entry+exit
  const dedup = new Map<string, any>();
  allClientsRaw.forEach(c => {
    const key = `${c?.id ?? 'x'}|${c?.code ?? 'x'}|${c?.entryTimestamp ?? 'x'}|${c?.exitTimestamp ?? 'x'}`;
    if (!dedup.has(key)) dedup.set(key, c);
  });
  const mergedClients = Array.from(dedup.values());

  dailyReports.forEach(r => {
    const pa = this.parseJsonObjectSafe<Record<string, number>>(r.paymentAmounts);
    Object.keys(paymentTotals).forEach((k) => {
      paymentTotals[k] += Number(pa[k] || 0);
    });

    const ts = this.parseJsonObjectSafe<Record<string, number>>(r.timeStats);
    mergedTimeStats.under1h += Number(ts['under1h'] || 0);
    mergedTimeStats.between1h3h += Number(ts['between1h3h'] || 0);
    mergedTimeStats.over3h += Number(ts['over3h'] || 0);
  });

  const totalCobrado = dailyReports.reduce((sum, r) => sum + this.getReportTotalCobrado(r), 0);

  // Tomamos estructura base del último diario del mes
  const latest = dailyReports[dailyReports.length - 1];

  return {
    timestamp: new Date().toISOString(),
    periodType: 'MONTHLY' as const,
    periodKey: monthKey,
    totalSpaces: latest?.totalSpaces ?? this.totalSpaces,
    occupiedSpaces: latest?.occupiedSpaces ?? this.occupiedSpaces,
    freeSpaces: latest?.freeSpaces ?? this.freeSpaces,
    occupancyRate: latest?.occupancyRate ?? this.occupancyRate,
    subsueloStats: latest?.subsueloStats ?? JSON.stringify(this.subsueloStats),
    timeStats: JSON.stringify(mergedTimeStats),
    filteredClients: JSON.stringify(mergedClients),
    paymentAmounts: JSON.stringify(paymentTotals),
    totalCobrado
  };
}


generateAndSaveMonthlyReport0(isManual: boolean = true): void {
  const type = isManual ? 'MENSUAL-MANUAL' : 'MENSUAL-AUTO';
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7); // yyyy-MM
  const monthLabel = now.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const runDateLabel = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  console.log(`%cINICIANDO REPORTE ${type}`, 'color: #0ea5e9; font-weight: bold;');
  console.log('[MENSUAL] monthKey:', monthKey);

  this.http.get<Report[]>(`${this.API_BASE}/reports`).subscribe({
    next: (allReports) => {
      const dailyReports = allReports
        .filter((r) => this.isDailyReportOfMonth(r, monthKey))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      console.log('[MENSUAL] reportes diarios encontrados:', dailyReports.length);
      console.table(
        dailyReports.map(r => ({
          id: r.id,
          periodType: r.periodType || '(legacy)',
          periodKey: r.periodKey || '(none)',
          timestamp: r.timestamp,
          totalCobrado: r.totalCobrado
        }))
      );

      if (!dailyReports.length) {
        console.warn('[MENSUAL] No hay reportes diarios del mes para consolidar.');
        if (isManual) alert(`No hay reportes diarios en ${monthLabel} para generar el mensual.`);
        return;
      }

      const reportData = this.buildMonthlyPayloadFromDailyReports(dailyReports, monthKey);
      console.log('[MENSUAL] payload consolidado:', reportData);

      this.http.post<Report>(`${this.API_BASE}/reports`, reportData).subscribe({
        next: (savedReport) => {
          const detailHtml = this.autolavadoService.generateReportDetailHtml(
            {
              ...reportData,
              id: savedReport.id,
              timestamp: savedReport.timestamp
            } as Report,
            {
              periodLabel: 'Servicios del mes',
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

          this.showSuccessToast(`Reporte mensual generado (${monthLabel})`);
        },
        error: (error) => {
          console.error('[MENSUAL] Error guardando reporte mensual', error);
          this.showErrorToast('Error al guardar el reporte mensual');
        }
      });
    },
    error: (error) => {
      console.error('[MENSUAL] Error cargando reportes para consolidar', error);
      this.showErrorToast('Error al leer reportes diarios para el mensual');
    }
  });
}

generateAndSaveMonthlyReport1(isManual: boolean = true): void {
  const type = isManual ? 'MENSUAL-MANUAL' : 'MENSUAL-AUTO';
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = now.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const runDateLabel = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  console.log(`%cINICIANDO REPORTE ${type}`, 'color: #0ea5e9; font-weight: bold;');
  console.log('[MENSUAL] monthKey:', monthKey);

  this.http.post<Report>(`${this.API_BASE}/reports/monthly/generate?month=${monthKey}`, {}).subscribe({
    next: (savedReport) => {
      console.log('[MENSUAL] Reporte mensual generado en backend', savedReport);

      const detailHtml = this.autolavadoService.generateReportDetailHtml(
        savedReport as Report,
        {
          periodLabel: 'Servicios del mes',
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

      this.showSuccessToast(`Reporte mensual generado (${monthLabel})`);
    },
    error: (error) => {
      console.error('[MENSUAL] Error generando reporte mensual', error);
      this.showErrorToast('Error al generar el reporte mensual');
    }
  });
}

generateAndSaveMonthlyReport(isManual: boolean = true): void {
  const type = isManual ? 'MENSUAL-MANUAL' : 'MENSUAL-AUTO';
  const now = new Date();

  // ✅ monthKey local (evita desfase por UTC cerca de medianoche)
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const monthLabel = now.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const runDateLabel = now.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  console.log(`%cINICIANDO REPORTE ${type}`, 'color: #0ea5e9; font-weight: bold;');
  console.log('[MENSUAL] monthKey local:', monthKey);

  // ✅ El backend aplica la lógica correcta:
  //    - preferir DAILY con dailyFinal=true
  //    - fallback al último DAILY por día si no hay final
  this.http.post<Report>(`${this.API_BASE}/reports/monthly/generate?month=${monthKey}`, {}).subscribe({
    next: (savedReport) => {
      console.log('[MENSUAL] Reporte mensual generado por backend', savedReport);

      const detailHtml = this.autolavadoService.generateReportDetailHtml(
        savedReport as Report,
        {
          periodLabel: 'Servicios del mes',
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

      this.showSuccessToast(`Reporte mensual generado (${monthLabel})`);
    },
    error: (error) => {
      console.error('[MENSUAL] Error generando reporte mensual en backend', error);
      this.showErrorToast('Error al generar el reporte mensual');
    }
  });
}



}
