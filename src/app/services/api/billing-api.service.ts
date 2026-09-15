import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface BillingReport {
  id: number;
  reportJson: string;
  periodLabel: string;
  clientName: string;
  status: 'PENDING' | 'PAID';
  sentAt: string;
  paidAt: string;
}

@Injectable({ providedIn: 'root' })
export class BillingApiService {

  private base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getLatest(token: string): Observable<BillingReport | null> {
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
    return this.http.get<BillingReport>(`${this.base}/billing/latest`, { headers }).pipe(
      catchError(() => of(null))
    );
  }

  markPaid(id: number, token: string): Observable<BillingReport | null> {
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
    return this.http.put<BillingReport>(`${this.base}/billing/${id}/paid`, {}, { headers }).pipe(
      catchError(() => of(null))
    );
  }

  getAll(token: string): Observable<BillingReport[]> {
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
    return this.http.get<BillingReport[]>(`${this.base}/billing/all`, { headers }).pipe(
      catchError(() => of([]))
    );
  }

  delete(id: number, token: string): Observable<boolean> {
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
    return this.http.delete<void>(`${this.base}/billing/${id}`, { headers }).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }
}
