import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Client } from '../../models/autolavado.model';
import { environment } from '../../../environments/environment';

export interface PagedResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ClientsApiService {
  private readonly apiBase = environment.apiUrl;

  constructor(private http: HttpClient) {}

  reserveOrUpdateClient(data: {
    spaceKey: string;
    payload: any;
    existingClientId?: number;
  }): Observable<Client> {
    const { spaceKey, payload, existingClientId } = data;

    if (existingClientId) {
      return this.http.put<Client>(`${this.apiBase}/clients/${existingClientId}`, payload);
    }

    return this.http.post<Client>(`${this.apiBase}/clients/spaces/${spaceKey}/reserve`, payload);
  }

  releaseSpace(spaceKey: string): Observable<void> {
    return this.http.put<void>(`${this.apiBase}/clients/spaces/${spaceKey}/release`, {});
  }

  getClient(clientId: number | string): Observable<Client> {
    return this.http.get<Client>(`${this.apiBase}/clients/${clientId}`);
  }

  getAllClients(): Observable<Client[]> {
    return this.http.get<Client[]>(`${this.apiBase}/clients`);
  }

  resetClients(): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/clients/reset`);
  }

  getUniqueClients(): Observable<Client[]> {
    return this.http.get<Client[]>(`${this.apiBase}/clients/unique`);
  }

  getUniqueClientsPage(page: number = 0, size: number = 20, search: string = ''): Observable<PagedResponse<Client>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    const normalizedSearch = (search || '').trim();
    if (normalizedSearch) {
      params = params.set('search', normalizedSearch);
    }

    return this.http.get<PagedResponse<Client>>(`${this.apiBase}/clients/unique/page`, { params });
  }

  getMonthlyServiceCountByDni(dni: string, monthKey?: string): Observable<number> {
    const safeDni = (dni || '').trim();
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = monthKey || defaultMonth;

    return this.http.get<number>(
      `${this.apiBase}/clients/dni/${encodeURIComponent(safeDni)}/monthly-count?month=${month}`
    );
  }

  getMonthlyServiceCountsByDnis(dnis: string[], monthKey?: string): Observable<Record<string, number>> {
    const cleanDnis = Array.from(new Set((dnis || [])
      .map(d => (d || '').trim())
      .filter(Boolean)));

    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = monthKey || defaultMonth;

    return this.http.post<Record<string, number>>(
      `${this.apiBase}/clients/monthly-counts?month=${month}`,
      cleanDnis
    );
  }

  getByDateRange(from: string, to: string): Observable<Client[]> {
    return this.http.get<Client[]>(`${this.apiBase}/clients/by-date-range`, {
      params: { from, to }
    });
  }

  deleteClient(clientId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/clients/${clientId}`);
  }

  deleteService(clientId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/clients/${clientId}/service`);
  }

  updateClient(clientId: any, updatedData: any): Observable<Client> {
    return this.http.put<Client>(`${this.apiBase}/clients/${clientId}`, updatedData);
  }

  updateVehiclesByDni(dni: string, vehicles: any[]): Observable<void> {
    return this.http.put<void>(`${this.apiBase}/clients/dni/${encodeURIComponent(dni)}/vehicles`, vehicles);
  }

  getClientReservationsByDni(dni: string): Observable<Client[]> {
    return this.http.get<Client[]>(`${this.apiBase}/clients/dni/${dni}/reservas`);
  }

  addManualClient(clientData: any): Observable<Client> {
    return this.http.post<Client>(`${this.apiBase}/clients`, clientData);
  }

  searchClientByDni(dni: string): Observable<Client> {
    return this.http.get<Client>(`${this.apiBase}/clients/dni/${dni}`);
  }
}
