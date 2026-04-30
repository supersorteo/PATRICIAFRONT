import { Injectable } from '@angular/core';
import { Client, Space, Subsuelo, VehicleType } from '../models/autolavado.model';

export interface StorageSyncKeys {
  subs: string;
  spaces: string;
  clients: string;
  currentSub: string;
  vehicleTypes: string;
}

export interface LocalAppState {
  subsuelos: Subsuelo[];
  spaces: { [key: string]: Space };
  clients: { [key: string]: Client };
  currentSubId: string | null;
  vehicleTypes: VehicleType[];
}

@Injectable({
  providedIn: 'root'
})
export class StorageSyncService {
  loadState(keys: StorageSyncKeys): LocalAppState {
    try {
      return {
        subsuelos: JSON.parse(localStorage.getItem(keys.subs) || '[]') as Subsuelo[],
        spaces: JSON.parse(localStorage.getItem(keys.spaces) || '{}') as { [key: string]: Space },
        clients: JSON.parse(localStorage.getItem(keys.clients) || '{}') as { [key: string]: Client },
        currentSubId: localStorage.getItem(keys.currentSub),
        vehicleTypes: JSON.parse(localStorage.getItem(keys.vehicleTypes) || '[]') as VehicleType[]
      };
    } catch (error) {
      console.error('Error al cargar datos de localStorage:', error);
      return {
        subsuelos: [],
        spaces: {},
        clients: {},
        currentSubId: null,
        vehicleTypes: []
      };
    }
  }

  saveState(keys: StorageSyncKeys, state: LocalAppState): void {
    try {
      localStorage.setItem(keys.subs, JSON.stringify(state.subsuelos));
      localStorage.setItem(keys.spaces, JSON.stringify(state.spaces));
      localStorage.setItem(keys.clients, JSON.stringify(state.clients));
      localStorage.setItem(keys.vehicleTypes, JSON.stringify(state.vehicleTypes));

      if (state.currentSubId) {
        localStorage.setItem(keys.currentSub, state.currentSubId);
      } else {
        localStorage.removeItem(keys.currentSub);
      }
    } catch (error) {
      console.error('Error al guardar datos en localStorage:', error);
    }
  }

  clearState(keys: StorageSyncKeys): void {
    localStorage.removeItem(keys.subs);
    localStorage.removeItem(keys.spaces);
    localStorage.removeItem(keys.clients);
    localStorage.removeItem(keys.currentSub);
    localStorage.removeItem(keys.vehicleTypes);
  }
}
