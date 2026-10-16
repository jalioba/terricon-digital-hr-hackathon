import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, IconComponent],
  template: `
    <aside class="app-sidebar">
      <nav class="nav-menu">
        <a routerLink="/dashboard" routerLinkActive="active" class="nav-item">
          <app-icon name="home" [size]="20"></app-icon>
          <span>{{ i18n.t('nav.dashboard') }}</span>
        </a>

        <a routerLink="/profile" routerLinkActive="active" class="nav-item">
          <app-icon name="user" [size]="20"></app-icon>
          <span>{{ i18n.t('nav.profile') }}</span>
        </a>

        <a routerLink="/requests" routerLinkActive="active" class="nav-item">
          <app-icon name="file-text" [size]="20"></app-icon>
          <span>{{ i18n.t('nav.requests') }}</span>
        </a>

        <!-- Manager Approvals (visible to Manager and HR Admin) -->
        <a
          *ngIf="auth.isManager() || auth.isHrAdmin()"
          routerLink="/approvals"
          routerLinkActive="active"
          class="nav-item nav-highlight"
        >
          <app-icon name="check-circle" [size]="20"></app-icon>
          <span>{{ i18n.t('nav.approvals') }}</span>
          <span class="nav-badge" *ngIf="auth.isManager()">2</span>
        </a>

        <a routerLink="/academy" routerLinkActive="active" class="nav-item">
          <app-icon name="book-open" [size]="20"></app-icon>
          <span>{{ i18n.t('nav.academy') }}</span>
        </a>

        <a routerLink="/ai" routerLinkActive="active" class="nav-item ai-item">
          <app-icon name="bot" [size]="20"></app-icon>
          <span>{{ i18n.t('nav.ai') }}</span>
          <span class="ai-pill">RAG</span>
        </a>

        <!-- HR Executive Analytics (visible only to HR Admin) -->
        <a
          *ngIf="auth.isHrAdmin()"
          routerLink="/admin"
          routerLinkActive="active"
          class="nav-item admin-item"
        >
          <app-icon name="bar-chart" [size]="20"></app-icon>
          <span>{{ i18n.t('nav.admin') }}</span>
        </a>
      </nav>

      <!-- Sidebar Footer / Quick Department Indicator -->
      <div class="sidebar-footer card" *ngIf="auth.currentUser() as user">
        <div class="dept-indicator">
          <span class="dept-dot"></span>
          <div class="dept-meta">
            <span class="dept-label">Подразделение:</span>
            <span class="dept-title">
              {{ user.department_id === 1 ? 'Отдел поставок заказов' : (user.department_id === 2 ? 'Отдел логистики и склада' : 'Отдел IT и поддержки') }}
            </span>
          </div>
        </div>
      </div>
    </aside>
  `,
  styles: [`
    .app-sidebar {
      width: 260px;
      background: var(--bg-surface);
      border-right: 1px solid var(--border-light);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 24px 16px;
      height: calc(100vh - 72px);
      position: sticky;
      top: 72px;
    }

    .nav-menu {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 16px;
      border-radius: var(--radius-md);
      color: var(--text-muted);
      text-decoration: none;
      font-weight: 600;
      font-size: 0.92rem;
      transition: all 0.15s ease;
      position: relative;

      &:hover {
        background: var(--bg-surface-subtle);
        color: var(--janapost-dark);
        transform: translateX(2px);
      }

      &.active {
        background: var(--janapost-light);
        color: var(--janapost-dark);
        font-weight: 700;
        &::before {
          content: '';
          position: absolute;
          left: 0;
          top: 6px;
          bottom: 6px;
          width: 4px;
          background: var(--janapost-green);
          border-radius: 0 4px 4px 0;
        }
      }
    }

    .nav-badge {
      margin-left: auto;
      background: var(--janapost-green);
      color: white;
      font-size: 0.7rem;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: var(--radius-full);
    }

    .ai-item {
      background: linear-gradient(135deg, rgba(0, 168, 89, 0.05) 0%, rgba(2, 132, 199, 0.05) 100%);
      border: 1px dashed rgba(0, 168, 89, 0.25);
      margin-top: 6px;
    }

    .ai-pill {
      margin-left: auto;
      font-size: 0.65rem;
      font-weight: 800;
      background: linear-gradient(135deg, #00A859 0%, #0284C7 100%);
      color: white;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .admin-item {
      margin-top: 10px;
      border-top: 1px solid var(--border-light);
      padding-top: 14px;
      border-radius: 0;
    }

    .sidebar-footer {
      padding: 12px 14px;
      background: var(--bg-surface-subtle);
      border: 1px solid var(--border-light);
      margin-top: auto;
    }

    .dept-indicator {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }

    .dept-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--janapost-green);
      margin-top: 5px;
    }

    .dept-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .dept-label {
      font-size: 0.68rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .dept-title {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--text-main);
      line-height: 1.25;
    }
  `]
})
export class SidebarComponent {
  auth = inject(AuthService);
  i18n = inject(I18nService);
}
