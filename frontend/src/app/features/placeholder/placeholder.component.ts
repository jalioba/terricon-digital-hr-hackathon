import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-placeholder',
  standalone: true,
  imports: [CommonModule, RouterModule, IconComponent],
  templateUrl: './placeholder.component.html',
  styleUrl: './placeholder.component.scss'
})
export class PlaceholderComponent implements OnInit {
  private route = inject(ActivatedRoute);

  title: string = 'Раздел в разработке';
  iconName: string = 'clock';

  ngOnInit(): void {
    const data = this.route.snapshot.data;
    if (data['title']) {
      this.title = data['title'];
    }
    if (data['icon']) {
      this.iconName = data['icon'];
    }
  }
}
