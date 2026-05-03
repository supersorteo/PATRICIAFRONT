import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Report } from '../models/autolavado.model';
import { PagedResponse } from './autolavado.service';

export interface ReportScheduleConfig {
  enabled: boolean;
  dailySnapshotTime: string | null;
  businessTimeZone: string | null;
  dailyCloseTime: string | null;
  lastSnapshotDay: string | null;
  lastCloseDay: string | null;
}

@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  private readonly base = `${environment.apiUrl}/reports`;

  constructor(private http: HttpClient) {}

  getPage(params: HttpParams): Observable<PagedResponse<Report>> {
    return this.http.get<PagedResponse<Report>>(`${this.base}/page`, { params });
  }

  getById(id: number): Observable<Report> {
    return this.http.get<Report>(`${this.base}/${id}`);
  }

  getAll(): Observable<Report[]> {
    return this.http.get<Report[]>(this.base);
  }

  create(payload: unknown): Observable<Report> {
    return this.http.post<Report>(this.base, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  manualDayClose(day?: string): Observable<void> {
    let params = new HttpParams();
    if (day) params = params.set('day', day);
    return this.http.post<void>(`${this.base}/daily/finalize-and-close`, {}, { params });
  }

  generateMonthly(month: string): Observable<Report> {
    return this.http.post<Report>(`${this.base}/monthly/generate`, {}, {
      params: new HttpParams().set('month', month)
    });
  }

  getScheduleConfig(): Observable<ReportScheduleConfig> {
    return this.http.get<ReportScheduleConfig>(`${this.base}/schedule`);
  }

  updateScheduleConfig(config: ReportScheduleConfig): Observable<ReportScheduleConfig> {
    return this.http.put<ReportScheduleConfig>(`${this.base}/schedule`, config);
  }
}
