import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';
import { NotificationService, NotificationItem } from '../../../core/services/notification.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, IconComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent implements OnInit {
  authService = inject(AuthService);
  i18n = inject(I18nService);
  notificationService = inject(NotificationService);
  private router = inject(Router);

  isProfileMenuOpen = signal<boolean>(false);
  isNotificationsOpen = signal<boolean>(false);

  unreadCount = computed(() => this.notificationService.unreadCount());
  notifications = computed(() => this.notificationService.notifications());

  ngOnInit(): void {
    if (this.authService.isLoggedIn()) {
      this.notificationService.loadNotifications();
    }
  }

  toggleProfileMenu(): void {
    this.isProfileMenuOpen.update((v) => !v);
    if (this.isProfileMenuOpen()) {
      this.isNotificationsOpen.set(false);
    }
  }

  toggleNotifications(): void {
    this.isNotificationsOpen.update((v) => !v);
    if (this.isNotificationsOpen()) {
      this.isProfileMenuOpen.set(false);
      this.notificationService.loadNotifications();
    }
  }

  closeNotifications(): void {
    this.isNotificationsOpen.set(false);
  }

  markAllRead(): void {
    this.notificationService.markAllAsRead();
  }

  handleNotificationClick(notif: NotificationItem): void {
    if (!notif.read) {
      this.notificationService.markAsRead(notif.id);
    }
    this.isNotificationsOpen.set(false);
    if (notif.link) {
      this.router.navigateByUrl(notif.link);
    }
  }

  getNotificationTitle(item: NotificationItem): string {
    return this.notificationService.getNotificationTitle(item, this.i18n.currentLang());
  }

  getIconForKind(kind: string): string {
    switch (kind) {
      case 'course':
        return 'graduation-cap';
      case 'task':
        return 'kanban';
      case 'request':
        return 'file-text';
      case 'escalation':
        return 'shield';
      default:
        return 'bell';
    }
  }

  openProfile(): void {
    this.isProfileMenuOpen.set(false);
    this.router.navigate(['/profile']);
  }

  logout(): void {
    this.isProfileMenuOpen.set(false);
    this.isNotificationsOpen.set(false);
    this.authService.logout();
  }
}
