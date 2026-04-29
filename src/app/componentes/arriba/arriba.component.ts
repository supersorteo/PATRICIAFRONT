import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-arriba',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './arriba.component.html',
  styleUrls: ['./arriba.component.scss']
})
export class ArribaComponent {
  title = 'Gestión de Autolavado-Parking';

}
