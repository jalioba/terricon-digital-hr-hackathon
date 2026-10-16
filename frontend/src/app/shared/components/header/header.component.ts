import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';
import { NotificationService } from '../../../core/services/notification.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, IconComponent],
  template: `
    <header class="app-header">
      <div class="header-left">
        <a routerLink="/" class="brand-container">
          <div class="brand-logo">
            <span class="logo-accent">J</span>
          </div>
          <div class="brand-text">
            <div class="brand-row">
              <span class="brand-title">JanaMen</span>
              <span class="janapost-tag">JanaPost HR</span>
            </div>
            <span class="brand-sub">{{ i18n.t('app.tagline') }}</span>
          </div>
        </a>
      </div>

      <div class="header-right">
        <!-- Quick Demo Switcher (Crucial for Hackathon evaluation!) -->
        <div class="demo-switcher">
          <span class="switcher-label">
            <app-icon name="user" [size]="14"></app-icon>
            {{ i18n.t('app.switch_role') }}:
          </span>
          <div class="role-buttons">
            <button
              *ngFor="let u of auth.demoUsers()"
              (click)="auth.loginAsDemo(u.id)"
              class="role-btn"
              [class.active]="auth.currentUser()?.id === u.id"
              [title]="u.position"
            >
              <span class="role-dot" [class]="u.role"></span>
              <span class="role-name">{{ i18n.t('role.' + u.role) }}</span>
            </button>
          </div>
        </div>

        <!-- Language Switcher (RU / KZ) -->
        <div class="lang-switch">
          <button
            (click)="i18n.setLanguage('ru')"
            class="lang-btn"
            [class.active]="i18n.currentLang() === 'ru'"
          >
            RU
          </button>
          <span class="lang-divider">|</span>
          <button
            (click)="i18n.setLanguage('kz')"
            class="lang-btn"
            [class.active]="i18n.currentLang() === 'kz'"
          >
            ҚЗ
          </button>
        </div>

        <!-- Notifications Bell -->
        <div class="notif-wrapper">
          <button (click)="toggleNotifDropdown()" class="icon-btn notif-btn" aria-label="Notifications">
            <app-icon name="bell" [size]="20"></app-icon>
            <span *ngIf="notif.unreadCount() > 0" class="notif-badge">
              {{ notif.unreadCount() }}
            </span>
          </button>

          <!-- Notifications Dropdown -->
          <div *ngIf="showNotifDropdown()" class="notif-dropdown card fade-in">
            <div class="notif-header">
              <h4>{{ i18n.t('notif.title') }}</h4>
              <button (click)="notif.markAllAsRead()" class="mark-read-btn">
                {{ i18n.t('notif.mark_all') }}
              </button>
            </div>
            <div class="notif-list">
              <div
                *ngFor="let item of notif.notifications()"
                class="notif-item"
                [class.unread]="!item.read"
                (click)="notif.markAsRead(item.id)"
              >
                <div class="notif-icon-col">
                  <span class="notif-dot" [class.read]="item.read"></span>
                </div>
                <div class="notif-content">
                  <p class="notif-text">
                    {{ i18n.currentLang() === 'kz' ? item.title_kz : item.title_ru }}
                  </p>
                  <span class="notif-time">{{ item.created_at | date:'shortTime' }}</span>
                </div>
              </div>
              <div *ngIf="notif.notifications().length === 0" class="notif-empty">
                {{ i18n.t('notif.empty') }}
              </div>
            </div>
          </div>
        </div>

        <!-- User Profile Chip -->
        <div class="user-chip" *ngIf="auth.currentUser() as user">
          <div class="user-avatar">
            {{ user.full_name.charAt(0) }}
          </div>
          <div class="user-meta">
            <span class="user-name">{{ user.full_name }}</span>
            <span class="user-role badge" [class.badge-green]="user.role === 'employee'" [class.badge-blue]="user.role === 'manager'" [class.badge-amber]="user.role === 'hr_admin'">
              {{ i18n.t('role.' + user.role) }}
            </span>
          </div>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .app-header {
      height: 72px;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-light);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 28px;
      position: sticky;
      top: 0;
      z-index: 50;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }

    .brand-container {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: inherit;
    }

    .brand-logo {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, var(--janapost-green) 0%, var(--janapost-dark) 100%);
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 10px rgba(0, 168, 89, 0.25);
    }

    .logo-accent {
      color: white;
      font-weight: 800;
      font-size: 1.4rem;
      font-family: 'Outfit', sans-serif;
    }

    .brand-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brand-title {
      font-size: 1.25rem;
      font-weight: 800;
      color: var(--text-main);
      line-height: 1.1;
    }

    .janapost-tag {
      font-size: 0.65rem;
      font-weight: 700;
      background: var(--janapost-light);
      color: var(--janapost-dark);
      padding: 2px 7px;
      border-radius: var(--radius-full);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .brand-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .demo-switcher {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--bg-surface-subtle);
      border: 1px solid var(--border-light);
      padding: 4px 10px;
      border-radius: var(--radius-full);
    }

    .switcher-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 4px;
      font-weight: 500;
    }

    .role-buttons {
      display: flex;
      gap: 4px;
    }

    .role-btn {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 5px 11px;
      border-radius: var(--radius-full);
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      &:hover {
        background: rgba(0,0,0,0.04);
        color: var(--text-main);
      }
      &.active {
        background: white;
        color: var(--text-main);
        box-shadow: 0 2px 6px rgba(0,0,0,0.06);
      }
    }

    .role-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      &.employee { background: var(--janapost-green); }
      &.manager { background: var(--accent-blue); }
      &.hr_admin { background: var(--accent-amber); }
    }

    .lang-switch {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.8rem;
      font-weight: 700;
      background: var(--bg-surface-subtle);
      padding: 4px 8px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border-light);
    }

    .lang-btn {
      color: var(--text-muted);
      padding: 2px 5px;
      border-radius: 4px;
      &.active {
        color: var(--janapost-dark);
        background: white;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      }
    }

    .lang-divider {
      color: var(--border-light);
    }

    .notif-wrapper {
      position: relative;
    }

    .icon-btn {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-full);
      border: 1px solid var(--border-light);
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      color: var(--text-main);
      &:hover {
        background: var(--bg-surface-subtle);
        border-color: var(--janapost-green);
        color: var(--janapost-dark);
      }
    }

    .notif-badge {
      position: absolute;
      top: -3px;
      right: -3px;
      background: var(--accent-rose);
      color: white;
      font-size: 0.65rem;
      font-weight: 700;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
    }

    .notif-dropdown {
      position: absolute;
      top: 50px;
      right: 0;
      width: 340px;
      padding: 16px;
      z-index: 100;
    }

    .notif-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-light);
      h4 { font-size: 0.95rem; font-weight: 700; }
    }

    .mark-read-btn {
      font-size: 0.75rem;
      color: var(--janapost-dark);
      font-weight: 600;
      &:hover { text-decoration: underline; }
    }

    .notif-list {
      max-height: 280px;
      overflow-y: auto;
      margin-top: 8px;
    }

    .notif-item {
      display: flex;
      gap: 10px;
      padding: 10px 8px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      &:hover { background: var(--bg-surface-subtle); }
      &.unread { background: var(--janapost-light); }
    }

    .notif-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--janapost-green);
      display: inline-block;
      margin-top: 6px;
      &.read { background: transparent; }
    }

    .notif-text {
      font-size: 0.82rem;
      color: var(--text-main);
      line-height: 1.35;
    }

    .notif-time {
      font-size: 0.7rem;
      color: var(--text-muted);
    }

    .notif-empty {
      padding: 20px;
      text-align: center;
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .user-chip {
      display: flex;
      align-items: center;
      gap: 10px;
      padding-left: 8px;
      border-left: 1px solid var(--border-light);
    }

    .user-avatar {
      width: 38px;
      height: 38px;
      border-radius: var(--radius-full);
      background: linear-gradient(135deg, #00A859 0%, #006835 100%);
      color: white;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
    }

    .user-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .user-name {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-main);
      max-width: 140px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `]
})
export class HeaderComponent {
  auth = inject(AuthService);
  i18n = inject(I18nService);
  notif = inject(NotificationService);

  showNotifDropdown = signal(false);

  toggleNotifDropdown() {
    this.showNotifDropdown.update(v => !v);
  }
}
