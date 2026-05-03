import { ChangeDetectionStrategy, Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

import { Subject, takeUntil, combineLatest, BehaviorSubject, forkJoin, debounceTime, distinctUntilChanged, map, switchMap, of, catchError, Observable } from 'rxjs';
import { Client, Space, Subsuelo, VehicleType } from '../../models/autolavado.model';
import { AutolavadoService, ClientReservationsLookupResult, PagedResponse } from '../../services/autolavado.service';
import { QrService } from '../../services/qr.service';
import { ToastService } from '../../services/toast.service';
import { ConfirmService } from '../../services/confirm.service';

import intlTelInput from 'intl-tel-input';
import { FormatPhonePipe } from "../../services/format-phone.pipe";
import * as XLSX from 'xlsx';
declare var bootstrap: any;

interface ClientVehicleItem {
  model: string;
  plate?: string;
  notes?: string;
  lastSeenTs?: number;
  isLatest?: boolean;
  //category?: string;
  //price?: number;
}

interface TransferSubsueloOption {
  id: string;
  label: string;
  totalSpaces: number;
  occupiedSpaces: number;
  freeSpaces: number;
}

interface AdminEditableClient {
  id: number | string;
  code?: string;
  name: string;
  dni?: string;
  phoneIntl: string;
  vehicle?: string;
  plate?: string;
  notes?: string;
  category?: string;
  price?: number | null;
  paymentMethod?: string;
  clover?: number | null;
  spaceKey?: string | null;
}

@Component({
  selector: 'app-spaces',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FormatPhonePipe],
  templateUrl:'./spaces.component.html',
  styleUrls: ['./spaces.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})

export class SpacesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  @ViewChild('occQRElm', { static: false }) occQRContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('phoneInput') phoneInput!: ElementRef<HTMLInputElement>;
  private searchTermSubject = new BehaviorSubject<string>('');
  newSpaceKey = '';
  selectedNewSubsuelo = '';
  subsuelos: Subsuelo[] = [];
  spaces: { [key: string]: Space } = {};
  clients: { [key: string]: Client } = {};
  currentSubId: string | null = null;
  currentSubTitle = 'Espacios';
  filteredSpaces: Space[] = [];
  searchTerm = '';
  addSpacesCount = 5;
  isClientsDbOpen = false;

 private uiRefreshIntervalId: any = null;
private phoneInputElRef: HTMLInputElement | null = null;
private newPhoneInputElRef: HTMLElement | null = null;

private onPhoneInputListener = () => this.updatePhoneInfo(true);
private onPhoneCountryChangeListener = () => this.updatePhoneInfo(true);

private onNewPhoneInputListener = () => this.updateNewPhoneInfo();
private onNewPhoneCountryChangeListener = () => this.updateNewPhoneInfo();

allClients: Client[] = [];
monthlyServiceCountByKey = new Map<string, number>();
monthlyServiceCountLoadingKeys = new Set<string>();

monthlyServiceCountByDni = new Map<string, number>();
monthlyServiceCountBatchLoading = false;
monthlyServiceCountCacheMonthKey = '';
isClosingDay = false;
dniLookupSource: 'server' | 'local' | null = null;
dniLookupMessage = '';


clientReservationsHistory: Client[] = [];
private activeClientVehiclesKey: string | null = null;

  searchTermClients = '';
  filteredClientsAdmin: Client[] = [];
  clientsAdminPage = 0;
  clientsAdminPageSize = 20;
  clientsAdminTotalPages = 0;
  clientsAdminTotalElements = 0;
  isLoadingClientsAdmin = false;
  isSavingEditedAdminClient = false;
  private clientsAdminSearchTimer: any = null;
  editedAdminClient: AdminEditableClient | null = null;
  //editedSpace: any = {}; // Nueva propiedad para datos del espacio editado
  editedSpace: Space | null = null;
  currentPage: number = 1;
  itemsPerPage: number = 14;

  // Modal data
  selectedSpaceKey = '';
  selectedSpace: Space | null = null;
  selectedClient: Client | null = null;
  showQR = false;
  showOccupiedQR = false;
  qrCaption = '';
  whatsappLink = '';

  clientForm: FormGroup;
  editedSubsueloLabel = '';

  whatsappMessage: string = '';

  showWhatsAppModal: boolean = false;

  hasCopiedMessage: boolean = false;

  showWhatsAppModalOccupied = false;
  whatsappMessageOccupied = '';
  whatsappMessageOccupied0 = '';
  hasCopiedMessageOccupied = false;
  showTransferSpaceModal = false;
  isSubmittingTransferSpace = false;
  selectedTransferSubsueloId = '';
  transferSubsueloOptions: TransferSubsueloOption[] = [];
  sentReleaseWhatsappBySpace = new Set<string>();
  private readonly WHATSAPP_SENT_KEY = 'exellsior_whatsapp_sent_';
  private readonly WHATSAPP_SENT_STORAGE_KEY = 'exellsior_whatsapp_sent_spaces';
  cerrarDiaModalMessage = '';
  cerrarDiaResultMessage = '';
  saveClientHeaderMessage = '';
  private saveClientHeaderTimer: any = null;

vehicles: VehicleType[] = [];
existingClientId: any | null = null;
horaCierreAutomatico = '23:59';

showVehicleModal = false;
newVehicle = {
  model: '',
  category: '',
  price: 35000
};
vehicleTypes: VehicleType[] = []; // Lista actualizada
selectedVehicleModel = '';



showNewVehicleModal = false;
newVehicleModel = '';
newVehicleCategory = 'AUTO';
newVehiclePrice = 35000;
private vehicleModalFocusGuard: ((e: FocusEvent) => void) | null = null;

showVehicleAside = false;
vehicleFilter = '';
selectedVehicleCategory = '';

readonly vehicleCategories = [
  { value: 'AUTO',       icon: 'bi-car-front-fill',    activeColor: 'linear-gradient(135deg,#6366f1,#818cf8)' },
  { value: 'SUV',        icon: 'bi-truck',              activeColor: 'linear-gradient(135deg,#0ea5e9,#38bdf8)' },
  { value: 'PICKUP',     icon: 'bi-truck-flatbed',      activeColor: 'linear-gradient(135deg,#f59e0b,#fbbf24)' },
  { value: 'ALTO PORTE', icon: 'bi-bus-front-fill',     activeColor: 'linear-gradient(135deg,#ef4444,#f87171)' },
  { value: 'MOTO',       icon: 'bi-bicycle',            activeColor: 'linear-gradient(135deg,#22c55e,#4ade80)' },
];

currentVehiclePage = 1;
vehiclePageSize = 20;

clientModalInstance: any = null;


//phoneCountry: string = 'Argentina';   // Nombre
//phoneFlag: string = '🇦🇷';            // Bandera
//phoneCode: string = '+54';            // ← NUEVO: mostrar el código
//phoneIsValid: boolean = false;
public detectedCountryCode: string | null = null;




  private iti: any; // Instancia de intl-tel-input

  phoneIsValid = false;
  phoneCountry = '';
  phoneFlag = '';
  phoneCode = '';
  isModalOpen = false;
  phoneErrorMessage: string = '';

  isClientModalOpen = false;


isNewClientModalOpen = false;
isSavingClient = false;
newClient: any = {
  name: '',
  dni: '',
  phoneIntl: '',
  vehicle: '',
  plate: '',
  category: '',
  price: null,
  paymentMethod: '',
  clover: null,
  notes: ''
};

isLoading = false;
showNewClientModal = false;

newClientForm!: FormGroup;
newPhoneInput!: ElementRef<HTMLInputElement>;
newPhoneIsValid = false;
newPhoneFlag = '';
newPhoneCode = '';
newPhoneCountry = '';
private newIti: any;
isSavingNewClient = false;
isVehicleAsideFromManual = false;
newPhoneErrorMessage: string = '';
showClientVehiclesModal = false;
clientVehiclesList: ClientVehicleItem[] = []; // lista temporal para el modal
//clientVehicleEditor = { model: '', plate: '', notes: '' };
editingClientVehicleIndex: number | null = null;
//clientVehiclesStore: { [clientKey: string]: ClientVehicleItem[] } = {};

clientVehicleEditor: ClientVehicleItem = { model: '', plate: '', notes: '' };
//clientVehicleEditor: ClientVehicleItem = { model: '', category: '', price: 0 };
clientVehiclesStore: { [key: string]: ClientVehicleItem[] } = {};
showFrequentClientModal = false;
frequentClientVisitsSnapshot: Client[] = [];

//private readonly TIER_ORO = 10;
//private readonly TIER_PLATA = 5;
//private readonly TIER_BRONCE = 3;

isLoadingClientVehiclesModal = false;
isSyncingClientVehicles = false;
clientVehiclesModalError = '';


  constructor(
    private autolavadoService: AutolavadoService,
    private qrService: QrService,
    private fb: FormBuilder,
     private cdr: ChangeDetectorRef,
     private toastService: ToastService,
     private confirmService: ConfirmService
  ) {
    this.clientForm = this.fb.group({
      name: ['', Validators.required],
      dni: ['', [Validators.required, Validators.pattern('[0-9]{7,8}')]],
      //phone: ['', [Validators.required, Validators.pattern(/^[0-9]{8,10}$/)]],
      phone: ['', Validators.required],
      vehicle: ['', Validators.required],
      price: [0, [Validators.required, Validators.min(1)]],
      plate: [''],
      notes: ['']
    });

    this.newClientForm = this.fb.group({
  name: ['', Validators.required],
  //dni: ['', [Validators.pattern('[0-9]{7,8}')]],
  dni: ['', [Validators.required, Validators.pattern('[0-9]{7,8}')]],
  phoneIntl: ['', Validators.required],
  vehicle: ['', Validators.required],
  plate: ['', Validators.required],
  category: [''],
  price: [null]
});
  }


ngOnInit(): void {
  // 1. VERIFICAR SI HAY DATOS EN LOCALSTORAGE
  /*const localSubsuelos = localStorage.getItem('subsuelos');
  const localSpaces = localStorage.getItem('spaces');

  if (!localSubsuelos || !localSpaces || JSON.parse(localSubsuelos).length === 0) {
    console.log('LocalStorage vacío → cargando desde backend como respaldo');
    this.loadDataFromBackend();
  } else {
    console.log('Datos encontrados en localStorage → usando local');
    // Aquí NO llamamos a ningún método → el servicio ya cargó los datos al iniciar
    // (tu servicio probablemente los carga en el constructor o al instanciarse)
  }*/

  // 1. Inicializar datos: backend como fuente principal, localStorage como fallback
this.autolavadoService.initializeDataPreferBackend();


  // 2. SUSCRIPCIONES REACTIVAS (igual que antes)
  combineLatest([
    this.autolavadoService.subsuelos$,
    this.autolavadoService.spaces$,
    this.autolavadoService.clients$,
    this.autolavadoService.currentSubId$,
    this.searchTermSubject
  ]).pipe(takeUntil(this.destroy$))
  .subscribe(([subsuelos, spaces, clients, currentSubId]) => {
    this.subsuelos = subsuelos;
    this.spaces = spaces;
    this.clients = clients;
    this.currentSubId = currentSubId;

    console.log('[Spaces ngOnInit] combineLatest update', {
  subsuelos: subsuelos.length,
  spaces: Object.keys(spaces || {}).length,
  clients: Object.keys(clients || {}).length,
  currentSubId
});


    this.updateCurrentSubTitle();
    this.filterSpaces();
    this.cdr.markForCheck();


  });

  /*this.searchTermSubject.subscribe(() => {
    this.currentPage = 1;
    this.filterSpaces();
  });

  setInterval(() => {
    this.cdr.detectChanges();
  }, 60000);*/

this.searchTermSubject
  .pipe(takeUntil(this.destroy$))
  .subscribe(() => {
    this.currentPage = 1;
    this.filterSpaces();
    this.cdr.markForCheck();
  });

this.uiRefreshIntervalId = setInterval(() => {
  if (!this.shouldRefreshLiveSpaceTimes()) {
    return;
  }

  this.cdr.markForCheck();
}, 60000);


  // 3. CARGAR VEHÍCULOS DESDE BACKEND (siempre)
  const cachedVehicleTypes = this.autolavadoService.vehicleTypesSubject.value;
  if (cachedVehicleTypes.length > 0) {
    this.applyVehicleTypes(cachedVehicleTypes);
  }
  this.autolavadoService.loadVehicleTypes().pipe(takeUntil(this.destroy$)).subscribe({
    next: (vehicles: VehicleType[]) => {
      this.applyVehicleTypes(vehicles);
      console.log('Tipos de vehiculos cargados desde backend:', vehicles);
      this.cdr.markForCheck();
    },
    error: (err) => {
      const cached = this.autolavadoService.vehicleTypesSubject.value;
      if (cached.length > 0) {
        this.applyVehicleTypes(cached);
      } else {
        console.error('Error al cargar vehiculos', err);
        this.toastService.showError('Sin conexion: no hay tipos de vehiculos disponibles.');
      }
      this.cdr.markForCheck();
    }
  });




  this.clientForm.get('dni')?.valueChanges
  .pipe(
    debounceTime(600),
    map((dni) => (dni || '').toString().trim()),
    distinctUntilChanged(),
    takeUntil(this.destroy$),
    switchMap((dni) => this.fetchReservationsByDni$(dni))
  )
  .subscribe((reservations) => {
    this.handleReservationsByDniResult(reservations);
    this.cdr.markForCheck();
  });




 //this.limpiarEspaciosDeDiasAnteriores();
// NUEVO: Mantener allClients y filteredClientsAdmin sincronizados con el servicio





  this.autolavadoService.clients$
  .pipe(takeUntil(this.destroy$))
  .subscribe((clientsMap) => {
    this.allClients = Object.values(clientsMap);
    if (!this.isClientsDbOpen) {
      this.filteredClientsAdmin = this.allClients;
    }

    console.log('[Spaces] clients$ actualizado', {
      totalMap: Object.keys(clientsMap || {}).length,
      totalArray: this.allClients.length,
      sample: this.allClients.slice(0, 3)
    });
    this.cdr.markForCheck();
  });


  this.loadSentWhatsappState();

}






private applyVehicleTypes(vehicles: VehicleType[]): void {
  this.vehicles = [...(vehicles || [])].sort((a, b) => a.model.localeCompare(b.model));

  const currentVehicle = this.clientForm.get('vehicle')?.value;
  if (!currentVehicle && this.vehicles.length > 0) {
    const defaultVehicle = this.vehicles[0];
    this.clientForm.patchValue({
      vehicle: defaultVehicle.model,
      price: defaultVehicle.price
    });
  }
}

private shouldRefreshLiveSpaceTimes(): boolean {
  const spacesArray = Object.values(this.spaces || {});
  if (spacesArray.some(space => !!space?.occupied && !!space?.startTime)) {
    return true;
  }

  return !!this.selectedSpace?.occupied && !!this.selectedSpace?.startTime;
}

ngAfterViewInit(): void {
  this.iti = intlTelInput(this.phoneInput.nativeElement, {
    initialCountry: 'ar',
    preferredCountries: ['ar', 'br', 'cl', 'co', 've', 'pe', 'bo', 'py', 'uy', 'ec', 'cu'],
    utilsScript: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/19.2.15/js/utils.js',
    separateDialCode: true,
    nationalMode: false,
    formatOnDisplay: true,
    autoPlaceholder: 'polite',
    placeholderNumberType: 'MOBILE'
  });

  // Guardar referencia para poder remover listeners en ngOnDestroy
  this.phoneInputElRef = this.phoneInput.nativeElement;

  // Listener para input manual
  this.phoneInputElRef.addEventListener('input', this.onPhoneInputListener);

  // Listener para cambio de país
  this.phoneInputElRef.addEventListener('countrychange', this.onPhoneCountryChangeListener);

  // Listener para cambios externos (DNI, patchValue, etc.)
  this.clientForm.get('phone')?.valueChanges
    .pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    )
    .subscribe(newPhone => {
      console.log('[valueChanges] Teléfono cambiado desde código:', newPhone);

      if (newPhone && this.iti) {
        const currentNumber = this.iti.getNumber();

        // Solo actualizar si es diferente (evita loops infinitos)
        if (currentNumber !== newPhone) {
          console.log('[valueChanges] Actualizando iti con:', newPhone);
          this.iti.setNumber(newPhone);
          this.updatePhoneInfo(false); // false = carga externa
        }
      }
    });

  // Fuerza validación inicial si ya hay valor
  const initialPhone = this.clientForm.get('phone')?.value;
  if (initialPhone && this.iti) {
    console.log('[ngAfterViewInit] Validación inicial con teléfono existente:', initialPhone);
    this.iti.setNumber(initialPhone);
    this.updatePhoneInfo(false);
  }

  // Inicializar teléfono del modal de nuevo cliente
  setTimeout(() => {
    const phoneEl = document.getElementById('newPhoneIntlInput');
    if (!phoneEl) return;

    this.newPhoneInputElRef = phoneEl;

    this.newIti = intlTelInput(phoneEl, {
      initialCountry: 'ar',
      preferredCountries: ['ar', 'br', 'cl', 'co', 've', 'pe', 'bo', 'py', 'uy', 'ec', 'cu'],
      utilsScript: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/19.2.15/js/utils.js',
      separateDialCode: true,
      nationalMode: false,
      formatOnDisplay: true,
      autoPlaceholder: 'polite',
      placeholderNumberType: 'MOBILE'
    });

    // Listeners removibles
    this.newPhoneInputElRef.addEventListener('input', this.onNewPhoneInputListener);
    this.newPhoneInputElRef.addEventListener('countrychange', this.onNewPhoneCountryChangeListener);

    // Sincronizar valueChanges
    this.newClientForm.get('phoneIntl')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        if (value && this.newIti && this.newIti.getNumber() !== value) {
          this.newIti.setNumber(value);
          this.updateNewPhoneInfo();
        }
      });
  }, 0);
}



private updatePhoneInfo(fromUserInput: boolean = false): void {
  if (!this.iti) {
    console.warn('[updatePhoneInfo] intl-tel-input no inicializado');
    return;
  }

  let fullNumber = this.iti.getNumber();

  // Asegurar + al inicio
  if (!fullNumber.startsWith('+')) {
    const countryData = this.iti.getSelectedCountryData();
    fullNumber = '+' + countryData.dialCode + fullNumber;
    console.log('[updatePhoneInfo] Agregado + manualmente:', fullNumber);
  }

  // Validación completa
  const countryData = this.iti.getSelectedCountryData();
  const dialCode = countryData.dialCode;
  let isValid = this.iti.isValidNumber(); // Validación base de la librería
  let errorMessage = '';

  if (dialCode === '54') {
    const digits = fullNumber.replace('+54', '');
    if (!digits.startsWith('9')) {
      isValid = false;
      errorMessage = 'Los móviles argentinos deben tener el 9 después de +54';
    } else {
      const afterNine = digits.substring(1);
      if (afterNine.startsWith('11')) {
        isValid = digits.length === 11;
        if (!isValid) errorMessage = 'Buenos Aires: debe tener 8 dígitos después del 11';
      } else if (afterNine.match(/^[234]\d{2}/)) {
        isValid = digits.length >= 10 && digits.length <= 12;
        if (!isValid) errorMessage = 'Provincia Bs As: formato +54 9 2XX XXXXXX';
      } else {
        isValid = digits.length >= 10 && digits.length <= 11;
        if (!isValid) errorMessage = 'Formato general: +54 9 [código área] [número]';
      }
    }
  }

  // Guardar en el form SOLO si viene del usuario (evita loops)
  if (fromUserInput) {
    this.clientForm.patchValue({ phone: fullNumber }, { emitEvent: false });
    console.log('[updatePhoneInfo] Actualizado formControl:', fullNumber);
  }

  // ACTUALIZAR ESTADO VISUAL (esto es lo clave para que cambie la palomita)
  this.phoneIsValid = isValid;
  this.phoneErrorMessage = errorMessage;
  this.phoneCountry = countryData.name || 'Desconocido';
  this.phoneFlag = this.getFlagEmoji(countryData.iso2);
  this.phoneCode = '+' + dialCode;

  console.log('[updatePhoneInfo] Resultado:', {
    fullNumber,
    isValid,
    errorMessage,
    phoneIsValid: this.phoneIsValid,
    fromUserInput
  });

  this.cdr.detectChanges(); // Forzar actualización visual
}

getPhoneFormatHint(): string {
  if (!this.iti) return '';

  const countryData = this.iti.getSelectedCountryData();
  const dialCode = countryData.dialCode;

  if (dialCode === '54') {
    const phone = this.clientForm.get('phone')?.value || '';
    const match = phone.match(/^\+549(\d+)/);

    if (match) {
      const afterNine = match[1];
      if (afterNine.startsWith('11')) {
        return '+54 9 11 XXXXXXXX (8 dígitos)';
      } else if (afterNine.match(/^[234]\d{2}/)) {
        return '+54 9 XXX XXXXXX/XXXXXXX (6-7 dígitos)';
      }
    }
    return '+54 9 [código área] [número]';
  }

  return '';
}



private updateNewPhoneInfo(): void {
  if (!this.newIti) return;

  let fullNumber = this.newIti.getNumber();
  if (!fullNumber.startsWith('+')) {
    const countryData = this.newIti.getSelectedCountryData();
    fullNumber = '+' + countryData.dialCode + fullNumber;
  }

  this.newPhoneIsValid = this.newIti.isValidNumber();

  const countryData = this.newIti.getSelectedCountryData();
  this.newPhoneFlag = this.getFlagEmoji(countryData.iso2);
  this.newPhoneCode = '+' + countryData.dialCode;
  this.newPhoneCountry = countryData.name || 'Desconocido';

  // Guardar en form
  this.newClientForm.patchValue({ phoneIntl: fullNumber }, { emitEvent: false });

  // Validación extra Argentina (copia tu código)
  this.newPhoneErrorMessage = '';
  if (countryData.dialCode === '54') {
    const digits = fullNumber.replace('+54', '');
    if (!digits.startsWith('9')) {
      this.newPhoneIsValid = false;
      this.newPhoneErrorMessage = 'Los móviles argentinos deben tener el 9 después de +54';
    }
  }

  this.cdr.detectChanges();
}



  private getFlagEmoji(iso2: string): string {
    if (!iso2) return '🌍';
    return iso2.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
  }


private toTimestampLocal(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

private getIdentityKeyForClient(c: Client): string {
  const dni = (c.dni || '').toString().trim();
  const phone = (c.phoneIntl || '').toString().replace(/\D/g, '');
  const name = (c.name || '').toString().trim().toLowerCase();

  if (dni) return `dni:${dni}`;
  if (phone) return `phone:${phone}`;
  return `name:${name}`;
}




getMonthlyServiceCountForClient(client: Client): number {
  this.ensureMonthlyServiceCountCacheForCurrentMonth();

  const dni = (client?.dni || '').toString().trim();
  if (!dni) return 0;

  this.preloadMonthlyServiceCountsForClients(this.filteredClientsAdmin || this.allClients || []);

  return this.monthlyServiceCountByDni.get(dni) ?? 0;
}


private getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}


private ensureMonthlyServiceCountCacheForCurrentMonth(): void {
  const currentMonthKey = this.getCurrentMonthKey();

  if (this.monthlyServiceCountCacheMonthKey !== currentMonthKey) {
    console.log('[MonthlyCount] Cambio de mes detectado. Limpiando cache.', {
      previous: this.monthlyServiceCountCacheMonthKey || '(empty)',
      next: currentMonthKey
    });

    this.monthlyServiceCountByDni.clear();
    this.monthlyServiceCountLoadingKeys?.clear?.(); // por si aún tienes esta estructura vieja
    this.monthlyServiceCountBatchLoading = false;
    this.monthlyServiceCountCacheMonthKey = currentMonthKey;
  }
}


/*getClientTierByCount(count: number): 'oro' | 'plata' | 'bronce' | 'ninguno' {
  if (count >= this.TIER_ORO) return 'oro';
  if (count >= this.TIER_PLATA) return 'plata';
  if (count >= this.TIER_BRONCE) return 'bronce';
  return 'ninguno';
}*/



private loadMonthlyServiceCountForClient(client: Client): void {
  const dni = (client?.dni || '').toString().trim();
  const key = this.getIdentityKeyForClient(client);

  if (!dni || !key) return;
  if (this.monthlyServiceCountByKey.has(key)) return;
  if (this.monthlyServiceCountLoadingKeys.has(key)) return;

  this.monthlyServiceCountLoadingKeys.add(key);

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  this.autolavadoService.getMonthlyServiceCountByDni(dni, monthKey).pipe(takeUntil(this.destroy$)).subscribe({
    next: (count) => {
      this.monthlyServiceCountByKey.set(key, Number(count || 0));
      this.monthlyServiceCountLoadingKeys.delete(key);

      console.log('[MonthlyCount] loaded', { dni, key, monthKey, count });
      this.cdr.markForCheck();
    },
    error: (err) => {
      this.monthlyServiceCountByKey.set(key, 0);
      this.monthlyServiceCountLoadingKeys.delete(key);

      console.warn('[MonthlyCount] error', { dni, key, err });
      this.cdr.markForCheck();
    }
  });
}




private preloadMonthlyServiceCountsForClients(clients: Client[]): void {
  this.ensureMonthlyServiceCountCacheForCurrentMonth();

  if (this.monthlyServiceCountBatchLoading) return;

  const dnis = Array.from(new Set(
    (clients || [])
      .map(c => (c?.dni || '').toString().trim())
      .filter(Boolean)
  ));

  if (!dnis.length) return;

  const missing = dnis.filter(dni => !this.monthlyServiceCountByDni.has(dni));
  if (!missing.length) return;

  this.monthlyServiceCountBatchLoading = true;

  const monthKey = this.monthlyServiceCountCacheMonthKey || this.getCurrentMonthKey();

  this.autolavadoService.getMonthlyServiceCountsByDnis(missing, monthKey).pipe(takeUntil(this.destroy$)).subscribe({
    next: (counts) => {
      Object.entries(counts || {}).forEach(([dni, count]) => {
        this.monthlyServiceCountByDni.set(dni, Number(count || 0));
      });

      missing.forEach(dni => {
        if (!this.monthlyServiceCountByDni.has(dni)) {
          this.monthlyServiceCountByDni.set(dni, 0);
        }
      });

      this.monthlyServiceCountBatchLoading = false;

      console.log('[MonthlyCount][batch] loaded', {
        monthKey,
        requested: missing.length,
        received: Object.keys(counts || {}).length
      });
      this.cdr.markForCheck();
    },
    error: (err) => {
      this.monthlyServiceCountBatchLoading = false;
      console.warn('[MonthlyCount][batch] error', err);

      missing.forEach(dni => this.monthlyServiceCountByDni.set(dni, 0));
      this.cdr.markForCheck();
    }
  });
}



get canSubmitClientVehicleEditor(): boolean {
  return !!(this.clientVehicleEditor?.model || '').toString().trim() && !this.isSyncingClientVehicles;
}

private setClientVehiclesModalError(message: string = ''): void {
  this.clientVehiclesModalError = message;
}

private withClientVehiclesSyncLock<T>(fn: () => T): T | void {
  if (this.isSyncingClientVehicles) {
    console.log('[Vehicles] Acción bloqueada: sincronización en curso');
    return;
  }
  return fn();
}


private buildMonthlyRankingKeys(): string[] {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

  const all = this.allClients || [];
  const map = new Map<string, { count: number }>();

  all.forEach(c => {
    const ts = this.toTimestampLocal(c.entryTimestamp);
    if (ts === null || ts < monthStart || ts >= nextMonthStart) return;

    const key = this.getIdentityKeyForClient(c);
    map.set(key, { count: (map.get(key)?.count || 0) + 1 });
  });

  return Array.from(map.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
    .map(([key]) => key);
}


getTopTierForClient(client: Client): 'oro' | 'plata' | 'bronce' | 'ninguno' {
  const key = this.getIdentityKeyForClient(client);
  const topKeys = this.buildMonthlyRankingKeys();
  if (topKeys[0] === key) return 'oro';
  if (topKeys[1] === key) return 'plata';
  if (topKeys[2] === key) return 'bronce';
  return 'ninguno';
}


private loadSentWhatsappState() {
  const saved = localStorage.getItem(this.WHATSAPP_SENT_STORAGE_KEY);
  if (saved) {
    try {
      const keys = JSON.parse(saved) as string[];
      this.sentReleaseWhatsappBySpace = new Set(keys);
    } catch (e) {
      console.warn('Error cargando estado WhatsApp enviado', e);
    }
  }
}



private saveSentWhatsappState() {
  const keys = Array.from(this.sentReleaseWhatsappBySpace);
  localStorage.setItem(this.WHATSAPP_SENT_STORAGE_KEY, JSON.stringify(keys));
}

resetNewClientForm() {
  this.newClientForm.reset();
  this.newPhoneIsValid = false;
  this.newPhoneFlag = '';
  this.newPhoneCode = '';
  this.newPhoneCountry = '';
  this.newPhoneErrorMessage = '';
  if (this.newIti) {
    this.newIti.setNumber('');
    this.newIti.setCountry('ar');
  }
  this.isSavingNewClient = false;
}

// Abrir modal
openNewClientModal() {
  this.resetNewClientForm(); // Resetear siempre al abrir
  const modal = new bootstrap.Modal(document.getElementById('newClientModal'));
  modal.show();
}




openVehicleAsideForManual() {
  this.isVehicleAsideFromManual = true; // Bandera para saber desde dónde se abrió
  this.openVehicleAside(); // Tu método actual
}







selectVehicle(v: VehicleType) {
  if (this.isVehicleAsideFromManual) {
    // Modal de nuevo cliente manual
    this.newClientForm.patchValue({
      vehicle: v.model,
      category: v.category,
      price: v.price
    });
  } else {
    // Modal de reserva de espacio
    this.clientForm.patchValue({
      vehicle: v.model,
      category: v.category,
      price: v.price
    });

    const existingVehicle = this.findClientVehicleByModel(v.model);
    this.clientForm.patchValue({
      plate: existingVehicle?.plate || '',
      notes: existingVehicle?.notes || ''
    });
  }

  this.closeVehicleAside();
  this.isVehicleAsideFromManual = false;

  this.toastService.showSuccess(`Vehículo seleccionado: ${v.model} - $${v.price}`);
}





async saveNewClient() {
  this.newClientForm.markAllAsTouched();

  if (this.newClientForm.invalid || !this.newPhoneIsValid) {
    this.isSavingNewClient = false;
    return;
  }

  const selectedVehicleModel = this.newClientForm.value.vehicle;
  const selectedVehicle = this.vehicles.find(v => v.model === selectedVehicleModel);

  // construir clientVehicles
  const clientVehicles = selectedVehicle ? [{
    vehicleType: { id: selectedVehicle.id },
    plate: this.newClientForm.value.plate || '',
    notes: this.newClientForm.value.notes || ''
  }] : [];

  const clientData = {
    ...this.newClientForm.value,
    phoneIntl: this.newClientForm.value.phoneIntl,
    vehicle: this.newClientForm.value.vehicle,
    plate: this.newClientForm.value.plate,
    price: this.newClientForm.value.price,
    clientVehicles   // <-- en vez de vehicleTypes
  };

  const confirmed = await this.confirmService.confirm({
    title: 'Crear cliente manual',
    message:
      `Crear cliente manual "${this.newClientForm.value.name}" con el vehiculo "${this.newClientForm.value.vehicle}"?`,
    confirmText: 'Crear cliente',
    cancelText: 'Cancelar',
    variant: 'primary'
  });

  if (!confirmed) {
    this.toastService.showInfo('Creacion de cliente cancelada.');
    this.isSavingNewClient = false;
    return;
  }

  this.isSavingNewClient = true;

  this.autolavadoService.addManualClient(clientData).subscribe({
    next: (savedClient) => {
      this.isSavingNewClient = false;
      this.toastService.showSuccess('Cliente agregado correctamente.');
      this.closeAndResetNewClientModal();
      this.clientsAdminPage = 0;
      this.loadClientsAdminPageFromBackend();
    },
    error: (err) => {
      this.isSavingNewClient = false;
      if (Number(err?.status || 0) === 0) {
        const offlineClient = this.autolavadoService.addManualClientOffline(clientData);
        this.autolavadoService.queueAddManualClientSync(clientData, String(offlineClient.id));
        this.closeAndResetNewClientModal();
        this.refreshClientsAdminFromLocalState();
        this.toastService.showWarning('Cliente guardado localmente. Se sincronizara cuando vuelva la conexion.');
        return;
      }

      this.toastService.showError('Error al guardar: ' + (err.error?.message || 'Intenta de nuevo'));
    }
  });
}


// Cerrar modal
closeNewClientModal() {
  this.showNewClientModal = false;
}

get paginatedVehicles(): VehicleType[] {
  const start = (this.currentVehiclePage - 1) * this.vehiclePageSize;
  return this.filteredVehicles.slice(start, start + this.vehiclePageSize);
}



get totalVehiclePages(): number {
  return Math.ceil(this.filteredVehicles.length / this.vehiclePageSize);
}

get vehiclePageNumbers(): number[] {
  const total = this.totalVehiclePages;
  const pages: number[] = [];
  for (let i = 1; i <= total; i++) {
    pages.push(i);
  }
  return pages;
}




private limpiarEspaciosDeDiasAnteriores(): void {
  const hoyInicio = new Date();
  hoyInicio.setHours(0, 0, 0, 0);
  const hoyTimestamp = hoyInicio.getTime();

  let necesitaLiberar = false;

  // Primero: verificar si hay algo que limpiar (esto es solo para log, no modifica nada)
  Object.values(this.autolavadoService.spacesSubject.value).forEach(space => {
    if (space.occupied && space.startTime && space.startTime < hoyTimestamp) {
      console.log(`Espacio ${space.key} ocupado desde día anterior → necesita reset completo`);
      necesitaLiberar = true;
    }
  });

  if (necesitaLiberar) {
    console.log('Días anteriores detectados → ejecutando reset completo (local + backend + recarga)');

    // Llamar al método completo: limpia local, backend y RECARGA todo fresco
    this.autolavadoService.resetData().subscribe({
      next: (result) => {
        console.log('Reset automático completado: espacios liberados y datos recargados');
        this.filterSpaces();
        this.cdr.detectChanges();
        if (result?.offlineQueued) {
          this.toastService.showWarning('Se aplico el reset localmente y quedo pendiente de sincronizacion con el servidor.');
        }
      },
      error: (err) => {
        console.warn('Error en reset automático', err);
        // Opcional: alert o toast
      }
    });
  } else {
    console.log('Todos los espacios ocupados son de hoy → nada que limpiar');
  }
}




private loadDataFromBackend(): void {
  forkJoin({
    subsuelos: this.autolavadoService.loadSubsuelosFromBackend(),
    spaces: this.autolavadoService.loadSpacesFromBackend(),
    clients: this.autolavadoService.loadClientsFromBackend()
  }).pipe(takeUntil(this.destroy$)).subscribe({
    next: ({ subsuelos, spaces, clients }) => {
      console.log('Datos cargados desde backend como respaldo');

      // Convertir spaces a mapa
      const spacesObj: { [key: string]: Space } = {};
      spaces.forEach(s => spacesObj[s.key] = s);

      // Convertir clients a mapa + CONVERTIR entryTimestamp a number
      const clientsMap: { [key: string]: Client } = {};
      clients.forEach(c => {
        // Convertir entryTimestamp de string (ISO) a number (timestamp)
        if (c.entryTimestamp && typeof c.entryTimestamp === 'string') {
          c.entryTimestamp = new Date(c.entryTimestamp).getTime();
        } else if (c.entryTimestamp && typeof c.entryTimestamp === 'object') {
          // Si es Date object (raro, pero por seguridad)
          c.entryTimestamp = (c.entryTimestamp as any).getTime();
        }
        // Si ya es number, lo dejamos como está

        clientsMap[c.id.toString()] = c;
      });

      // ACTUALIZAR LOS BEHAVIOR SUBJECTS
      this.autolavadoService.subsuelosSubject.next(subsuelos);
      this.autolavadoService.spacesSubject.next(spacesObj);
      this.autolavadoService.clientsSubject.next(clientsMap);

      // Guardar en localStorage con entryTimestamp como number
      this.autolavadoService.saveAll();

      // Subsuelo actual
      if (subsuelos.length > 0) {
        this.autolavadoService.currentSubIdSubject.next(subsuelos[0].id);
      }

      console.log('Datos sincronizados desde backend → localStorage actualizado');
    },
    error: (err) => {
      console.error('Error cargando datos desde backend', err);
      this.toastService.showWarning('No hay conexion. Se usaran datos locales si existen.');
    }
  });
}










openVehicleAside(): void {
  // Si ya tiene 4 vehículos, mostrar error y no abrir
  const total = this.clientVehiclesList?.length || 0;
  if (total >= 4) {
    this.toastService.showWarning('Solo se permiten hasta 4 vehiculos por cliente.');
    return;
  }

  // 1. Cerrar el modal de reserva si está abierto
  const clientModalElement = document.getElementById('clientModal');
  if (clientModalElement) {
    this.clientModalInstance = bootstrap.Modal.getInstance(clientModalElement);
    if (this.clientModalInstance) {
      this.clientModalInstance.hide();
      console.log('Modal de reserva cerrado para abrir aside');
    }
  }

  // 2. Abrir el aside
  this.showVehicleAside = true;
  this.vehicleFilter = '';
}





closeVehicleAside(): void {
  this.showVehicleAside = false;
  console.log('Aside de vehículos cerrado');

  // Solo reabrir el modal de RESERVA si NO venimos del modal manual
  if (!this.isVehicleAsideFromManual && this.clientModalInstance) {
    this.clientModalInstance.show();
    console.log('Modal de RESERVA reabierto después de cerrar aside');
  } else if (this.isVehicleAsideFromManual) {
    console.log('No reabrimos modal de reserva porque venimos del modal manual');
  }

  // Resetear la bandera para la próxima vez
  this.isVehicleAsideFromManual = false;
}

async onVehicleInput(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const typed = input.value.trim();

  if (typed && !this.vehicles.some(v => v.model.toLowerCase() === typed.toLowerCase())) {
    // Si escribió algo que no existe → ofrecer agregar
    const confirmed = await this.confirmService.confirm({
      title: 'Agregar vehiculo',
      message: `"${typed}" no existe en el catalogo. Deseas agregarlo ahora?`,
      confirmText: 'Agregar vehiculo',
      cancelText: 'Cancelar',
      variant: 'primary'
    });

    if (confirmed) {
      this.newVehicleModel = typed;
      this.openAddVehicleModal();
    } else {
      input.value = '';
    }
  }
}


get filteredVehicles(): VehicleType[] {
  const term = this.vehicleFilter.toLowerCase().trim();
  return this.vehicles.filter(v => {
    const matchesText = !term ||
      v.model.toLowerCase().includes(term) ||
      v.category.toLowerCase().includes(term);

    const matchesCategory = !this.selectedVehicleCategory ||
      v.category === this.selectedVehicleCategory;

    return matchesText && matchesCategory;
  });
}

setVehicleCategoryFilter(category: string): void {
  this.selectedVehicleCategory =
    this.selectedVehicleCategory === category ? '' : category;
  this.currentVehiclePage = 1;
}

openAddVehicleModal(): void {
  this.newVehicleModel = '';
  this.newVehicleCategory = 'AUTO';
  this.newVehiclePrice = 35000;
  const el = document.getElementById('addVehicleModal') as HTMLElement;

  // Corta la burbuja de focusin antes de que el FocusTrap del modal padre la intercepte
  this.vehicleModalFocusGuard = (e: FocusEvent) => e.stopPropagation();
  el.addEventListener('focusin', this.vehicleModalFocusGuard);

  const modal = new bootstrap.Modal(el, { focus: false });
  modal.show();
  setTimeout(() => {
    el.style.zIndex = '1070';
    const backdrop = document.querySelector('.modal-backdrop:last-of-type') as HTMLElement;
    if (backdrop) backdrop.style.zIndex = '1065';
    document.getElementById('newVehicleModelInput')?.focus();
  }, 50);
}

closeAddVehicleModal(): void {
  const el = document.getElementById('addVehicleModal');
  if (el && this.vehicleModalFocusGuard) {
    el.removeEventListener('focusin', this.vehicleModalFocusGuard);
    this.vehicleModalFocusGuard = null;
  }
  bootstrap.Modal.getInstance(el)?.hide();
}

// NUEVO MÉTODO: Cargar subsuelos y espacios desde backend como respaldo
openClientsAdminModal(): void {
  this.loadClientsAdminPageFromBackend();
  const modal = new bootstrap.Modal(document.getElementById('clientsAdminModal')!);
  modal.show();
}

openClientsDb(): void {
  this.isClientsDbOpen = true;
  this.clientsAdminPage = 0;
  this.searchTermClients = '';
  this.loadClientsAdminPageFromBackend();
}

closeClientsDb(): void {
  this.isClientsDbOpen = false;
  this.searchTermClients = '';
  this.clientsAdminPage = 0;
  this.clientsAdminTotalPages = 0;
  this.clientsAdminTotalElements = 0;

  if (this.clientsAdminSearchTimer) {
    clearTimeout(this.clientsAdminSearchTimer);
    this.clientsAdminSearchTimer = null;
  }
}


closeClientModal(): void {
  this.isClientModalOpen = false;
  this.clientForm.reset();
  this.whatsappLink = '';
  this.showClientVehiclesModal = false;
  this.showFrequentClientModal = false;
  this.dniLookupSource = null;
  this.dniLookupMessage = '';

  if (this.iti) {
    this.iti.setCountry('ar');
    this.iti.setNumber('');
    this.updatePhoneInfo();
  }
}

private toTimestamp(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

private getCurrentClientIdentity(): { dni: string; phone: string; name: string } {
  const dni = (this.clientForm.get('dni')?.value || '').toString().trim();
  const phone = (this.clientForm.get('phone')?.value || '').toString().replace(/\D/g, '');
  const name = (this.clientForm.get('name')?.value || '').toString().trim().toLowerCase();
  return { dni, phone, name };
}

private matchesClientIdentity(client: Client, identity: { dni: string; phone: string; name: string }): boolean {
  const clientDni = (client.dni || '').toString().trim();
  const clientPhone = (client.phoneIntl || '').toString().replace(/\D/g, '');
  const clientName = (client.name || '').toString().trim().toLowerCase();

  if (identity.dni && clientDni) {
    return identity.dni === clientDni;
  }

  if (identity.phone && clientPhone) {
    return identity.phone === clientPhone;
  }

  if (identity.name && clientName) {
    return identity.name === clientName;
  }

  return false;
}



private getVisitsForCurrentClientThisMonth(): Client[] {
  const identity = this.getCurrentClientIdentity();
  if (!identity.dni && !identity.phone && !identity.name) return [];

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

  return (this.allClients || [])
    .filter(client => this.matchesClientIdentity(client, identity))
    .filter(client => {
      const ts = this.getVisitTimestamp(client); // <-- entry o exit
      return ts !== null && ts >= monthStart && ts < nextMonthStart;
    })
    .sort((a, b) => (this.getVisitTimestamp(b) || 0) - (this.getVisitTimestamp(a) || 0));
}

public getVisitTimestamp(client: Client): number | null {
  return this.toTimestamp(client.entryTimestamp) ?? this.toTimestamp(client.exitTimestamp);
}



get frequentClientMonthlyVisitsCount(): number {
  return this.getVisitsForCurrentClientThisMonth().length;
}

get showFrequentClientButton(): boolean {
  return this.frequentClientMonthlyVisitsCount > 3;
}



openFrequentClientModal(): void {
  this.autolavadoService.getAllClientsFromBackend().pipe(takeUntil(this.destroy$)).subscribe({
    next: (clients) => {
      this.allClients = clients || [];
      const visits = this.getVisitsForCurrentClientThisMonth();
      this.frequentClientVisitsSnapshot = visits;
      this.showFrequentClientModal = true;

      console.log('[Frecuente] visitas del mes:', visits.length);
      console.table(
        visits.map(v => ({
          id: v.id,
          dni: v.dni,
          name: v.name,
          entryTimestamp: v.entryTimestamp,
          exitTimestamp: v.exitTimestamp,
          vehicle: v.vehicle,
          plate: v.plate,
          spaceKey: v.spaceKey
        }))
      );
      this.cdr.markForCheck();
    },
    error: (err) => {
      console.error('Error cargando clientes para modal frecuente', err);
      const visits = this.getVisitsForCurrentClientThisMonth();
      this.frequentClientVisitsSnapshot = visits;
      this.showFrequentClientModal = true;
      this.cdr.markForCheck();
    }
  });
}


closeFrequentClientModal(): void {
  this.showFrequentClientModal = false;
}




private getCurrentClientVehiclesKey(): string {
  const dni = (this.clientForm.get('dni')?.value || '').toString().trim();
  const name = (this.clientForm.get('name')?.value || '').toString().trim().toLowerCase();

  if (dni) return `dni:${dni}`;
  if (name) return `name:${name}`;

  // Fallback estable durante la sesión del modal/form
  if (this.activeClientVehiclesKey) {
    return this.activeClientVehiclesKey;
  }

  const random = Math.random().toString(36).substring(2, 6);
  this.activeClientVehiclesKey = `temp:${Date.now()}-${this.selectedSpaceKey || 'unknown'}-${random}`;
  return this.activeClientVehiclesKey;
}





private persistCurrentClientVehicles(): void {
  const key = this.activeClientVehiclesKey || this.getCurrentClientVehiclesKey();

  if (!key) {
    console.warn('[Vehicles] persistCurrentClientVehicles sin key');
    return;
  }

  if (!this.clientVehiclesList || this.clientVehiclesList.length === 0) {
    delete this.clientVehiclesStore[key];
    console.log('[Vehicles] Draft local eliminado', { key });
    return;
  }

  this.clientVehiclesStore[key] = this.clientVehiclesList.map(v => ({ ...v }));

  console.log('[Vehicles] Draft local persistido', {
    key,
    count: this.clientVehiclesStore[key].length,
    vehicles: this.clientVehiclesStore[key]
  });
}





private syncClientVehiclesListToBackend(
  reason: 'save' | 'delete',
  beforeLocalList?: ClientVehicleItem[]
): void {
  const dni = (this.clientForm.get('dni')?.value || '').toString().trim();

  if (!dni) {
    console.log('[Vehicles] sync backend omitido (sin DNI). Se mantiene draft local.', { reason });
    return;
  }

  if (this.isSyncingClientVehicles) {
    console.log('[Vehicles] sync backend omitido: ya hay sincronización en curso', { reason });
    return;
  }

  this.isSyncingClientVehicles = true;
  this.setClientVehiclesModalError('');

  let clientVehiclesPayload: Array<{ vehicleType: { id: number }; plate: string; notes: string }> = [];
  try {
    clientVehiclesPayload = this.buildClientVehiclesPayload();
  } catch (e: any) {
    this.isSyncingClientVehicles = false;
    console.error('[Vehicles] Error construyendo payload para sync backend', e);

    if (beforeLocalList) {
      this.clientVehiclesList = beforeLocalList.map(v => ({ ...v }));
      this.persistCurrentClientVehicles();
      this.cdr.detectChanges();
    }

    this.setClientVehiclesModalError(e?.message || 'Error preparando vehículos para sincronizar');
    return;
  }

  this.autolavadoService.updateClientVehiclesByDni(dni, clientVehiclesPayload).subscribe({
    next: () => {
      this.persistCurrentClientVehicles();

      console.log('[Vehicles] Sync backend OK (todos los registros del DNI)', {
        reason,
        dni,
        vehicles: this.clientVehiclesList
      });
    },
    error: (err) => {
      console.error('[Vehicles] Error sincronizando clientVehicles en backend', { reason, dni, err });

      if (beforeLocalList) {
        this.clientVehiclesList = beforeLocalList.map(v => ({ ...v }));
        this.persistCurrentClientVehicles();
        this.clearClientVehicleEditorState();
      }

      this.setClientVehiclesModalError('No se pudo sincronizar con backend. Se revirtieron los cambios.');
    },
    complete: () => {
      this.isSyncingClientVehicles = false;
      this.cdr.detectChanges();
    }
  });
}



private normalizeVehicleModel(model: string | null | undefined): string {
  return (model || '').toString().trim().toLowerCase();
}

private findClientVehicleByModel(model: string | null | undefined): ClientVehicleItem | undefined {
  const modelNorm = this.normalizeVehicleModel(model);
  if (!modelNorm) {
    return undefined;
  }

  return (this.clientVehiclesList || []).find(v =>
    this.normalizeVehicleModel(v?.model) === modelNorm
  );
}




private upsertClientVehicleInList(item: ClientVehicleItem): void {
  const incoming: ClientVehicleItem = {
    model: (item.model || '').toString().trim(),
    plate: (item.plate || '').toString().trim(),
    notes: (item.notes || '').toString().trim()
  };

  const modelNorm = this.normalizeVehicleModel(incoming.model);
  if (!modelNorm) return;

  const incomingKey = this.buildClientVehicleIdentityKey(incoming);
  const idx = this.clientVehiclesList.findIndex(v =>
    this.buildClientVehicleIdentityKey(v) === incomingKey
  );

  if (idx >= 0) {
    const existing = this.clientVehiclesList[idx];

    // No pisar datos del backend con strings vacíos del formulario
    this.clientVehiclesList[idx] = {
      model: existing.model || incoming.model,
      plate: incoming.plate || existing.plate || '',
      notes: incoming.notes || existing.notes || ''
    };
    return;
  }

  // Si el modelo ya existe, se actualizan solo sus propios datos.
  // Esto evita que una entrada creada como placeholder conserve matrícula/notas viejas.
  const sameModelIdx = this.clientVehiclesList.findIndex(v =>
    this.normalizeVehicleModel(v.model) === modelNorm
  );
  if (sameModelIdx >= 0) {
    const existing = this.clientVehiclesList[sameModelIdx];
    this.clientVehiclesList[sameModelIdx] = {
      model: existing.model || incoming.model,
      plate: incoming.plate || existing.plate || '',
      notes: incoming.notes || existing.notes || ''
    };
    return;
  }

  if (this.clientVehiclesList.length >= 4) {
    throw new Error('Solo se permiten hasta 4 vehiculos por cliente.');
  }

  this.clientVehiclesList.push(incoming);
}


private syncCurrentFormVehicleIntoClientVehiclesList(): void {
  const currentModel = (this.clientForm.get('vehicle')?.value || '').toString().trim();
  if (!currentModel) return;

  const currentPlate = (this.clientForm.get('plate')?.value || '').toString().trim();
  const currentNotes = (this.clientForm.get('notes')?.value || '').toString().trim();

  this.upsertClientVehicleInList({
    model: currentModel,
    plate: currentPlate,
    notes: currentNotes
  });
}

public clearClientVehicleEditorState(): void {
  this.clientVehicleEditor = { model: '', plate: '', notes: '' };
  this.editingClientVehicleIndex = null;
}

private clearClientVehicleWorkingList(): void {
  this.clientVehiclesList = [];
  this.clearClientVehicleEditorState();
}









openClientVehiclesModal(): void {
  const dni = (this.clientForm.get('dni')?.value || '').toString().trim();

  this.clearClientVehicleEditorState();
  this.setClientVehiclesModalError('');
  this.isLoadingClientVehiclesModal = false;

  console.log('[Vehículos modal] openClientVehiclesModal()', {
    dni,
    currentForm: {
      vehicle: this.clientForm.get('vehicle')?.value,
      plate: this.clientForm.get('plate')?.value,
      notes: this.clientForm.get('notes')?.value
    },
    currentBufferSize: this.clientVehiclesList?.length || 0
  });

  // Sin DNI: usar buffer local + form actual
  if (!dni) {
    try {
      if (!Array.isArray(this.clientVehiclesList)) {
        this.clientVehiclesList = [];
      }

      this.syncCurrentFormVehicleIntoClientVehiclesList();

      console.log('[Vehículos modal] Sin DNI -> usando buffer/form local', {
        vehicles: this.clientVehiclesList
      });

      this.showClientVehiclesModal = true;
    } catch (e: any) {
      console.error('[Vehículos modal] Error preparando buffer sin DNI', e);
      this.setClientVehiclesModalError(e?.message || 'Error preparando vehículos del cliente');
      this.showClientVehiclesModal = true;
    }
    return;
  }

  // Con DNI: backend-first — limpiar lista anterior para evitar mostrar datos de otro cliente
  this.clientVehiclesList = [];
  this.isLoadingClientVehiclesModal = true;
  this.showClientVehiclesModal = true;

  this.fetchReservationsByDni$(dni).pipe(takeUntil(this.destroy$)).subscribe({
    next: (reservations) => {
      const rows = this.sortReservationsDesc(reservations);
      const latest = rows[0];

      this.clientVehiclesList = latest ? this.mapClientVehiclesFromBackend(latest) : [];

      console.log('[Vehículos modal] Antes de merge con form actual', {
        dni,
        reservations: rows.length,
        latestClientId: latest?.id || null,
        latestVehiclesFromBackend: this.clientVehiclesList
      });

      try {
        this.syncCurrentFormVehicleIntoClientVehiclesList();
      } catch (e: any) {
        console.error('[Vehículos modal] Error en merge con form actual', e);
        this.setClientVehiclesModalError(e?.message || 'Error preparando vehículos del cliente');
        return;
      }

      this.setClientVehiclesModalError('');

      console.log('[Vehículos modal] Después de merge backend + form', {
        dni,
        reservations: rows.length,
        latestClientId: latest?.id || null,
        vehicles: this.clientVehiclesList
      });
    },
    error: (err) => {
      console.error('[Vehículos modal] Error cargando desde backend', err);

      try {
        if (!Array.isArray(this.clientVehiclesList)) {
          this.clientVehiclesList = [];
        }
        this.syncCurrentFormVehicleIntoClientVehiclesList();

        this.setClientVehiclesModalError('No se pudo cargar historial desde backend. Mostrando datos locales.');

        console.log('[Vehículos modal] Fallback local tras error backend', {
          dni,
          vehicles: this.clientVehiclesList
        });
      } catch (e: any) {
        console.error('[Vehículos modal] Error en fallback local', e);
        this.setClientVehiclesModalError(e?.message || 'No se pudieron cargar los vehículos del cliente');
      }
    },
    complete: () => {
      this.isLoadingClientVehiclesModal = false;
      this.cdr.detectChanges();
    }
  });
}





closeClientVehiclesModal(): void {
  if (this.isSyncingClientVehicles) {
    console.log('[Vehículos modal] Cierre bloqueado: sincronización en curso');
    return;
  }

  this.showClientVehiclesModal = false;
  this.clearClientVehicleEditorState();
  this.setClientVehiclesModalError('');
  this.isLoadingClientVehiclesModal = false;
  this.activeClientVehiclesKey = null;
}











saveClientVehicleItem(): void {
  this.withClientVehiclesSyncLock(() => {
    if (this.editingClientVehicleIndex === null) {
      this.setClientVehiclesModalError('Selecciona un vehículo y pulsa "Editar" para actualizarlo.');
      return;
    }

    const model = (this.clientVehicleEditor.model || '').trim();
    if (!model) {
      this.setClientVehiclesModalError('Debes ingresar el modelo del vehículo.');
      return;
    }

    this.setClientVehiclesModalError('');

    const payload: ClientVehicleItem = {
      model,
      plate: (this.clientVehicleEditor.plate || '').trim(),
      notes: (this.clientVehicleEditor.notes || '').trim()
    };

    const before = (this.clientVehiclesList || []).map(v => ({ ...v }));

    try {
      const original = this.clientVehiclesList[this.editingClientVehicleIndex];
      if (!original) return;

      // Modelo no editable
      payload.model = original.model;

      this.clientVehiclesList[this.editingClientVehicleIndex] = payload;
      this.persistCurrentClientVehicles();

      console.log('[Vehicles] saveClientVehicleItem (solo update) -> lista local actualizada', {
        editingIndex: this.editingClientVehicleIndex,
        savedItem: payload,
        list: this.clientVehiclesList
      });

      this.clearClientVehicleEditorState();

      // Sync backend con rollback local si falla
      this.syncClientVehiclesListToBackend('save', before);

    } catch (e: any) {
      this.clientVehiclesList = before.map(v => ({ ...v }));
      this.persistCurrentClientVehicles();

      console.error('[Vehicles] Error actualizando vehículo local', e);
      this.setClientVehiclesModalError(e?.message || 'Error al actualizar vehículo');
    }
  });
}






editClientVehicleItem(index: number): void {
  const item = this.clientVehiclesList[index];
  if (!item) return;

  this.clientVehicleEditor = { ...item };
  this.editingClientVehicleIndex = index;

  console.log('[Vehicles] Editando item', {
    index,
    item,
    list: this.clientVehiclesList
  });

  console.log('[Vehicles] Edit click - flags', {
  isLoadingClientVehiclesModal: this.isLoadingClientVehiclesModal,
  isSyncingClientVehicles: this.isSyncingClientVehicles,
  editingClientVehicleIndex: this.editingClientVehicleIndex
});

}








async deleteClientVehicleItem(index: number): Promise<void> {
  const item = this.clientVehiclesList[index];
  if (!item) return;

  const confirmed = await this.confirmService.confirm({
    title: 'Eliminar vehiculo del cliente',
    message: `Eliminar el vehiculo "${item.model}" de la lista del cliente?`,
    confirmText: 'Eliminar',
    cancelText: 'Cancelar',
    variant: 'danger'
  });

  if (!confirmed) return;

  this.withClientVehiclesSyncLock(() => {
    const currentItem = this.clientVehiclesList[index];
    if (!currentItem) return;

    this.setClientVehiclesModalError('');

    const before = (this.clientVehiclesList || []).map(v => ({ ...v }));

    try {
      this.clientVehiclesList.splice(index, 1);
      this.persistCurrentClientVehicles();

      if (this.editingClientVehicleIndex === index) {
        this.clearClientVehicleEditorState();
      } else if (
        this.editingClientVehicleIndex !== null &&
        this.editingClientVehicleIndex > index
      ) {
        this.editingClientVehicleIndex = this.editingClientVehicleIndex - 1;
      }

      console.log('[Vehicles] deleteClientVehicleItem -> lista local actualizada', {
        deletedIndex: index,
        deletedItem: item,
        list: this.clientVehiclesList
      });

      this.syncClientVehiclesListToBackend('delete', before);

    } catch (e: any) {
      this.clientVehiclesList = before.map(v => ({ ...v }));
      this.persistCurrentClientVehicles();

      console.error('[Vehicles] Error eliminando item local', e);
      this.setClientVehiclesModalError(e?.message || 'Error al eliminar vehículo');
    }
  });
}



selectClientVehicleItem(item: ClientVehicleItem): void {
  this.clientForm.patchValue({
    vehicle: item.model || '',
    plate: item.plate || '',
    notes: item.notes || ''
  });

  const selectedVehicleType = this.vehicles.find(
    v => v.model.toLowerCase() === (item.model || '').toLowerCase()
  );
  if (selectedVehicleType) {
    this.clientForm.patchValue({ price: selectedVehicleType.price });
  }

  this.closeClientVehiclesModal();
  this.toastService.showSuccess(`Vehículo cargado: ${item.model}`);
}





filterClientsAdmin(): void {
  if (!this.isClientsDbOpen) return;

  this.clientsAdminPage = 0;

  if (this.clientsAdminSearchTimer) {
    clearTimeout(this.clientsAdminSearchTimer);
  }

  this.clientsAdminSearchTimer = setTimeout(() => {
    this.loadClientsAdminPageFromBackend();
  }, 300);
}

clearSearchClients(): void {
  this.searchTermClients = '';
  this.clientsAdminPage = 0;
  this.loadClientsAdminPageFromBackend();
}



async exportClientsDbToExcel(): Promise<void> {
  const confirmed = await this.confirmService.confirm({
    title: 'Exportar clientes',
    message: 'Deseas exportar la base de datos de clientes a Excel?',
    confirmText: 'Exportar',
    cancelText: 'Cancelar',
    variant: 'primary'
  });

  if (!confirmed) return;

  const rows = this.allClients || [];

  // Preparar datos
  const data = rows.map(client => ({
    ID: client.id,
    Código: client.code,
    Nombre: client.name,
    DNI: client.dni,
    Teléfono: client.phoneIntl,
    Vehículo: client.vehicle,
    Matrícula: client.plate,
    Categoría: client.category,
    Precio: client.price,
    'Método Pago': client.paymentMethod,
    Espacio: client.spaceKey,
    Ingreso: client.entryTimestamp ? new Date(client.entryTimestamp).toLocaleString() : '-',
    Salida: client.exitTimestamp ? new Date(client.exitTimestamp).toLocaleString() : '-'
  }));

  // Crear hoja
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');

  // Generar archivo
  const fileName = `base_datos_clientes_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, fileName);

  this.toastService.showSuccess('Base de datos exportada correctamente');
}



async exportAllUniqueClientsDbToExcel(): Promise<void> {
  const confirmed = await this.confirmService.confirm({
    title: 'Exportar clientes',
    message: 'Deseas exportar la base de datos de clientes a Excel?',
    confirmText: 'Exportar',
    cancelText: 'Cancelar',
    variant: 'primary'
  });

  if (!confirmed) return;

  this.autolavadoService.getUniqueClientsFromBackend().subscribe({
    next: (rows) => {
      const data = (rows || []).map(client => ({
        ID: client.id,
        Codigo: client.code,
        Nombre: client.name,
        DNI: client.dni,
        Telefono: client.phoneIntl,
        Vehiculo: client.vehicle,
        Matricula: client.plate,
        Categoria: client.category,
        Precio: client.price,
        MetodoPago: client.paymentMethod,
        Espacio: client.spaceKey,
        Ingreso: client.entryTimestamp ? new Date(client.entryTimestamp).toLocaleString() : '-',
        Salida: client.exitTimestamp ? new Date(client.exitTimestamp).toLocaleString() : '-'
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');

      const fileName = `base_datos_clientes_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      this.toastService.showSuccess('Base de datos exportada correctamente');
    },
    error: (err) => {
      console.error('Error exportando clientes', err);
      this.toastService.showError('No se pudo exportar la base de datos de clientes');
    }
  });
}





private getClientIdentityKeyForUI(client: Client): string {
  const dni = (client.dni || '').toString().trim();
  const phone = (client.phoneIntl || client.phoneRaw || '').toString().replace(/\D/g, '');
  const name = (client.name || '').toString().trim().toLowerCase();

  if (dni) return `dni:${dni}`;
  if (phone) return `phone:${phone}`;
  return `name:${name}`;
}

private getClientSortTsForUI(client: Client): number {
  return this.toTimestamp(client.entryTimestamp)
    ?? this.toTimestamp(client.exitTimestamp)
    ?? this.extractTempEntityTimestamp(client.id)
    ?? Number(client.id || 0);
}

private extractTempEntityTimestamp(id: any): number | null {
  const raw = (id || '').toString();
  const match = raw.match(/temp(?:-manual)?-(\d+)-/);
  if (!match) return null;

  const ts = Number(match[1]);
  return Number.isFinite(ts) ? ts : null;
}

private dedupeClientsForUI(clients: Client[]): Client[] {
  const sorted = [...(clients || [])].sort(
    (a, b) => this.getClientSortTsForUI(b) - this.getClientSortTsForUI(a)
  );

  const seen = new Map<string, Client>();

  for (const c of sorted) {
    const key = this.getClientIdentityKeyForUI(c);
    if (!seen.has(key)) {
      seen.set(key, c);
    }
  }

  const result = Array.from(seen.values());

  console.log('[Clients UI] dedupeClientsForUI', {
    raw: clients?.length || 0,
    unique: result.length,
    sample: result.slice(0, 5).map(c => ({
      id: c.id,
      dni: c.dni,
      name: c.name,
      vehicle: c.vehicle,
      exitTimestamp: c.exitTimestamp
    }))
  });

  return result;
}



loadAllClientsFromBackend00(): void {
  this.autolavadoService.getUniqueClientsFromBackend().subscribe({
    next: (clients) => {
      this.monthlyServiceCountByKey.clear();
      this.monthlyServiceCountLoadingKeys.clear();
      this.allClients = clients;
      this.filteredClientsAdmin = clients;
      console.log('Todos los clientes cargados desde backend:', clients);
    },
    error: (err) => {
      console.error('Error cargando clientes', err);
      this.toastService.showError('No se pudieron cargar los clientes.');
    }
  });
}

loadAllClientsFromBackend(): void {
  this.autolavadoService.getUniqueClientsFromBackend().pipe(takeUntil(this.destroy$)).subscribe({
    next: (clients) => {
      this.allClients = clients;
      this.filteredClientsAdmin = clients;

      this.ensureMonthlyServiceCountCacheForCurrentMonth();
      this.monthlyServiceCountByDni.clear();
      this.preloadMonthlyServiceCountsForClients(clients);

      console.log('Clientes únicos cargados desde backend:', clients);
      this.cdr.markForCheck();
    },
    error: (err) => {
      console.error('Error cargando clientes', err);
      this.toastService.showError('No se pudieron cargar los clientes.');
    }
  });
}


loadClientsAdminPageFromBackend(): void {
  this.isLoadingClientsAdmin = true;

  this.autolavadoService.getUniqueClientsPageFromBackend(
    this.clientsAdminPage,
    this.clientsAdminPageSize,
    this.searchTermClients
  ).pipe(takeUntil(this.destroy$)).subscribe({
    next: (response: PagedResponse<Client>) => {
      const clients = response?.content || [];

      this.filteredClientsAdmin = clients;
      this.clientsAdminPage = response?.page ?? 0;
      this.clientsAdminPageSize = response?.size ?? this.clientsAdminPageSize;
      this.clientsAdminTotalPages = response?.totalPages ?? 0;
      this.clientsAdminTotalElements = response?.totalElements ?? 0;

      this.ensureMonthlyServiceCountCacheForCurrentMonth();
      this.monthlyServiceCountByDni.clear();
      this.preloadMonthlyServiceCountsForClients(clients);

      console.log('Clientes unicos paginados cargados desde backend:', {
        page: this.clientsAdminPage,
        size: this.clientsAdminPageSize,
        totalPages: this.clientsAdminTotalPages,
        totalElements: this.clientsAdminTotalElements,
        content: clients.length
      });
      this.cdr.markForCheck();
    },
    error: (err) => {
      console.error('Error cargando clientes', err);
      if (Number(err?.status || 0) === 0) {
        this.refreshClientsAdminFromLocalState();
        this.toastService.showWarning('Sin conexion con el servidor. Se muestran los clientes locales disponibles.');
        this.cdr.markForCheck();
        return;
      }

      this.toastService.showError('No se pudieron cargar los clientes.');
    },
    complete: () => {
      this.isLoadingClientsAdmin = false;
      this.cdr.markForCheck();
    }
  });
}

private refreshClientsAdminFromLocalState(): void {
  const localClients = this.dedupeClientsForUI(Object.values(this.autolavadoService.clientsSubject.value || {}));
  this.allClients = localClients;
  this.clientsAdminPage = 0;
  this.applyClientsAdminLocalPage(localClients);

  this.ensureMonthlyServiceCountCacheForCurrentMonth();
  this.monthlyServiceCountByDni.clear();
  this.preloadMonthlyServiceCountsForClients(this.filteredClientsAdmin);
}

private applyClientsAdminLocalPage(sourceClients: Client[]): void {
  const term = (this.searchTermClients || '').trim().toLowerCase();
  const filtered = (sourceClients || []).filter(client => {
    if (!term) return true;

    return [
      client.id,
      client.name,
      client.dni,
      client.phoneIntl,
      client.vehicle,
      client.plate,
      client.code,
      client.spaceKey
    ].some(value => (value || '').toString().toLowerCase().includes(term));
  });

  const safeTotalPages = Math.max(1, Math.ceil(filtered.length / this.clientsAdminPageSize));
  this.clientsAdminTotalElements = filtered.length;
  this.clientsAdminTotalPages = safeTotalPages;
  this.clientsAdminPage = Math.min(this.clientsAdminPage, safeTotalPages - 1);

  const start = this.clientsAdminPage * this.clientsAdminPageSize;
  const end = start + this.clientsAdminPageSize;
  this.filteredClientsAdmin = filtered.slice(start, end);
}

private closeAndResetNewClientModal(): void {
  const modalElement = document.getElementById('newClientModal');
  if (modalElement) {
    const modalInstance = bootstrap.Modal.getInstance(modalElement);
    if (modalInstance) {
      modalInstance.hide();
      setTimeout(() => {
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) backdrop.remove();
        document.body.classList.remove('modal-open');
      }, 300);
    }
  }

  this.resetNewClientForm();
}

get clientsAdminPageLabel(): number {
  return this.clientsAdminPage + 1;
}

get canGoToPreviousClientsAdminPage(): boolean {
  return this.clientsAdminPage > 0;
}

get canGoToNextClientsAdminPage(): boolean {
  return this.clientsAdminPage + 1 < this.clientsAdminTotalPages;
}

goToPreviousClientsAdminPage(): void {
  if (!this.canGoToPreviousClientsAdminPage) return;
  this.clientsAdminPage -= 1;
  this.loadClientsAdminPageFromBackend();
}

goToNextClientsAdminPage(): void {
  if (!this.canGoToNextClientsAdminPage) return;
  this.clientsAdminPage += 1;
  this.loadClientsAdminPageFromBackend();
}

getSpaceByKey(spaceKey: string | null): Space | undefined {
  if (!spaceKey) return undefined;
  return this.autolavadoService.spacesSubject.value[spaceKey];
}


formatDateOnly(timestamp: number | null): string {
  if (!timestamp) return '-'; // Si ninguno existe → -

  const date = new Date(timestamp);
  return date.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}



formatStartTime(startTime: number | null): string {
  if (!startTime) return '-';
  const date = new Date(startTime);
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }) + ', ' + date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit'
  }) + ' hs';
}


formatDateWithTime(timestamp: number | null): string {
  if (!timestamp) return '-';

  const date = new Date(timestamp);
  return date.toLocaleString('es-AR', {
    weekday: 'short',          // lun, mar, etc.
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }) + ' hs';
}

formatVisitDateLabel(timestamp: any): string {
  const ts = this.toTimestamp(timestamp);
  if (!ts) return '-';
  return this.formatDateWithTime(ts);
}

getTimeInSpace(startTime: number | null): string {
  if (!startTime) return '-';
  const diff = Date.now() - startTime;

  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);

  if (hours > 0) {
    return `Hace ${hours}h ${minutes}min`;
  } else {
    return `Hace ${minutes}min`;
  }
}

editClient(client: Client): void {
  this.editedAdminClient = {
    id: client.id,
    code: client.code,
    name: client.name || '',
    dni: client.dni || '',
    phoneIntl: client.phoneIntl || '',
    vehicle: client.vehicle || '',
    plate: client.plate || '',
    notes: client.notes || '',
    category: client.category || '',
    price: client.price ?? null,
    paymentMethod: client.paymentMethod || '',
    clover: client.clover ?? null,
    spaceKey: client.spaceKey || null
  };

  const modal = new bootstrap.Modal(document.getElementById('editAdminClientModal'));
  modal.show();
}

async saveEditedAdminClient(): Promise<void> {
  if (!this.editedAdminClient) {
    return;
  }

  const clientId = this.editedAdminClient.id;
  const clientIdText = String(clientId || '');

  const payload = {
    name: (this.editedAdminClient.name || '').trim(),
    dni: (this.editedAdminClient.dni || '').trim() || null,
    phoneIntl: (this.editedAdminClient.phoneIntl || '').trim(),
    vehicle: (this.editedAdminClient.vehicle || '').trim() || null,
    plate: (this.editedAdminClient.plate || '').trim() || null,
    notes: (this.editedAdminClient.notes || '').trim() || null,
    category: (this.editedAdminClient.category || '').trim() || null,
    price: this.editedAdminClient.price ?? null,
    paymentMethod: (this.editedAdminClient.paymentMethod || '').trim() || null,
    clover: this.editedAdminClient.clover ?? null
  };

  if (!payload.name || !payload.phoneIntl) {
    this.toastService.showWarning('Nombre y telefono son obligatorios para editar el cliente.');
    return;
  }

  const confirmed = await this.confirmService.confirm({
    title: 'Guardar cambios del cliente',
    message: `Deseas actualizar los datos de ${payload.name}?`,
    confirmText: 'Guardar cambios',
    cancelText: 'Cancelar',
    variant: 'primary'
  });

  if (!confirmed) {
    this.toastService.showInfo('Edicion de cliente cancelada.');
    return;
  }

  this.isSavingEditedAdminClient = true;

  if (clientIdText.startsWith('temp-manual-')) {
    this.isSavingEditedAdminClient = false;
    this.autolavadoService.updateClientOffline(clientId, payload);
    const updatedPending = this.autolavadoService.updatePendingManualClientSync(clientIdText, payload);
    this.closeEditAdminClientModal();
    this.refreshClientsAdminFromLocalState();
    this.filterSpaces();

    if (updatedPending) {
      this.toastService.showWarning('Cliente offline actualizado localmente. El alta pendiente se sincronizara con estos cambios.');
    } else {
      this.toastService.showWarning('Cliente local actualizado, pero no se encontro una alta pendiente para sincronizar.');
    }
    return;
  }

  this.autolavadoService.updateClientInBackend(clientId, payload).subscribe({
    next: (updatedClient) => {
      this.isSavingEditedAdminClient = false;
      this.autolavadoService.updateClientOffline(clientId, updatedClient || payload);
      this.closeEditAdminClientModal();
      this.loadClientsAdminPageFromBackend();
      this.filterSpaces();
      this.toastService.showSuccess('Cliente actualizado correctamente.');
    },
    error: (err) => {
      this.isSavingEditedAdminClient = false;

      if (Number(err?.status || 0) === 0) {
        this.autolavadoService.updateClientOffline(clientId, payload);
        this.autolavadoService.queueUpdateClientSync(clientId, payload);
        this.closeEditAdminClientModal();
        this.refreshClientsAdminFromLocalState();
        this.filterSpaces();
        this.toastService.showWarning('Cliente actualizado localmente. Se sincronizara cuando vuelva la conexion.');
        return;
      }

      this.toastService.showError('No se pudo actualizar el cliente: ' + (err?.error?.message || 'Intenta de nuevo'));
    }
  });
}

closeEditAdminClientModal(): void {
  const modalElement = document.getElementById('editAdminClientModal');
  if (modalElement) {
    const modalInstance = bootstrap.Modal.getInstance(modalElement);
    if (modalInstance) {
      modalInstance.hide();
    }
  }

  this.editedAdminClient = null;
  this.isSavingEditedAdminClient = false;
}



deleteClient(clientId: any): void {
  void this.deleteClientWithConfirm(clientId);
}


async deleteClientWithConfirm(clientId: any): Promise<void> {
  const confirmed = await this.confirmService.confirm({
    title: 'Eliminar cliente',
    message: `¿Eliminar cliente ID ${clientId}?\nEsto liberará el espacio que ocupa si todavía lo tiene asociado.`,
    confirmText: 'Eliminar',
    cancelText: 'Cancelar',
    variant: 'danger'
  });

  if (!confirmed) {
    return;
  }

  console.log('Iniciando eliminación del cliente ID:', clientId);
  const shouldGoPreviousPage = this.filteredClientsAdmin.length === 1 && this.clientsAdminPage > 0;

  this.autolavadoService.deleteClientFromBackend(clientId).subscribe({
    next: (result) => {
      console.log(`Cliente ${clientId} eliminado correctamente`);

      if (shouldGoPreviousPage) {
        this.clientsAdminPage -= 1;
      }
      this.loadClientsAdminPageFromBackend();
      this.filterSpaces();

      this.toastService.showSuccess('Cliente eliminado correctamente');
    },
    error: (err) => {
      console.error('Error eliminando cliente', err);
      if (err?.status === 404) {
        if (shouldGoPreviousPage) {
          this.clientsAdminPage -= 1;
        }
        this.loadClientsAdminPageFromBackend();
        this.toastService.showError('El cliente ya no existía en el servidor. La lista fue recargada.');
        return;
      }

      this.toastService.showError('Error al eliminar cliente');
    }
  });
}



  private updateCurrentSubTitle(): void {
    const sub = this.subsuelos.find(s => s.id === this.currentSubId);
    this.currentSubTitle = `Espacios — ${sub?.label || this.currentSubId || ''}`;
  }


ngOnDestroy(): void {
  if (this.uiRefreshIntervalId) {
    clearInterval(this.uiRefreshIntervalId);
    this.uiRefreshIntervalId = null;
  }

  // Remover listeners del teléfono principal
  if (this.phoneInputElRef) {
    this.phoneInputElRef.removeEventListener('input', this.onPhoneInputListener);
    this.phoneInputElRef.removeEventListener('countrychange', this.onPhoneCountryChangeListener);
    this.phoneInputElRef = null;
  }

  // Remover listeners del teléfono de nuevo cliente
  if (this.newPhoneInputElRef) {
    this.newPhoneInputElRef.removeEventListener('input', this.onNewPhoneInputListener);
    this.newPhoneInputElRef.removeEventListener('countrychange', this.onNewPhoneCountryChangeListener);
    this.newPhoneInputElRef = null;
  }

  this.destroy$.next();
  this.destroy$.complete();
}






private filterSpaces(): void {
  if (!this.currentSubId) {
    this.filteredSpaces = [];
    return;
  }

  let allSpaces = Object.values(this.spaces)
    .filter(sp => sp.subsueloId === this.currentSubId);

  // Filtrar solo por displayName y key si searchTerm existe
  const currentSearchTerm = this.searchTermSubject.value.trim();
  if (currentSearchTerm) {
    const term = currentSearchTerm.toLowerCase();
    allSpaces = allSpaces.filter(space => {
      return (
        (space.displayName || '').toLowerCase().includes(term) ||
        space.key.toLowerCase().includes(term)
      );
    });
  }

  // Ordenar alfabéticamente por key
  allSpaces = allSpaces.sort((a, b) => a.key.localeCompare(b.key));

  // Paginación
  const startIndex = (this.currentPage - 1) * this.itemsPerPage;
  const endIndex = startIndex + this.itemsPerPage;
  this.filteredSpaces = allSpaces.slice(startIndex, endIndex);
}



  onSubsueloChange(): void {
    if (this.currentSubId) {
      this.autolavadoService.setCurrentSubsuelo(this.currentSubId);
    }
  }

  addSubsuelo(): void {
    void this.addSubsueloWithConfirm();
  }

  private async addSubsueloWithConfirm(): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Crear subsuelo',
      message: 'Se agregara un nuevo subsuelo vacio al sistema. Deseas continuar?',
      confirmText: 'Crear subsuelo',
      cancelText: 'Cancelar',
      variant: 'primary'
    });

    if (!confirmed) {
      return;
    }

    try {
      this.autolavadoService.addSubsuelo();
      this.filterSpaces();
      this.toastService.showSuccess('Subsuelo agregado correctamente.');
    } catch (error: any) {
      this.toastService.showError('No se pudo agregar el subsuelo: ' + (error?.message || error));
    }
  }



editSubsuelo(): void {
  if (this.currentSubId) {
    const currentSub = this.subsuelos.find(sub => sub.id === this.currentSubId);
    this.editedSubsueloLabel = currentSub?.label || '';
    this.showModal('editSubsueloModal');
  }
}

confirmEditSubsuelo(): void {
  void this.confirmEditSubsueloWithConfirm();
}

private async confirmEditSubsueloWithConfirm(): Promise<void> {
  const trimmedLabel = this.editedSubsueloLabel.trim();
  if (!trimmedLabel || !this.currentSubId) {
    this.toastService.showWarning('Ingresa un nombre valido para el subsuelo.');
    return;
  }

  const confirmed = await this.confirmService.confirm({
    title: 'Guardar subsuelo',
    message: `Actualizar el nombre del subsuelo ${this.currentSubId} a "${trimmedLabel}"?`,
    confirmText: 'Guardar cambios',
    cancelText: 'Cancelar',
    variant: 'primary'
  });

  if (!confirmed) {
    return;
  }

  try {
    this.autolavadoService.updateSubsuelo(this.currentSubId, trimmedLabel);
    this.filterSpaces();
    this.hideModal('editSubsueloModal');
    this.toastService.showSuccess('Subsuelo actualizado correctamente.');
  } catch (error: any) {
    this.toastService.showError('Error al actualizar subsuelo: ' + (error?.message || error));
  }
}


  addSpaces(): void {
    void this.addSpacesWithConfirm();
  }

  private async addSpacesWithConfirm(): Promise<void> {
    if (!this.currentSubId) {
      this.toastService.showWarning('Selecciona un subsuelo antes de agregar espacios.');
      return;
    }

    if (!this.addSpacesCount || this.addSpacesCount < 1) {
      this.toastService.showWarning('La cantidad de espacios a agregar debe ser mayor que cero.');
      return;
    }

    const confirmed = await this.confirmService.confirm({
      title: 'Agregar espacios',
      message: `Agregar ${this.addSpacesCount} espacios al subsuelo ${this.currentSubId}?`,
      confirmText: 'Agregar espacios',
      cancelText: 'Cancelar',
      variant: 'primary'
    });

    if (!confirmed) {
      return;
    }

    try {
      this.autolavadoService.addSpacesToCurrent(this.addSpacesCount);
      this.filterSpaces();
      this.toastService.showSuccess(`${this.addSpacesCount} espacios agregados correctamente.`);
    } catch (error: any) {
      this.toastService.showError('No se pudieron agregar los espacios: ' + (error?.message || error));
    }
  }




onSearch(): void {

this.searchTermSubject.next(this.searchTerm); // Actualizar subject para reactividad
  this.currentPage = 1;
}

  isSearchHit(space: Space): boolean {
    if (!this.searchTerm.trim()) return false;

    const term = this.searchTerm.trim().toLowerCase();
    const client = this.clients[space.clientId || ''];

    return space.key.toLowerCase().includes(term) ||
           (client && (
             (client.name || '').toLowerCase().includes(term) ||
             (client.phoneRaw || '').replace(/\D/g, '').includes(term.replace(/\D/g, '')) ||
             (client.vehicle || '').toLowerCase().includes(term) ||
             (client.plate || '').toLowerCase().includes(term)
           ));
  }



  getElapsed(startTime: number | null | undefined): string {
  return this.autolavadoService.elapsedFrom(startTime);
}

getFormattedDate(timestamp: number | null | undefined): string {
  return timestamp ? new Date(timestamp).toLocaleString() : '-';
}



  onSpaceClick(space: Space): void {
  this.selectedSpaceKey = space.key;
  this.selectedSpace = space;
  this.showQR = false;
  this.showOccupiedQR = false;

  if (space.occupied) {
    // Buscar cliente local primero
    let client = this.clients[space.clientId!];

    // Si no está en local, cargarlo desde backend
    if (!client && space.clientId) {
      this.autolavadoService.getClientFromBackend(space.clientId).subscribe({
        next: (serverClient) => {
          client = serverClient;
          this.selectedClient = client;
          this.updateOccupiedModal(client, space);
        },
        error: (err) => {
          console.warn('No se pudo cargar cliente desde backend', err);
          this.selectedClient = null;
        }
      });
    } else {
      this.selectedClient = client;
      this.updateOccupiedModal(client, space);
    }

    this.showModal('occupiedModal');
  } else {
    this.isClientModalOpen = true;
    this.clientForm.reset();
    this.whatsappLink = '';
    //this.showModal('clientModal');
    this.clientVehiclesList = [];
    this.clientVehicleEditor = { model: '', plate: '', notes: '' };
    this.editingClientVehicleIndex = null;

    setTimeout(() => {
      if (this.iti && this.phoneInput?.nativeElement) {
        this.iti.setCountry('ar'); // Volver a Argentina por defecto
        this.iti.setNumber('');    // Limpiar número
        this.updatePhoneInfo();    // Actualizar visuales (bandera, código, país)
      }
    }, 300);

this.showModal('clientModal');

  }
}

private updateOccupiedModal(client: Client | null, space: Space): void {
  if (client) {
    this.whatsappLink = this.autolavadoService.buildWhatsAppLink(client, space);
    this.qrCaption = `${client.name} — ${client.code}`;
  } else {
    this.whatsappLink = '';
    this.qrCaption = '';
  }
}




saveClient(): void {
  if (this.clientForm.invalid || !this.phoneIsValid) {
    this.toastService.showWarning('Completa los campos obligatorios y verifica que el telefono sea valido.');
    Object.keys(this.clientForm.controls).forEach(key => {
      this.clientForm.get(key)?.markAsTouched();
    });
    return;
  }

  if (!this.selectedSpaceKey) {
    this.toastService.showWarning('No hay espacio seleccionado.');
    return;
  }

  try {
    const ctx = this.buildReservationContextFromForm();

    // 1) Validación local rápida (UX)
    const localConflict = this.findActiveVehicleReservationConflict(ctx.dni, ctx.selectedVehicleModel);
    if (localConflict) {
      this.showVehicleConflictAlert(ctx.selectedVehicleModel, ctx.dni, localConflict.spaceKey, false);
      return;
    }

    // 2) Asegurar que el vehículo actual del formulario esté en el buffer local
    try {
      this.syncCurrentFormVehicleIntoClientVehiclesList();
    } catch (e: any) {
      this.toastService.showError(e?.message || 'Error al preparar los vehiculos del cliente.');
      return;
    }

    // 3) Validación backend (consistencia real)
    this.validateVehicleConflictWithBackend$(ctx.dni, ctx.selectedVehicleModel).subscribe({
      next: async (backendConflict) => {
        if (backendConflict) {
          this.showVehicleConflictAlert(ctx.selectedVehicleModel, ctx.dni, backendConflict.spaceKey, true);
          return;
        }

        const confirmed = await this.confirmService.confirm({
          title: 'Confirmar reserva',
          message: `Reservar espacio ${this.selectedSpaceKey} para el DNI ${ctx.dni} con el vehiculo ${ctx.selectedVehicleModel}?`,
          confirmText: 'Reservar',
          cancelText: 'Cancelar',
          variant: 'primary'
        });

        if (!confirmed) {
          this.toastService.showInfo('Reserva cancelada.');
          return;
        }

        // 4) Ejecutar reserva (local optimista + backend + rollback)
        this.executeReservationFlow(ctx);
      },
      error: (err) => {
        console.error('[CONFLICT] Error validando conflicto en backend', err);
        this.toastService.showError('No se pudo validar el conflicto de reserva. Intenta nuevamente.');
      }
    });

  } catch (error: any) {
    console.error('Error en saveClient:', error);
    this.toastService.showError(error?.message || 'Error al guardar el cliente.');
  }
}


private buildReservationContextFromForm(): {
  selectedVehicleModel: string;
  selectedVehicle: VehicleType | undefined;
  category: string;
  price: number;
  phoneIntl: string;
  phoneRaw: string;
  dni: string;
}

{
  const selectedVehicleModel = (this.clientForm.value.vehicle || '').toString().trim();
  const selectedVehicle = this.vehicles.find(v => v.model === selectedVehicleModel);

  const category = selectedVehicle?.category || this.clientForm.value.category || 'AUTO';
  const price = Number(this.clientForm.value.price || selectedVehicle?.price || 35000);

  const phoneIntl = (this.clientForm.value.phone || '').toString().trim();
  const phoneRaw = phoneIntl.replace(/^\+\d+/, '') || '';
  const dni = (this.clientForm.value.dni || '').toString().trim();

  if (!selectedVehicleModel) {
    throw new Error('Debes seleccionar un vehículo.');
  }

  if (!dni) {
    throw new Error('El DNI es obligatorio.');
  }

  if (!phoneIntl) {
    throw new Error('El teléfono es obligatorio.');
  }

  return {
    selectedVehicleModel,
    selectedVehicle,
    category,
    price,
    phoneIntl,
    phoneRaw,
    dni
  };
}


private showVehicleConflictAlert(
  vehicleModel: string,
  dni: string,
  spaceKey: string | null,
  fromBackend: boolean
): void {
  const origin = fromBackend
    ? 'Conflicto detectado en backend.'
    : 'No se puede reservar el mismo vehiculo en dos espacios al mismo tiempo.';

  this.toastService.showWarning(
    `${origin} Vehiculo: ${vehicleModel}. DNI: ${dni}. Reserva activa en: ${spaceKey || 'espacio desconocido'}.`,
    6500
  );
}


private buildClientVehiclesPayload(): Array<{
  vehicleType: { id: number };
  plate: string;
  notes: string;
}> {
  const seenVehicleKeys = new Set<string>();
  const payload: Array<{ vehicleType: { id: number }; plate: string; notes: string }> = [];

  for (const item of this.clientVehiclesList || []) {
    const model = (item.model || '').toString().trim();
    if (!model) continue;

    const vt = this.vehicles.find(v => (v.model || '').toLowerCase() === model.toLowerCase());
    if (!vt?.id) {
      console.warn('[buildClientVehiclesPayload] Modelo sin VehicleType en catalogo, se omite:', model);
      continue;
    }

    const vehicleKey = `${vt.id}::${this.buildClientVehicleIdentityKey(item)}`;
    if (seenVehicleKeys.has(vehicleKey)) {
      continue;
    }

    seenVehicleKeys.add(vehicleKey);
    payload.push({
      vehicleType: { id: vt.id },
      plate: (item.plate || '').toString().trim(),
      notes: (item.notes || '').toString().trim()
    });
  }

  if (payload.length > 4) {
    throw new Error('Solo se permiten hasta 4 vehiculos por cliente.');
  }

  return payload;
}

private validateVehicleConflictWithBackend$(
  dni: string,
  vehicleModel: string
): Observable<{ clientId: any; spaceKey: string | null } | null> {
  const safeDni = (dni || '').toString().trim();
  const safeVehicle = (vehicleModel || '').toString().trim();

  if (!safeDni || !safeVehicle) return of(null);

  return this.autolavadoService.getClientReservationsByDni(safeDni).pipe(
    map((reservations) => this.findVehicleConflictInReservations(reservations || [], safeDni, safeVehicle)),
    catchError((err) => {
      console.warn('[CONFLICT] Error validando conflicto con backend. Se mantiene validación local.', err);
      return of(null);
    })
  );
}


private isReservationActive(client: Client): boolean {
  const hasNoExit = client.exitTimestamp === null || client.exitTimestamp === undefined;
  const activeSpaceOccupied = !!client.spaceKey && !!this.spaces?.[client.spaceKey]?.occupied;
  return hasNoExit || activeSpaceOccupied;
}

private findVehicleConflictInReservations(
  reservations: Client[],
  dni: string,
  vehicleModel: string
): { clientId: any; spaceKey: string | null } | null {
  const dniNorm = this.normalizeText(dni);
  const vehicleNorm = this.normalizeText(vehicleModel);

  if (!dniNorm || !vehicleNorm) return null;

  for (const c of reservations || []) {
    if (!c) continue;

    const sameDni = this.normalizeText(c.dni) === dniNorm;
    if (!sameDni) continue;

    const sameVehicle = this.normalizeText(c.vehicle) === vehicleNorm;
    if (!sameVehicle) continue;

    if (this.existingClientId && String(c.id) === String(this.existingClientId)) {
      continue;
    }

    if (this.isReservationActive(c)) {
      return {
        clientId: c.id,
        spaceKey: c.spaceKey || null
      };
    }
  }

  return null;
}


private executeReservationFlow(ctx: {
  selectedVehicleModel: string;
  selectedVehicle: VehicleType | undefined;
  category: string;
  price: number;
  phoneIntl: string;
  phoneRaw: string;
  dni: string;
}): void {
  // Snapshot para rollback si backend falla
  const spacesBefore = JSON.parse(JSON.stringify(this.autolavadoService.spacesSubject.value));
  const clientsBefore = JSON.parse(JSON.stringify(this.autolavadoService.clientsSubject.value));

  const localClientData = {
    ...this.clientForm.value,
    category: ctx.category,
    price: ctx.price,
    phoneIntl: ctx.phoneIntl,
    phoneRaw: ctx.phoneRaw,
    entryTimestamp: Date.now(),
    exitTimestamp: null
  };

  // Guardado local optimista
  const localClient = this.autolavadoService.saveClient(localClientData, this.selectedSpaceKey);
  const space = this.spaces[this.selectedSpaceKey];

  this.whatsappMessage = this.autolavadoService.buildWhatsAppMessage(localClient, space);
  this.whatsappLink = this.autolavadoService.buildWhatsAppLink(localClient, space);
  this.hasCopiedMessage = false;

  let clientVehiclesPayload: Array<{ vehicleType: { id: number }; plate: string; notes: string }> = [];
  try {
    clientVehiclesPayload = this.buildClientVehiclesPayload();
  } catch (e: any) {
    // rollback inmediato si falla armado de payload
    this.handleReservationError(e, spacesBefore, clientsBefore, 'Error al construir vehículos del cliente');
    return;
  }

  const payload = {
    id: this.existingClientId || null,
    name: localClient.name,
    dni: localClient.dni || '',
    phoneRaw: localClient.phoneRaw,
    phoneIntl: localClient.phoneIntl,
    code: localClient.code,
    vehicle: localClient.vehicle,
    plate: localClient.plate,
    notes: localClient.notes,
    category: localClient.category,
    price: localClient.price,
    clientVehicles: clientVehiclesPayload
  };

  console.log('[clientVehiclesList]', this.clientVehiclesList);
  console.log('[clientVehicles payload]', clientVehiclesPayload);
  console.log('Datos enviados al backend:', payload);

  this.autolavadoService.saveClientToBackend({
    spaceKey: this.selectedSpaceKey,
    payload
  }).subscribe({
    next: (serverClient) => {
      this.finalizeReservationSuccess(localClient, serverClient);
    },
    error: (err) => {
      if (Number(err?.status || 0) === 0) {
        this.finalizeReservationOffline(localClient, payload);
        return;
      }

      this.handleReservationError(err, spacesBefore, clientsBefore, 'No se pudo guardar en backend. Se revirtió la reserva local.');
    }
  });
}


private finalizeReservationOffline(localClient: Client, payload: any): void {
  this.autolavadoService.queueReservationSync({
    spaceKey: this.selectedSpaceKey,
    payload,
    existingClientId: this.existingClientId || undefined
  });

  this.spaces = { ...this.autolavadoService.spacesSubject.value };
  this.clients = { ...this.autolavadoService.clientsSubject.value };

  this.filterSpaces();
  this.cdr.detectChanges();

  this.toastService.showWarning('Sin conexion con el servidor. La reserva quedo guardada localmente y se sincronizara automaticamente.');
  this.openWhatsApp();
}


private finalizeReservationSuccess(localClient: Client, serverClient: Client): void {
  console.log('Cliente reservado/actualizado en backend:', serverClient);

  const tempId = localClient.id;
  const realId = serverClient.id.toString();

  const clientsMap = { ...this.autolavadoService.clientsSubject.value };

  if (clientsMap[tempId]) {
    const clientToMove = {
      ...clientsMap[tempId],
      ...serverClient,
      id: realId
    };
    delete clientsMap[tempId];
    clientsMap[realId] = clientToMove;
  } else {
    clientsMap[realId] = { ...(serverClient as any), id: realId };
  }

  this.autolavadoService.clientsSubject.next(clientsMap);

  const spacesMap = { ...this.autolavadoService.spacesSubject.value };
  if (spacesMap[this.selectedSpaceKey]) {
    spacesMap[this.selectedSpaceKey] = {
      ...spacesMap[this.selectedSpaceKey],
      clientId: realId
    };
  }

  this.autolavadoService.spacesSubject.next(spacesMap);
  this.autolavadoService.saveAll();

  // Sincronizar referencias del componente
  this.spaces = spacesMap;
  this.clients = clientsMap;

  this.filterSpaces();
  this.cdr.detectChanges();

  // Rehidratación final desde backend (fuente de verdad)
  this.refreshClientReservationsFromBackendByDni(serverClient.dni || localClient.dni || '');

  this.toastService.showSuccess('Reserva guardada correctamente. Ya puedes copiar o abrir el mensaje de WhatsApp.');
  this.openWhatsApp();
}


private handleReservationError(
  err: any,
  spacesBefore: { [key: string]: Space },
  clientsBefore: { [key: string]: Client },
  userMessage: string
): void {
  console.error('Error en flujo de reserva. Aplicando rollback local...', err);

  this.autolavadoService.spacesSubject.next(spacesBefore);
  this.autolavadoService.clientsSubject.next(clientsBefore);
  this.autolavadoService.saveAll();

  this.spaces = { ...spacesBefore };
  this.clients = { ...clientsBefore };

  this.filterSpaces();
  this.cdr.detectChanges();

  this.toastService.showError(userMessage);
}


private normalizeText(value: any): string {
  return (value || '').toString().trim().toLowerCase();
}


private refreshClientReservationsFromBackendByDni(dni: string): void {
  const safeDni = (dni || '').toString().trim();
  if (!safeDni) return;

  this.autolavadoService.getClientReservationsByDni(safeDni).subscribe({
    next: (reservations) => {
      const rows = [...(reservations || [])].sort((a, b) => {
        const aTs = this.toTimestamp(a.entryTimestamp) ?? this.toTimestamp(a.exitTimestamp) ?? 0;
        const bTs = this.toTimestamp(b.entryTimestamp) ?? this.toTimestamp(b.exitTimestamp) ?? 0;
        return bTs - aTs;
      });

      if (!rows.length) return;

      const latest = rows[0];

      // Rehidratar lista de vehículos desde backend (fuente real)
      if (latest.clientVehicles?.length) {
        this.clientVehiclesList = this.mapClientVehiclesFromBackend(latest);
      }

      // Si el formulario sigue apuntando al mismo DNI, refrescar campos visibles
      const currentFormDni = (this.clientForm.get('dni')?.value || '').toString().trim();
      if (currentFormDni === safeDni) {
        const currentFormVehicle: ClientVehicleItem = {
          model: (this.clientForm.get('vehicle')?.value || '').toString().trim(),
          plate: (this.clientForm.get('plate')?.value || '').toString().trim(),
          notes: (this.clientForm.get('notes')?.value || '').toString().trim()
        };
        const selectedKey = this.buildClientVehicleIdentityKey(currentFormVehicle);
        const match = this.clientVehiclesList.find(v =>
          this.buildClientVehicleIdentityKey(v) === selectedKey
        ) || this.clientVehiclesList.find(v =>
          this.normalizeVehicleModel(v.model) === this.normalizeVehicleModel(currentFormVehicle.model)
        );

        if (match) {
          this.clientForm.patchValue({
            plate: match.plate || '',
            notes: match.notes || ''
          }, { emitEvent: false });
        }
      }

      console.log('[POST-RESERVA] Rehidratado desde backend por DNI', {
        dni: safeDni,
        reservations: rows.length,
        vehicles: this.clientVehiclesList
      });

      this.cdr.detectChanges();
    },
    error: (err) => {
      console.warn('[POST-RESERVA] No se pudo rehidratar historial por DNI', err);
    }
  });
}


private sortReservationsDesc(reservations: Client[]): Client[] {
  return [...(reservations || [])].sort((a, b) => {
    const aTs = this.toTimestamp(a.entryTimestamp) ?? this.toTimestamp(a.exitTimestamp) ?? 0;
    const bTs = this.toTimestamp(b.entryTimestamp) ?? this.toTimestamp(b.exitTimestamp) ?? 0;
    return bTs - aTs;
  });
}

private mapClientVehiclesFromBackend(client: Client): ClientVehicleItem[] {
  if (!client?.clientVehicles?.length) return [];

  const dedup = new Map<string, ClientVehicleItem>();

  for (const cv of client.clientVehicles) {
    const candidate: ClientVehicleItem = {
      model: cv.vehicleType?.model || '',
      plate: cv.plate || '',
      notes: cv.notes || ''
    };
    const key = this.buildClientVehicleIdentityKey(candidate);
    if (!key) continue;

    const previous = dedup.get(key);
    dedup.set(key, {
      model: candidate.model || previous?.model || '',
      plate: candidate.plate || previous?.plate || '',
      notes: candidate.notes || previous?.notes || ''
    });
  }

  return Array.from(dedup.values());
}

private collectVehiclesFromReservations(reservations: Client[]): ClientVehicleItem[] {
  const dedup = new Map<string, ClientVehicleItem>();
  const latestReservation = this.sortReservationsDesc(reservations || [])[0] || null;
  const latestReservationTs = latestReservation ? this.getReservationTs(latestReservation) : 0;

  for (const reservation of reservations || []) {
    const reservationTs = this.getReservationTs(reservation);
    const directVehicles = this.mapClientVehiclesFromBackend(reservation);

    if (directVehicles.length > 0) {
      for (const vehicle of directVehicles) {
        this.upsertCollectedVehicle(dedup, vehicle, reservationTs, latestReservationTs);
      }
    }

    const fallbackModel = (reservation.vehicle || '').toString().trim();
    const fallbackPlate = (reservation.plate || '').toString().trim();
    const fallbackNotes = (reservation.notes || '').toString().trim();
    if (!fallbackModel) {
      continue;
    }

    this.upsertCollectedVehicle(dedup, {
      model: fallbackModel,
      plate: fallbackPlate,
      notes: fallbackNotes
    }, reservationTs, latestReservationTs);
  }

  return Array.from(dedup.values()).sort((a, b) => {
    const aLatest = a.isLatest ? 1 : 0;
    const bLatest = b.isLatest ? 1 : 0;
    if (aLatest !== bLatest) {
      return bLatest - aLatest;
    }

    const aTs = a.lastSeenTs || 0;
    const bTs = b.lastSeenTs || 0;
    if (aTs !== bTs) {
      return bTs - aTs;
    }

    return (a.model || '').localeCompare(b.model || '');
  });
}

private upsertCollectedVehicle(
  dedup: Map<string, ClientVehicleItem>,
  vehicle: ClientVehicleItem,
  reservationTs: number,
  latestReservationTs: number
): void {
  const key = this.buildClientVehicleIdentityKey(vehicle);
  if (!key) {
    return;
  }

  const previous = dedup.get(key);
  const merged: ClientVehicleItem = {
    ...(previous || {}),
    model: vehicle.model || previous?.model || '',
    plate: vehicle.plate || previous?.plate || '',
    notes: vehicle.notes || previous?.notes || '',
    lastSeenTs: Math.max(previous?.lastSeenTs || 0, reservationTs || 0),
    isLatest: (previous?.isLatest || false) || reservationTs === latestReservationTs
  };

  dedup.set(key, merged);
}

private buildClientVehicleIdentityKey(vehicle: ClientVehicleItem | null | undefined): string {
  const model = this.normalizeText(vehicle?.model || '').toLowerCase();
  const plate = this.normalizeText(vehicle?.plate || '').toUpperCase();
  const notes = this.normalizeText(vehicle?.notes || '').toLowerCase();

  if (!model) {
    return '';
  }

  if (plate) {
    return `${model}|${plate}`;
  }

  if (notes) {
    return `${model}|${notes}`;
  }

  return model;
}

private hydrateClientFormFromReservation(client: Client, reservations: Client[] = []): void {
  if (!client) return;

  // Use ONLY the latest reservation's clientVehicles as authoritative source.
  // Aggregating across all historical reservations caused stale/deleted vehicles to re-appear.
  const backendVehicles = this.mapClientVehiclesFromBackend(client);
  this.clientVehiclesList = backendVehicles;

  if (backendVehicles.length > 0) {
    const primaryVehicleItem = backendVehicles[0];
    const primaryVehicleType = this.vehicles.find(v =>
      this.normalizeVehicleModel(v.model) === this.normalizeVehicleModel(primaryVehicleItem?.model)
    );

    this.clientForm.patchValue({
      name: client.name || '',
      vehicle: primaryVehicleItem?.model || client.vehicle || '',
      price: primaryVehicleType?.price || client.price || null,
      plate: primaryVehicleItem?.plate || client.plate || '',
      notes: primaryVehicleItem?.notes || client.notes || '',
      entryTimestamp: Date.now()
    }, { emitEvent: false });
  } else {
    this.clientForm.patchValue({
      name: client.name || '',
      vehicle: client.vehicle || '',
      price: client.price || null,
      plate: client.plate || '',
      notes: client.notes || '',
      entryTimestamp: Date.now()
    }, { emitEvent: false });
  }

  // Teléfono se carga aparte para sincronizar con intl-tel-input
  setTimeout(() => {
    const phoneToLoad = client.phoneIntl || client.phoneRaw || '';
    if (phoneToLoad && this.iti) {
      this.iti.setNumber(phoneToLoad);
      this.updatePhoneInfo(false);
      this.clientForm.patchValue({ phone: phoneToLoad }, { emitEvent: false });
    }
  }, 150);
}


private handleReservationsByDniResult(reservations: Client[]): void {
  const rows = this.sortReservationsDesc(reservations);

  if (!rows.length) {
    this.existingClientId = null;
    this.clearClientVehicleWorkingList();
    if (this.dniLookupSource === 'local') {
      this.dniLookupMessage = 'Sin conexion. No se encontraron coincidencias en el cache local para este DNI.';
    } else if (this.clientForm.get('dni')?.value) {
      this.dniLookupMessage = 'No se encontraron reservas previas para este DNI.';
    } else {
      this.dniLookupMessage = '';
    }
    return;
  }

  const client = rows[0];
  const isInactive = client.spaceKey === null || client.spaceKey === '';

  if (isInactive) {
    this.existingClientId = client.id;
    this.toastService.showInfo(`Cliente encontrado: ${client.name}. Se reutilizara su informacion sin reserva activa.`, 5000);
  } else {
    this.existingClientId = null;
    this.toastService.showWarning(`Cliente encontrado: ${client.name}. Ya tiene una reserva activa y se creara una nueva reserva para otro vehiculo.`, 5500);
  }

  this.hydrateClientFormFromReservation(client, rows);

  this.dniLookupMessage = this.dniLookupSource === 'local'
    ? `Cliente recuperado desde cache local. Se sincronizara con el servidor cuando vuelva la conexion.`
    : `Cliente recuperado desde el servidor.`;

  const reservationsAudit = rows.map((reservation) => ({
    id: reservation.id,
    vehicle: reservation.vehicle,
    plate: reservation.plate,
    clientVehicles: (reservation.clientVehicles || []).map(cv => ({
      model: cv.vehicleType?.model || '',
      plate: cv.plate || '',
      notes: cv.notes || ''
    }))
  }));

  console.log('[DNI] cliente hidratado desde backend', {
    dni: client.dni,
    clientId: client.id,
    reservations: rows.length,
    reservationsAudit,
    distinctVehiclesLoaded: this.clientVehiclesList.length,
    vehicles: this.clientVehiclesList
  });
}

private fetchReservationsByDni$(dni: string): Observable<Client[]> {
  const safeDni = (dni || '').toString().trim();

  if (safeDni.length < 7) {
    this.existingClientId = null;
    this.dniLookupSource = null;
    this.dniLookupMessage = '';
    return of([] as Client[]);
  }

  return this.autolavadoService.getClientReservationsByDniWithSource(safeDni).pipe(
    map((result: ClientReservationsLookupResult) => {
      this.dniLookupSource = result.source;
      return result.reservations || [];
    }),
    catchError((err) => {
      this.dniLookupSource = null;
      this.dniLookupMessage = '';
      console.warn('[DNI] Error obteniendo reservas por DNI', err);
      return of([] as Client[]);
    })
  );
}


private getClientIdentityFromForm(): { dni: string; phone: string; name: string } {
  const dni = (this.clientForm.get('dni')?.value || '').toString().trim();
  const phone = (this.clientForm.get('phone')?.value || '').toString().replace(/\D/g, '');
  const name = (this.clientForm.get('name')?.value || '').toString().trim().toLowerCase();
  return { dni, phone, name };
}

private sameClientIdentity(a: Client, identity: { dni: string; phone: string; name: string }): boolean {
  const aDni = (a.dni || '').toString().trim();
  const aPhone = (a.phoneIntl || a.phoneRaw || '').toString().replace(/\D/g, '');
  const aName = (a.name || '').toString().trim().toLowerCase();

  if (identity.dni && aDni) return identity.dni === aDni;
  if (identity.phone && aPhone) return identity.phone === aPhone;
  if (identity.name && aName) return identity.name === aName;

  return false;
}

private getReservationTs(client: Client): number {
  const entry = this.toTimestamp(client.entryTimestamp);
  const exit = this.toTimestamp(client.exitTimestamp);
  return entry ?? exit ?? 0;
}

private findLastReservationForVehicle(model: string): Client | null {
  const identity = this.getClientIdentityFromForm();
  const targetModel = this.normalizeText(model);

  if (!targetModel) return null;
  if (!identity.dni && !identity.phone && !identity.name) return null;

  const matches = (this.allClients || [])
    .filter(c => this.sameClientIdentity(c, identity))
    .filter(c => this.normalizeText(c.vehicle) === targetModel)
    .sort((a, b) => this.getReservationTs(b) - this.getReservationTs(a));

  return matches.length ? matches[0] : null;
}
















private findActiveVehicleReservationConflict0(dni: string, vehicleModel: string): { clientId: any; spaceKey: string | null } | null {
  const dniNorm = this.normalizeText(dni);
  const vehicleNorm = this.normalizeText(vehicleModel);

  if (!dniNorm || !vehicleNorm) return null;

  for (const c of Object.values(this.clients || {})) {
    const sameDni = this.normalizeText(c.dni) === dniNorm;
    const sameVehicle = this.normalizeText(c.vehicle) === vehicleNorm;
    if (!sameDni || !sameVehicle) continue;

    // si estoy reutilizando el mismo registro, no lo tomo como conflicto
    if (this.existingClientId && String(c.id) === String(this.existingClientId)) {
      continue;
    }

    const isActiveByExit = c.exitTimestamp === null || c.exitTimestamp === undefined;
    const isActiveBySpace = !!c.spaceKey && !!this.spaces[c.spaceKey]?.occupied;

    if (isActiveByExit || isActiveBySpace) {
      return {
        clientId: c.id,
        spaceKey: c.spaceKey || null
      };
    }
  }

  return null;
}

private findActiveVehicleReservationConflict(dni: string, vehicleModel: string): { clientId: any; spaceKey: string | null } | null {
  const dniNorm = this.normalizeText(dni);
  const vehicleNorm = this.normalizeText(vehicleModel);

  if (!dniNorm || !vehicleNorm) return null;

  for (const c of Object.values(this.clients || {})) {
    if (!c) continue;

    const sameDni = this.normalizeText(c.dni) === dniNorm;
    if (!sameDni) continue; // <-- solo comparar si es el mismo cliente

    const sameVehicle = this.normalizeText(c.vehicle) === vehicleNorm;
    if (!sameVehicle) continue;

    // si estoy reutilizando el mismo registro, no lo tomo como conflicto
    if (this.existingClientId && String(c.id) === String(this.existingClientId)) {
      continue;
    }

    const isActiveByExit = c.exitTimestamp === null || c.exitTimestamp === undefined;
    const isActiveBySpace = !!c.spaceKey && !!this.spaces[c.spaceKey]?.occupied;

    if (isActiveByExit || isActiveBySpace) {
      return {
        clientId: c.id,
        spaceKey: c.spaceKey || null
      };
    }
  }

  return null;
}





onVehicleSelected0(event: Event): void {
  const select = event.target as HTMLSelectElement;
  const selectedModel = select.value;

  if (!selectedModel) {
    this.clientForm.patchValue({ price: 0 });
    return;
  }

  const selectedVehicle = this.vehicles.find(v => v.model === selectedModel);

  if (selectedVehicle) {
    // Carga el precio por defecto
    this.clientForm.patchValue({ price: selectedVehicle.price });

    console.log('🚗 Vehículo seleccionado:', {
      modelo: selectedVehicle.model,
      categoria: selectedVehicle.category,
      precioPorDefecto: selectedVehicle.price
    });
  }
}


onVehicleSelected(event: Event): void {
  const select = event.target as HTMLSelectElement;
  const selectedModel = select.value.trim();

  // Si no hay selección o es el placeholder, resetear precio
  if (!selectedModel || selectedModel === '') {
    this.clientForm.patchValue({ price: 0 });
    return;
  }

  const selectedVehicle = this.vehicles.find(v => v.model === selectedModel);

  if (selectedVehicle) {
    // Vehículo existe → cargar precio
    this.clientForm.patchValue({ price: selectedVehicle.price });
    console.log('Vehículo existente seleccionado:', selectedVehicle.model);
  } else {
    // Vehículo NO existe → ofrecer agregar nuevo
    void this.confirmUnknownVehicleSelection(selectedModel, select);
  }
}

private async confirmUnknownVehicleSelection(selectedModel: string, select: HTMLSelectElement): Promise<void> {
  const confirmed = await this.confirmService.confirm({
    title: 'Agregar vehiculo',
    message: `El modelo "${selectedModel}" no existe. Quieres agregarlo ahora?`,
    confirmText: 'Agregar vehiculo',
    cancelText: 'Cancelar',
    variant: 'primary'
  });

  if (confirmed) {
    this.newVehicleModel = selectedModel;
    this.showNewVehicleModal = true;
    return;
  }

  select.value = '';
  this.clientForm.patchValue({ vehicle: '', price: 0 });
}




saveNewVehicle(): void {
  if (!this.newVehicleModel.trim()) {
    this.toastService.showWarning('Debes ingresar un modelo de vehiculo.');
    return;
  }

  const payload = {
    model: this.newVehicleModel.trim(),
    category: this.newVehicleCategory,
    price: this.newVehiclePrice
  };

  console.log('Enviando nuevo vehículo al backend:', payload); // ← Log clave

  this.autolavadoService.createVehicleType(payload).subscribe({
    next: (newType) => {
      console.log('Nuevo tipo creado:', newType);
      this.vehicles.push(newType);
      this.vehicles.sort((a, b) => a.model.localeCompare(b.model));
      this.closeAddVehicleModal();

      this.clientForm.patchValue({
        vehicle: newType.model,
        price: newType.price
      });

      this.toastService.showSuccess(`Vehículo "${newType.model}" (${newType.category}) creado — $${newType.price.toLocaleString('es-AR')}`);
      this.cdr.markForCheck();
    },
    error: (err) => {
      console.error('Error creando vehiculo:', err);
      if (Number(err?.status || 0) === 0) {
        const offlineType = this.autolavadoService.createVehicleTypeOffline(payload);
        this.autolavadoService.queueCreateVehicleTypeSync(payload);
        this.vehicles = [...this.autolavadoService.vehicleTypesSubject.value];
        this.closeAddVehicleModal();

        this.clientForm.patchValue({
          vehicle: offlineType.model,
          price: offlineType.price
        });

        this.toastService.showWarning(`Vehiculo "${offlineType.model}" creado localmente. Se sincronizara cuando vuelva la conexion.`);
        this.cdr.markForCheck();
        return;
      }

      this.toastService.showError('Error al agregar el vehiculo.');
    }
  });
}


updatePriceFromCategory(): void {
  switch (this.newVehicleCategory) {
    case 'SUV':
      this.newVehiclePrice = 40000;
      break;
    case 'AUTO':
      this.newVehiclePrice = 35000;
      break;
    case 'PICKUP':
      this.newVehiclePrice = 70000;
      break;
    case 'ALTO PORTE':
      this.newVehiclePrice = 100000;
      break;
    case 'MOTO':
      this.newVehiclePrice = 35000;
      break;
    default:
      this.newVehiclePrice = 35000;
  }
}


async deleteVehicle(id: number, event: Event): Promise<void> {
  event.stopPropagation(); // Evita que se seleccione la fila al pulsar eliminar

  const confirmed = await this.confirmService.confirm({
    title: 'Eliminar vehiculo',
    message: 'Eliminar este tipo de vehiculo permanentemente?',
    confirmText: 'Eliminar vehiculo',
    cancelText: 'Cancelar',
    variant: 'danger'
  });

  if (!confirmed) return;

  this.autolavadoService.deleteVehicleType(id).subscribe({
    next: (result) => {
      this.vehicles = this.vehicles.filter(v => v.id !== id);
      this.toastService.showSuccess('Vehiculo eliminado.');
      this.cdr.markForCheck();
    },
    error: (err) => {
      console.error(err);
      this.toastService.showError('Error al eliminar el vehiculo.');
    }
  });
}






// Cerrar modal sin guardar
closeNewVehicleModal(): void {
  this.showNewVehicleModal = false;
  this.newVehicleModel = '';
}




   openWhatsApp0(): void {
    if (this.whatsappLink) {
      window.location.href = this.whatsappLink;
    }
  }

  openWhatsApp2(): void {
  if (this.whatsappLink) {
    // Descargar QR antes de abrir WhatsApp
    this.qrService.downloadQR('qrcode', `${this.qrCaption}.png`);
    window.open(this.whatsappLink, '_blank'); // Abrir en nueva pestaña para attach manual
  }
}

openWhatsApp(): void {
  this.showWhatsAppModal = true;
}

closeWhatsAppModal(): void {
  this.showWhatsAppModal = false;
}




copyMessage0(): void {
  navigator.clipboard.writeText(this.whatsappMessage).then(() => {
    this.hasCopiedMessage = true;
    this.toastService.showSuccess('Mensaje copiado al portapapeles.');
  });
}

copyMessage(): void {
  navigator.clipboard.writeText(this.whatsappMessage).then(() => {
    this.hasCopiedMessage = true;
    this.cdr.markForCheck();
    this.toastService.showSuccess('Mensaje copiado al portapapeles.');
  }).catch(err => {
    console.error('Error copying message:', err);
    this.toastService.showError('No se pudo copiar el mensaje.');
  });
}

launchWhatsApp(): void {
  if (this.whatsappLink) {
    this.qrService.downloadQR('qrcode', `${this.qrCaption}.png`);
    window.open(this.whatsappLink, '_blank');
    // this.closeWhatsAppModalOccupied();

    //this.hasCopiedMessageOccupied = false
    this.hasCopiedMessage = false;
    // No cerramos el modal aquí
  }
}



launchWhatsAppRelease(): void {
  if (!this.selectedClient || !this.whatsappMessageOccupied) return;
  if (!this.hasCopiedMessageOccupied) return;

  const phone = this.selectedClient.phoneIntl.replace(/\D/g, ''); // Limpia el número
  const message = this.whatsappMessageOccupied;
  const encoded = encodeURIComponent(message);
  const link = `whatsapp://send?phone=${phone}&text=${encoded}`;

  // Abrir WhatsApp
  window.open(link, '_blank');

  // Marcar como enviado y persistir
  const sentSpaceKey = this.selectedSpace?.key || this.selectedSpaceKey;
  if (sentSpaceKey) {
    this.sentReleaseWhatsappBySpace.add(sentSpaceKey);
    this.saveSentWhatsappState(); // Guardar en localStorage
  }

  this.hasCopiedMessageOccupied = false;

  // Cerrar modal WhatsApp
  //this.closeWhatsAppModalOccupied();
}



launchWhatsAppOccupied(): void {
  if (this.whatsappLink) {
    //this.qrService.downloadQR('qrcode', `${this.qrCaption}.png`);
    window.open(this.whatsappLink, '_blank');


  }
}

 downloadQR(): void {
    this.qrService.downloadQR('qrcode', `cliente_${this.selectedSpaceKey, this.qrCaption}.png`);

  }

  downloadOccupiedQR(): void {
    this.qrService.downloadQR('occQRElm', `cliente_${this.selectedClient?.code, this.qrCaption || 'cliente'}.png`);
  }



// En tu componente .ts
openWhatsApp1(): void {
  if (this.whatsappLink) {
    // Primero descargar QR
    this.qrService.downloadQR('qrcode', `${this.qrCaption}.png`);

    // Pequeño delay para que termine la descarga
    setTimeout(() => {
      // Abrir WhatsApp en la misma ventana para mejor experiencia
      window.location.href = this.whatsappLink;

      // Alternativa: abrir en nueva pestaña
      // window.open(this.whatsappLink, '_blank', 'noopener,noreferrer');
    }, 100);
  } else {
    this.toastService.showWarning('No se pudo generar el link de WhatsApp.');
  }
}

  toggleQR(): void {
    this.showQR = !this.showQR;
    if (this.showQR && this.clientForm.valid) {
      // Generar QR previo con datos actuales
      const tempClient = {
        id: 'temp',
        code: 'PREVIA',
        name: this.clientForm.value.name || '—',
        phone: `+${this.autolavadoService.toPhoneAR(this.clientForm.value.phone)}`
      };
      const fakeSpace = {
        key: this.selectedSpaceKey,
        subsuelo: this.selectedSpaceKey.split('-')[0]
      };
      const tempQR = JSON.stringify({
        t: 'autolavado-ticket',
        client: tempClient,
        space: fakeSpace,
        start: Date.now()
      });

      this.qrService.generateQR('qrcode', tempQR);
      this.qrCaption = `${tempClient.name} — ${tempClient.code}`;
    }
  }



toggleOccupiedQR(): void {
  this.showOccupiedQR = !this.showOccupiedQR;
  if (this.showOccupiedQR && this.selectedClient) {
    console.log('toggleOccupiedQR: Generando QR para', this.selectedClient.qrText);
    // Esperar renderizado completo del modal
    setTimeout(() => {
      const container = document.getElementById('occQRElm');
      if (container) {
        this.qrService.generateQR('occQRElm', this.selectedClient!.qrText);
        console.log('QR generado para occupied modal');
      } else {
        console.error('Container #occQRElm no encontrado - Modal no renderizado aún');
        // Reintento si no está listo
        setTimeout(() => {
          const retryContainer = document.getElementById('occQRElm');
          if (retryContainer) {
            this.qrService.generateQR('occQRElm', this.selectedClient!.qrText);
            console.log('QR generado en reintento');
          }
        }, 200);
      }
    }, 600); // Aumentar delay para modal Bootstrap
  }
}




async releaseSpace(): Promise<void> {
  const displayName = this.selectedSpace?.displayName || this.selectedSpaceKey;
  const confirmed = await this.confirmService.confirm({
    title: 'Liberar espacio',
    message: `Liberar espacio ${displayName}?`,
    confirmText: 'Liberar',
    cancelText: 'Cancelar',
    variant: 'warning'
  });

  if (!confirmed) {
    return;
  }

  const releasedClient = this.selectedClient ? { ...this.selectedClient } : null;
  const release$ = this.autolavadoService.releaseSpace(this.selectedSpaceKey);

  if (releasedClient) {
    this.whatsappMessageOccupied = this.autolavadoService.buildWhatsAppMessageRelease(releasedClient);
    this.hasCopiedMessageOccupied = false;
    this.showWhatsAppModalOccupied = true;
    this.cdr.markForCheck();
  }

  this.filterSpaces();
  this.hideModal('occupiedModal');

  release$.subscribe({
      next: () => {
        console.log('Espacio liberado y datos sincronizados');

        const spaceKey = this.selectedSpace?.key || this.selectedSpaceKey;
        if (spaceKey && this.sentReleaseWhatsappBySpace.has(spaceKey)) {
          this.sentReleaseWhatsappBySpace.delete(spaceKey);
          this.saveSentWhatsappState(); // Actualizar persistencia
        }

        this.toastService.showSuccess('Espacio liberado correctamente');
      },
      error: (err) => {
        console.warn('Error liberando espacio', err);
        if (Number(err?.status || 0) === 0) {
          this.toastService.showWarning('Espacio liberado localmente. Se sincronizara cuando vuelva la conexion.');
          return;
        }

        this.showWhatsAppModalOccupied = false;
        this.toastService.showError('No se pudo liberar el espacio. Se revirtio el cambio.');
        this.cdr.markForCheck();
      }
    });
}



  private showModal(modalId: string): void {
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();
  }

  private hideModal(modalId: string): void {
    const modal = bootstrap.Modal.getInstance(document.getElementById(modalId));
    if (modal) {
      modal.hide();
    }
  }



openCerrarDiaModal(): void {
  const hoy = new Date().toLocaleDateString('es-AR');
  this.cerrarDiaModalMessage =
    `Cerrar el día ${hoy}?\n
    - Esto liberará todos los espacios.\n
    - Los clientes se mantendrán en el histórico.\n
    - Haga el reporte antes de ejecutar esta acción o perderá los servicios del día.\n
    Continuar?`;
  this.showModal('closeDayModal');
}

confirmCerrarDia(): void {
  this.hideModal('closeDayModal');
  this.cerrarDia();
}




cerrarDia(): void {

    if (this.isClosingDay) {
    console.log('[CloseDay] cierre ya en curso, se ignora doble click');
    return;
  }

  const hoy = new Date().toLocaleDateString('es-AR');
  this.isClosingDay = true;
  console.log('[CloseDay] Iniciando cierre manual del día via backend unificado...');

  this.autolavadoService.finalizeDailyReportAndCloseDayInBackend$().subscribe({
    next: () => {
      console.log('[CloseDay] Día cerrado correctamente (backend finalizó reporte + reset)');

      this.sentReleaseWhatsappBySpace.clear();
      localStorage.removeItem(this.WHATSAPP_SENT_STORAGE_KEY);

      this.loadAllClientsFromBackend();
      this.filterSpaces();

      this.cerrarDiaResultMessage =
        `Día ${hoy} cerrado.\n` +
        `Se consolidó el reporte diario final y luego se liberaron los espacios.\n` +
        `Datos sincronizados con el servidor.`;

      this.showModal('closeDayResultModal');
       this.isClosingDay = false;
    },
    error: (err) => {
      if (Number(err?.status || 0) === 0) {
        this.handleOfflineCloseDayFallback(hoy);
        return;
      }

      console.warn('[CloseDay] Error en cierre manual unificado', err);

      this.cerrarDiaResultMessage =
        'No se pudo completar el cierre del día en el servidor (reporte final + reset).\n' +
        'No se aplicó el cierre completo. Intenta nuevamente.';

      this.showModal('closeDayResultModal');
      this.isClosingDay = false;
    }
  });
}


private handleOfflineCloseDayFallback(hoy: string): void {
  this.autolavadoService.resetData().subscribe({
    next: (result) => {
      this.sentReleaseWhatsappBySpace.clear();
      localStorage.removeItem(this.WHATSAPP_SENT_STORAGE_KEY);

      this.filterSpaces();

      this.cerrarDiaResultMessage = result?.offlineQueued
        ? `Día ${hoy} cerrado localmente.\nNo se pudo finalizar el reporte diario en el servidor porque no hay conexión.\nEl reset quedó pendiente de sincronización.`
        : `Día ${hoy} cerrado localmente.\nEl reporte final del servidor no pudo generarse en este intento, pero los espacios ya quedaron liberados y sincronizados.`;

      this.showModal('closeDayResultModal');
      this.isClosingDay = false;
    },
    error: (resetErr) => {
      console.warn('[CloseDay] Error en fallback offline del cierre manual', resetErr);
      this.cerrarDiaResultMessage =
        'No se pudo completar el cierre del día en el servidor y tampoco se pudo aplicar el reset local de forma segura.';
      this.showModal('closeDayResultModal');
      this.isClosingDay = false;
    }
  });
}


 deleteSpace(): void {
  void this.deleteSpaceWithConfirm();
}

  private async deleteSpaceWithConfirm(): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Eliminar espacio',
      message: `Eliminar espacio ${this.selectedSpaceKey}? Esta accion no se puede deshacer.`,
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      variant: 'danger'
    });

    if (!confirmed) {
      return;
    }

    try {
      this.autolavadoService.deleteSpace(this.selectedSpaceKey);
      this.hideModal('clientModal');
      this.toastService.showSuccess('Espacio eliminado correctamente.');
    } catch (error: any) {
      this.toastService.showError('No se pudo eliminar el espacio: ' + (error?.message || error));
    }
  }




deleteSubsuelo(): void {
  void this.deleteSubsueloWithConfirm();
}

private async deleteSubsueloWithConfirm(): Promise<void> {
  if (!this.currentSubId) {
    this.toastService.showWarning('Selecciona un subsuelo para eliminar.');
    return;
  }

  const confirmed = await this.confirmService.confirm({
    title: 'Eliminar subsuelo',
    message: `Eliminar subsuelo ${this.currentSubId}? Esta accion no se puede deshacer.`,
    confirmText: 'Eliminar subsuelo',
    cancelText: 'Cancelar',
    variant: 'danger'
  });

  if (!confirmed) {
    return;
  }

  try {
    this.autolavadoService.deleteSubsuelo(this.currentSubId);
    this.filterSpaces();
    this.toastService.showSuccess('Subsuelo eliminado correctamente.');
  } catch (error: any) {
    this.toastService.showError('Error al eliminar subsuelo: ' + (error?.message || error));
  }
}

deleteSpaces(): void {
  void this.deleteSpacesWithConfirm();
}

private async deleteSpacesWithConfirm(): Promise<void> {
  if (!this.currentSubId) {
    this.toastService.showWarning('Selecciona un subsuelo para eliminar espacios.');
    return;
  }

  if (!this.addSpacesCount || this.addSpacesCount < 1) {
    this.toastService.showWarning('La cantidad de espacios a eliminar debe ser mayor que cero.');
    return;
  }

  const confirmed = await this.confirmService.confirm({
    title: 'Eliminar espacios',
    message: `Eliminar ${this.addSpacesCount} espacios del subsuelo ${this.currentSubId}?`,
    confirmText: 'Eliminar espacios',
    cancelText: 'Cancelar',
    variant: 'danger'
  });

  if (!confirmed) {
    return;
  }

  try {
    this.autolavadoService.deleteSpacesFromCurrent(this.addSpacesCount);
    this.filterSpaces();
    this.currentPage = 1;
    this.toastService.showSuccess(`${this.addSpacesCount} espacios eliminados correctamente.`);
  } catch (error: any) {
    this.toastService.showError('Error al eliminar espacios: ' + (error?.message || error));
  }
}



get totalPages(): number {
  if (!this.currentSubId) return 1;
  const totalSpaces = Object.values(this.spaces)
    .filter(sp => sp.subsueloId === this.currentSubId)
    .length;
  return Math.ceil(totalSpaces / this.itemsPerPage);
}

goToPage(page: number): void {
  if (page >= 1 && page <= this.totalPages) {
    this.currentPage = page;
    this.filterSpaces();
  }
}

nextPage(): void {
  this.goToPage(this.currentPage + 1);
}

prevPage(): void {
  this.goToPage(this.currentPage - 1);
}





editSpace(space: Space): void {
  this.selectedSpaceKey = space.key;
  this.editedSpace = {
    ...space,
    client: space.client ? { ...space.client } : null // Copia completa del espacio y cliente
  };
  this.newSpaceKey = space.key;

  this.showModal('editSpaceModal');
  console.log('Datos del espacio antes de editar:', this.editedSpace); // Logging para depurar
}


confirmEditSpace(): void {
  void this.confirmEditSpaceWithConfirm();
}

private async confirmEditSpaceWithConfirm(): Promise<void> {
  console.log('confirmEditSpace ejecutado', { newSpaceKey: this.newSpaceKey, selectedSpaceKey: this.selectedSpaceKey, editedSpace: this.editedSpace });

  if (!this.editedSpace) {
    this.toastService.showWarning('No hay datos del espacio para editar.');
    return;
  }

  this.newSpaceKey = this.selectedSpaceKey;

  const confirmed = await this.confirmService.confirm({
    title: 'Guardar cambios del espacio',
    message: `Guardar cambios para el espacio ${this.selectedSpaceKey}?`,
    confirmText: 'Guardar cambios',
    cancelText: 'Cancelar',
    variant: 'primary'
  });

  if (!confirmed) {
    return;
  }

  try {
    console.log('Llamando al servicio editSpace');
    this.autolavadoService.editSpace(this.selectedSpaceKey, this.selectedSpaceKey, this.editedSpace);
    console.log('Servicio exitoso, actualizando vista');
    this.filterSpaces();
    this.cdr.detectChanges();
    this.hideModal('editSpaceModal');
    this.toastService.showSuccess('Espacio editado correctamente.');
  } catch (error: any) {
    console.error('Error en confirmEditSpace:', error);
    this.toastService.showError('Error al editar espacio: ' + (error?.message || error));
  }
}



transferSpace(): void {
  const currentSubsueloId = this.selectedSpace?.subsueloId || null;

  if (!this.selectedSpaceKey || !currentSubsueloId) {
    this.toastService.showWarning('No se pudo identificar el subsuelo actual del espacio.');
    return;
  }

  const options = this.buildTransferSubsueloOptions(currentSubsueloId);
  if (!options.length) {
    this.toastService.showWarning('No hay otros subsuelos disponibles para transferir este espacio.');
    return;
  }

  this.transferSubsueloOptions = options;
  this.selectedTransferSubsueloId = '';
  this.showTransferSpaceModal = true;
}

private buildTransferSubsueloOptions(currentSubsueloId: string): TransferSubsueloOption[] {
  return (this.subsuelos || [])
    .filter(sub => sub.id !== currentSubsueloId)
    .map(sub => {
      const spaces = Object.values(this.spaces).filter(space => space.subsueloId === sub.id);
      const occupiedSpaces = spaces.filter(space => space.occupied).length;

      return {
        id: sub.id,
        label: sub.label || sub.id,
        totalSpaces: spaces.length,
        occupiedSpaces,
        freeSpaces: Math.max(spaces.length - occupiedSpaces, 0)
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

selectTransferSubsuelo(subsueloId: string): void {
  this.selectedTransferSubsueloId = subsueloId;
}

closeTransferSpaceModal(): void {
  if (this.isSubmittingTransferSpace) {
    return;
  }

  this.showTransferSpaceModal = false;
  this.selectedTransferSubsueloId = '';
  this.transferSubsueloOptions = [];
}

confirmTransferSpaceSelection(): void {
  if (!this.selectedTransferSubsueloId) {
    this.toastService.showWarning('Selecciona un subsuelo destino para continuar.');
    return;
  }

  const newSubsuelo = this.selectedTransferSubsueloId;
  const targetOption = this.transferSubsueloOptions.find(option => option.id === newSubsuelo);

  this.isSubmittingTransferSpace = true;

  try {
    // Transferir localmente (tu logica actual)
    this.autolavadoService.transferSpace(this.selectedSpaceKey, newSubsuelo);

    // Transferir en backend
    this.autolavadoService.transferSpaceInBackend(this.selectedSpaceKey, newSubsuelo).subscribe({
      next: () => {
        console.log('Espacio transferido en backend');
        this.filterSpaces();
        this.isSubmittingTransferSpace = false;
        this.closeTransferSpaceModal();
        this.toastService.showSuccess(`Espacio transferido correctamente a ${targetOption?.label || newSubsuelo}.`);
      },
      error: (err) => {
        console.warn('Error transferiendo en backend (funciona offline)', err);
        this.filterSpaces();
        this.isSubmittingTransferSpace = false;
        this.closeTransferSpaceModal();
        this.toastService.showWarning('Espacio transferido localmente. Se sincronizara cuando vuelva la conexion.');
      }
    });
  } catch (error: any) {
    this.isSubmittingTransferSpace = false;
    this.toastService.showError('Error al transferir espacio: ' + (error?.message || error));
  }
}




openWhatsAppModalOccupied(): void {
  if (this.selectedClient && this.selectedSpace) {
    this.whatsappMessageOccupied = this.autolavadoService.buildWhatsAppMessageRelease(this.selectedClient);
    this.hasCopiedMessageOccupied = false;
    this.showWhatsAppModalOccupied = true;
  }
}

// Método para cerrar modal WhatsApp
closeWhatsAppModalOccupied(): void {
  this.showWhatsAppModalOccupied = false;
}

// Método para copiar mensaje
copyMessageOccupied(): void {
  navigator.clipboard.writeText(this.whatsappMessageOccupied).then(() => {
    this.hasCopiedMessageOccupied = true;
    this.cdr.markForCheck();
    this.toastService.showSuccess('Mensaje copiado al portapapeles.');
  }).catch(err => {
    console.error('Error copying message:', err);
    this.toastService.showError('No se pudo copiar el mensaje.');
  });


}

copyMessageOccupied01(): void {
  navigator.clipboard.writeText(this.whatsappMessageOccupied).then(() => {
    this.hasCopiedMessageOccupied = true;

    // Guardar en el Set y persistir
    if (this.selectedSpace?.key) {
      this.sentReleaseWhatsappBySpace.add(this.selectedSpace.key);
      this.saveSentWhatsappState(); // ← Persistir en localStorage
    }

    this.toastService.showSuccess('Mensaje copiado al portapapeles.');
  }).catch(err => {
    console.error('Error copying message:', err);
    this.toastService.showError('No se pudo copiar el mensaje.');
  });
}

isReleaseMessageSentForSpace(space: Space): boolean {
  if (!space?.key) return false;
  return this.sentReleaseWhatsappBySpace.has(space.key);
}






private resolveVehicleTypesFromUI(): VehicleType[] {
  const byModel = new Map<string, VehicleType>();
  this.vehicles.forEach(v => byModel.set(v.model.toLowerCase(), v));

  const result: VehicleType[] = [];

  // Desde la lista del modal
  this.clientVehiclesList.forEach(item => {
    const vt = byModel.get((item.model || '').toLowerCase());
    if (vt && !result.some(r => r.id === vt.id)) result.push(vt);
  });

  // Desde el selector actual
  const selectedModel = (this.clientForm.value.vehicle || '').toString().trim();
  const selected = byModel.get(selectedModel.toLowerCase());
  if (selected && !result.some(r => r.id === selected.id)) result.push(selected);

  if (result.length > 4) {
    throw new Error('Solo se permiten hasta 4 vehículos por cliente.');
  }

  return result;
}


trackBySpaceKey(index: number, space: Space): string | number {
  return space?.key ?? index;
}

trackByClientVehicleModel0(index: number, item: ClientVehicleItem): string | number {
  const model = (item?.model || '').toString().trim().toLowerCase();
  return model || index;
}

trackByClientVehicleModel(index: number, item: ClientVehicleItem): string | number {
  const model = (item?.model || '').toString().trim().toLowerCase();
  const plate = (item?.plate || '').toString().trim().toUpperCase();
  const notes = (item?.notes || '').toString().trim().toLowerCase();

  if (!model) {
    return index;
  }

  if (plate) {
    return `${model}|${plate}`;
  }

  if (notes) {
    return `${model}|${notes}`;
  }

  return model;
}


trackByVisitId(index: number, visit: Client): any {
  return visit?.id ?? `${visit?.dni || 'x'}-${visit?.vehicle || 'x'}-${index}`;
}



trackByPageNumber(index: number, page: number): number {
  return page;
}



}
