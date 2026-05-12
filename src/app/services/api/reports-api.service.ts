import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Report } from '../../models/autolavado.model';
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
export class ReportsApiService {
  private readonly apiBase = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getReports(): Observable<Report[]> {
    return this.http.get<Report[]>(`${this.apiBase}/reports`);
  }

  getReportById(id: number): Observable<Report> {
    return this.http.get<Report>(`${this.apiBase}/reports/${id}`);
  }

  getReportsPage(page: number = 0, size: number = 20, search: string = '', periodType: string = ''): Observable<PagedResponse<Report>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    const normalizedSearch = (search || '').trim();
    const normalizedPeriodType = (periodType || '').trim();

    if (normalizedSearch) {
      params = params.set('search', normalizedSearch);
    }

    if (normalizedPeriodType) {
      params = params.set('periodType', normalizedPeriodType);
    }

    return this.http.get<PagedResponse<Report>>(`${this.apiBase}/reports/page`, { params });
  }

  createReport(payload: any): Observable<Report> {
    return this.http.post<Report>(`${this.apiBase}/reports`, payload);
  }

  deleteReport(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/reports/${id}`);
  }

  finalizeAndCloseDay(): Observable<void> {
    // Envía la fecha local del browser como parámetro explícito.
    // Esto garantiza que el backend use la fecha correcta del operador
    // independientemente del timezone del servidor (UTC en cloud).
    const localDate = new Date().toLocaleDateString('en-CA'); // yyyy-MM-dd
    return this.http.post<void>(
      `${this.apiBase}/reports/daily/finalize-and-close`,
      {},
      { params: { day: localDate } }
    );
  }
}
