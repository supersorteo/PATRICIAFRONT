import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { SpacesComponent } from './componentes/spaces/spaces.component';
import { ReportsComponent } from './componentes/reports/reports.component';
import { GlobalToastComponent } from './componentes/global-toast/global-toast.component';
import { GlobalConfirmDialogComponent } from './componentes/global-confirm-dialog/global-confirm-dialog.component';
import { AiChatComponent } from './componentes/ai-chat/ai-chat.component';
import { BillingBannerComponent } from './componentes/billing-banner/billing-banner.component';
import { ConfirmService } from './services/confirm.service';
import { OfflineSyncService } from './services/offline-sync.service';
import { ToastService } from './services/toast.service';
import { environment } from '../environments/environment';
import { combineLatest, distinctUntilChanged, filter, skip } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    SpacesComponent,
    ReportsComponent,
    FormsModule,
    GlobalToastComponent,
    GlobalConfirmDialogComponent,
    AiChatComponent,
    BillingBannerComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'Gestión de Autolavado-Parking';
  isLoggedIn = false;
  username = '';
  password = '';
  errorMessage = '';
  isLoading = false;
  showPassword = false;
  isCheckingAuth = true;
  isOffline = false;
  pendingSyncCount = 0;
  isSyncingOfflineQueue = false;
  private apiUrl = environment.backendUrl;
  token = '';

  constructor(
    private http: HttpClient,
    private confirmService: ConfirmService,
    private toastService: ToastService,
    private offlineSync: OfflineSyncService
  ) {
    this.checkAuth();
    combineLatest([
      this.offlineSync.isOnline$,
      this.offlineSync.pendingCount$,
      this.offlineSync.isSyncing$
    ]).subscribe(([isOnline, pendingCount, isSyncing]) => {
      this.isOffline = !isOnline;
      this.pendingSyncCount = pendingCount;
      this.isSyncingOfflineQueue = isSyncing;
    });

    this.offlineSync.isOnline$.pipe(
      skip(1),
      distinctUntilChanged(),
      filter(online => online && this.isLoggedIn)
    ).subscribe(() => this.verifyToken());
  }

  private checkAuth(): void {
    const savedToken = localStorage.getItem('token');
    const savedUsername = localStorage.getItem('username');

    if (savedToken && savedUsername) {
      this.token = savedToken;
      this.username = savedUsername;
      this.isLoggedIn = true;
      this.verifyToken();
      return;
    }

    this.isLoggedIn = false;
    this.isCheckingAuth = false;
  }

  login(): void {
    if (!this.username || !this.password) {
      this.errorMessage = 'Ingresá usuario y contraseña';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.http.post(`${this.apiUrl}/api/auth/login`, {
      username: this.username,
      password: this.password
    }).subscribe({
      next: (response: any) => {
        this.token = response.token;
        this.username = response.username || this.username;
        localStorage.setItem('token', this.token);
        localStorage.setItem('username', this.username);
        this.isLoggedIn = true;
        this.isCheckingAuth = false;
        this.isLoading = false;
        this.password = '';
        this.toastService.showSuccess('Sesión iniciada correctamente.');
      },
      error: (err) => {
        this.errorMessage = err.error?.error || 'Credenciales inválidas';
        this.isLoading = false;
      }
    });
  }



  private verifyToken(): void {
    const headers = new HttpHeaders().set('Authorization', `Bearer ${this.token}`);
    this.http.get(`${this.apiUrl}/api/auth/users`, { headers }).subscribe({
      next: () => {
        this.isLoggedIn = true;
        this.isCheckingAuth = false;
      },
      error: (err) => {
        if (err.status === 0) {
          // Sin conectividad — mantener sesión activa con datos locales
          this.isLoggedIn = true;
          this.isCheckingAuth = false;
          return;
        }
        // Token inválido o expirado (401, 403, etc.) — cerrar sesión
        console.warn('Verificación de token falló:', err.status, err.message);
        this.logout();
        this.isCheckingAuth = false;
      }
    });
  }



  logout(): void {
    this.isLoggedIn = false;
    this.token = '';
    this.username = '';
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    this.isCheckingAuth = false;
  }

  async logoutWithConfirm(): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Cerrar sesión',
      message: '¿Estás seguro de que quieres cerrar sesión?',
      confirmText: 'Cerrar sesión',
      cancelText: 'Cancelar',
      variant: 'warning'
    });

    if (!confirmed) {
      return;
    }

    this.logout();
    this.toastService.showSuccess('Sesión cerrada correctamente.');
  }
}
