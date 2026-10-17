import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loading.component.html',
  styleUrl: './loading.component.scss'
})
export class LoadingComponent {
  @Input() text: string = 'Загрузка данных из базы...';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() type: 'spinner' | 'skeleton-table' | 'skeleton-cards' = 'spinner';
  @Input() rows: number = 4;

  getRowArray(): number[] {
    return Array.from({ length: this.rows }, (_, i) => i);
  }
}
