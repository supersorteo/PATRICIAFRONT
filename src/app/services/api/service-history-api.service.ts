import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HistoricalService } from '../../models/autolavado.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ServiceHistoryApiService {
  private readonly apiBase = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getByDateRange(from: string, to: string): Observable<HistoricalService[]> {
    return this.http.get<HistoricalService[]>(`${this.apiBase}/service-history/by-date-range`, {
      params: { from, to }
    });
  }

  resetAll(): Observable<void> {
    return this.http.post<void>(`${this.apiBase}/service-history/reset`, {});
  }
}
