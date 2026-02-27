import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { SpacesComponent } from "./componentes/spaces/spaces.component";
import { ReportsComponent } from "./componentes/reports/reports.component";
import { ArribaComponent } from "./componentes/arriba/arriba.component";
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormsModule } from '@angular/forms';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, SpacesComponent, ReportsComponent, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Gestión de Autolavado-Parking — Bosquejo';
  isLoggedIn = false;
  username = '';
  password = '';
  errorMessage = '';
  isLoading = false;
  showPassword = false;
  isCheckingAuth = true;
 // private apiUrl = "http://localhost:8080";
  private apiUrl = "https://excellsiorback-production.up.railway.app"


  //danilo pruebas
  //private apiUrl = "https://exellssiorpruebadanilo1-production.up.railway.app"
  token = '';

  constructor(private http: HttpClient) {
      this.checkAuth();

  }



  private checkAuth() {
    const savedToken = localStorage.getItem('token');
    const savedUsername = localStorage.getItem('username');

    if (savedToken && savedUsername) {
      this.token = savedToken;
      this.username = savedUsername;
      this.isLoggedIn = true;
      this.verifyToken(); // Verifica si el token sigue válido
    } else {
      this.isLoggedIn = false;
      this.isCheckingAuth = false; // Sin datos → mostrar login
    }
  }



login() {
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
       // this.username = response.username;
        this.username = response.username || this.username;
        localStorage.setItem('token', this.token);
        localStorage.setItem('username', this.username);
        this.isLoggedIn = true;
        this.isCheckingAuth = false;
        this.isLoading = false;

        this.password = '';
      },
      error: (err) => {
        this.errorMessage = err.error?.error || 'Credenciales inválidas';
        this.isLoading = false;
      }
    });
  }


  private verifyToken0() {
    const headers = new HttpHeaders().set('Authorization', `Bearer ${this.token}`);
    this.http.get(`${this.apiUrl}/api/auth/users`, { headers }).subscribe({
      next: () => {
        this.isLoggedIn = true;
        this.isCheckingAuth = false;

      },
      error: () => {
        this.logout();
        this.isCheckingAuth = false;
      }
    });
  }

  private verifyToken() {
    const headers = new HttpHeaders().set('Authorization', `Bearer ${this.token}`);
    this.http.get(`${this.apiUrl}/api/auth/users`, { headers }).subscribe({
      next: () => {
        // Token válido → mantener sesión
        this.isLoggedIn = true;
        this.isCheckingAuth = false;
      },
      error: (err) => {
        console.warn('Verificación de token falló:', err.status, err.message);
        this.logout(); // Limpia todo si el token ya no es válido
        this.isCheckingAuth = false;
      }
    });
  }

  private tryLogin(username: string, password: string, silent: boolean = false) {
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
       /* if (!silent) {
          alert('¡Bienvenido de nuevo!');
        }*/
      },
      error: (err) => {
        this.isLoading = false;
        this.isCheckingAuth = false;
        this.errorMessage = 'Sesión expirada o credenciales inválidas. Iniciá sesión nuevamente.';
        localStorage.removeItem('auth');
      }
    });
  }



logout0() {
    this.isLoggedIn = false;
    this.token = '';
    this.username = '';
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    this.isCheckingAuth = false;
  }

  logout() {
  // Mensaje de confirmación nativo del navegador
  const confirmed = confirm("¿Estás seguro de que quieres cerrar sesión?");

  if (confirmed) {
    // Solo ejecuta el logout si el usuario confirma
    this.isLoggedIn = false;
    this.token = '';
    this.username = '';
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    this.isCheckingAuth = false;

    // Opcional: pequeño mensaje de éxito (nativo también)
    alert("Sesión cerrada correctamente.");
  }
  // Si cancela, no pasa nada → se queda logueado
}



}
