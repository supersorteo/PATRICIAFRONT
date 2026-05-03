import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Space, Subsuelo } from '../../models/autolavado.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SpacesApiService {
  private readonly apiBase = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getSubsuelos(): Observable<Subsuelo[]> {
    return this.http.get<Subsuelo[]>(`${this.apiBase}/subsuelos`);
  }

  getSpaces(): Observable<Space[]> {
    return this.http.get<Space[]>(`${this.apiBase}/spaces`);
  }

  createSubsuelo(subsuelo: Subsuelo): Observable<Subsuelo> {
    return this.http.post<Subsuelo>(`${this.apiBase}/subsuelos`, subsuelo);
  }

  createSpace(space: Space): Observable<Space> {
    return this.http.post<Space>(`${this.apiBase}/spaces`, space);
  }

  deleteSubsuelo(subsueloId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/subsuelos/${subsueloId}`);
  }

  deleteSpace(spaceKey: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/spaces/${spaceKey}`);
  }

  updateSpace(space: Space): Observable<Space> {
    const payload = {
      key: space.key,
      subsueloId: space.subsueloId,
      occupied: !!space.occupied,
      hold: !!space.hold,
      clientId: space.clientId ?? null,
      startTime: space.startTime ?? null,
      displayName: space.displayName ?? null,
      whatsappSent: !!space.whatsappSent
    };

    return this.http.put<Space>(`${this.apiBase}/spaces/${space.key}`, payload);
  }

  updateSubsuelo(subsuelo: Subsuelo): Observable<Subsuelo> {
    return this.http.put<Subsuelo>(`${this.apiBase}/subsuelos/${subsuelo.id}`, subsuelo);
  }

  transferSpace(spaceKey: string, newSubsueloId: string): Observable<Space> {
    return this.http.put<Space>(`${this.apiBase}/spaces/${spaceKey}/transfer`, { newSubsueloId });
  }
}
