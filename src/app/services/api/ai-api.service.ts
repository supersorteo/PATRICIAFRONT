import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AiApiService {
  private readonly apiBase = environment.apiUrl;

  constructor(private http: HttpClient) {}

  ask(question: string): Observable<{ answer: string }> {
    const token = localStorage.getItem('token') ?? '';
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post<{ answer: string }>(
      `${this.apiBase}/ai/help`,
      { question },
      { headers }
    );
  }
}
