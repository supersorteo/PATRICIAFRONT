import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { SpacesComponent } from './componentes/spaces/spaces.component';
import { ReportsComponent } from './componentes/reports/reports.component';
import { GlobalToastComponent } from './componentes/global-toast/global-toast.component';
import { GlobalConfirmDialogComponent } from './componentes/global-confirm-dialog/global-confirm-dialog.component';
import { ConfirmService } from './services/confirm.service';
import { ToastService } from './services/toast.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    SpacesComponent,
    ReportsComponent,
    FormsModule,
    GlobalToastComponent,
    GlobalConfirmDialogComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
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
  private apiUrl = environment.backendUrl;
  token = '';

  constructor(
    private http: HttpClient,
    private confirmService: ConfirmService,
    private toastService: ToastService
  ) {
    this.checkAuth();
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

  private verifyToken0(): void {
    const headers = new HttpHeaders().set('Authorization', `Bearer ${this.token}`);
    this.http.get(`${this.apiUrl}/api/auth/users`, { headers }).subscribe({
      next: () => {
        this.isLoggedIn = true;
        this.isCheckingAuth = false;
      },
      error: () => {
        this.logout0();
        this.isCheckingAuth = false;
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
        console.warn('Verificación de token falló:', err.status, err.message);
        this.logout0();
        this.isCheckingAuth = false;
      }
    });
  }

  private tryLogin(username: string, password: string, silent: boolean = false): void {
    if (!silent) {
      this.isLoading = true;
      this.errorMessage = '';
    }

    const authHeader = 'Basic ' + btoa(username + ':' + password);

    this.http.get(`${this.apiUrl}/api/auth/users`, {
      headers: { Authorization: authHeader }
    }).subscribe({
      next: () => {
        this.isLoggedIn = true;
        this.isCheckingAuth = false;
        this.username = username;
        localStorage.setItem('auth', JSON.stringify({ username, password }));
      },
      error: () => {
        this.isLoading = false;
        this.isCheckingAuth = false;
        this.errorMessage = 'Sesión expirada o credenciales inválidas. Iniciá sesión nuevamente.';
        localStorage.removeItem('auth');
      }
    });
  }

  logout0(): void {
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

    this.logout0();
    this.toastService.showSuccess('Sesión cerrada correctamente.');
  }
}
