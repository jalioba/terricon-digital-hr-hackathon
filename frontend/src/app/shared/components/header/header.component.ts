import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, IconComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  authService = inject(AuthService);
  i18n = inject(I18nService);
  private router = inject(Router);

  isProfileMenuOpen = signal<boolean>(false);
  unreadCount = signal<number>(2);

  toggleProfileMenu(): void {
    this.isProfileMenuOpen.update((v) => !v);
  }

  toggleNotifications(): void {
    this.router.navigate(['/tasks']);
  }

  openProfile(): void {
    this.isProfileMenuOpen.set(false);
    this.router.navigate(['/profile']);
  }

  logout(): void {
    this.isProfileMenuOpen.set(false);
    this.authService.logout();
  }
}
