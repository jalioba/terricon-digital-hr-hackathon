import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ApiService } from '../../core/services/api.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="profile-page fade-in" *ngIf="auth.currentUser() as user">
      <!-- Profile Header Card -->
      <div class="profile-header card">
        <div class="avatar-large">
          {{ user.full_name.charAt(0) }}
        </div>
        <div class="profile-summary">
          <div class="name-row">
            <h1>{{ user.full_name }}</h1>
            <span class="badge" [class.badge-green]="user.role === 'employee'" [class.badge-blue]="user.role === 'manager'" [class.badge-amber]="user.role === 'hr_admin'">
              {{ i18n.t('role.' + user.role) }}
            </span>
          </div>
          <p class="summary-position">{{ user.position }} • <strong>JanaPost</strong></p>
          <div class="security-banner">
            <app-icon name="shield" [size]="16"></app-icon>
            <span>Официальные кадровые данные интегрированы из Mock-сервиса «1С:ЗУП ред. 3.1 КОРП» и доступны только для чтения (Read-Only).</span>
          </div>
        </div>
      </div>

      <!-- Details Grid -->
      <div class="profile-grid">
        <!-- Cadre Information Card -->
        <div class="card info-card">
          <div class="card-title-row">
            <h3>Кадровая информация (1С:ЗУП)</h3>
            <span class="lock-tag">
              <app-icon name="shield" [size]="12"></app-icon>
              Read-Only
            </span>
          </div>

          <div class="fields-list">
            <div class="field-item">
              <span class="field-label">Компания</span>
              <span class="field-value">АО «JanaPost Казахстан»</span>
            </div>
            <div class="field-item">
              <span class="field-label">Подразделение</span>
              <span class="field-value highlight">{{ getDeptName(user.department_id) }}</span>
            </div>
            <div class="field-item">
              <span class="field-label">Должность</span>
              <span class="field-value">{{ user.position }}</span>
            </div>
            <div class="field-item">
              <span class="field-label">Дата приёма на работу</span>
              <span class="field-value">{{ user.hired_at | date:'dd MMMM yyyy' }}</span>
            </div>
            <div class="field-item">
              <span class="field-label">Непосредственный руководитель</span>
              <span class="field-value">{{ getManagerName(user.role) }}</span>
            </div>
            <div class="field-item">
              <span class="field-label">Корпоративный E-mail</span>
              <span class="field-value code">{{ user.email }}</span>
            </div>
          </div>
        </div>

        <!-- Vacation Balance & Policy Card -->
        <div class="card balance-card">
          <h3>Баланс дней отпуска</h3>
          <p class="balance-desc">Ежегодный трудовой отпуск согласно Трудовому кодексу РК</p>

          <div class="balance-gauge">
            <div class="gauge-ring">
              <span class="gauge-val">{{ user.vacation_days_left }}</span>
              <span class="gauge-sub">дней осталось</span>
            </div>
            <div class="gauge-details">
              <div class="metric-row">
                <span>Положено в год:</span>
                <strong>24 дня</strong>
              </div>
              <div class="metric-row">
                <span>Использовано:</span>
                <strong>{{ 24 - user.vacation_days_left }} дней</strong>
              </div>
              <div class="metric-row highlight">
                <span>Доступно к оформлению:</span>
                <strong class="green-text">{{ user.vacation_days_left }} дней</strong>
              </div>
            </div>
          </div>

          <!-- Language Preferences -->
          <div class="pref-box">
            <h4>Язык системы / Жүйе тілі</h4>
            <div class="pref-lang-buttons">
              <button
                (click)="setLang('ru')"
                class="pref-btn"
                [class.active]="i18n.currentLang() === 'ru'"
              >
                Русский (RU)
              </button>
              <button
                (click)="setLang('kz')"
                class="pref-btn"
                [class.active]="i18n.currentLang() === 'kz'"
              >
                Қазақша (KZ)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .profile-page {
      padding: 28px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      max-width: 1100px;
      margin: 0 auto;
    }

    .profile-header {
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 28px;
    }

    .avatar-large {
      width: 72px;
      height: 72px;
      border-radius: var(--radius-full);
      background: linear-gradient(135deg, var(--janapost-green) 0%, var(--janapost-dark) 100%);
      color: white;
      font-size: 2rem;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 14px rgba(0, 168, 89, 0.3);
      flex-shrink: 0;
    }

    .profile-summary {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .name-row {
      display: flex;
      align-items: center;
      gap: 12px;
      h1 { font-size: 1.6rem; font-weight: 800; }
    }

    .summary-position {
      color: var(--text-muted);
      font-size: 0.95rem;
    }

    .security-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--janapost-light);
      color: var(--janapost-dark);
      padding: 8px 12px;
      border-radius: var(--radius-md);
      font-size: 0.78rem;
      font-weight: 600;
      margin-top: 6px;
    }

    .profile-grid {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 24px;
    }

    .card-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      h3 { font-size: 1.1rem; font-weight: 800; }
    }

    .lock-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.7rem;
      font-weight: 700;
      background: #f1f5f9;
      color: var(--text-muted);
      padding: 3px 8px;
      border-radius: var(--radius-full);
    }

    .fields-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .field-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-light);
      &:last-child { border-bottom: none; }
    }

    .field-label {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .field-value {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-main);
      &.highlight { color: var(--janapost-dark); font-weight: 700; }
      &.code { font-family: monospace; font-size: 0.85rem; }
    }

    .balance-card {
      h3 { font-size: 1.1rem; font-weight: 800; margin-bottom: 4px; }
    }

    .balance-desc {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-bottom: 20px;
    }

    .balance-gauge {
      display: flex;
      align-items: center;
      gap: 24px;
      background: var(--bg-surface-subtle);
      padding: 18px;
      border-radius: var(--radius-md);
      margin-bottom: 24px;
    }

    .gauge-ring {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      border: 4px solid var(--janapost-green);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: white;
    }

    .gauge-val {
      font-size: 1.6rem;
      font-weight: 800;
      color: var(--janapost-dark);
      line-height: 1;
    }

    .gauge-sub {
      font-size: 0.62rem;
      color: var(--text-muted);
      text-transform: uppercase;
      font-weight: 600;
    }

    .gauge-details {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
    }

    .metric-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.82rem;
      color: var(--text-muted);
      &.highlight { font-weight: 700; color: var(--text-main); }
    }

    .green-text {
      color: var(--janapost-dark);
      font-weight: 800;
    }

    .pref-box {
      border-top: 1px solid var(--border-light);
      padding-top: 16px;
      h4 { font-size: 0.9rem; font-weight: 700; margin-bottom: 12px; }
    }

    .pref-lang-buttons {
      display: flex;
      gap: 10px;
    }

    .pref-btn {
      flex: 1;
      padding: 8px;
      border: 1px solid var(--border-light);
      border-radius: var(--radius-md);
      font-size: 0.82rem;
      font-weight: 600;
      background: white;
      &:hover { border-color: var(--janapost-green); }
      &.active {
        background: var(--janapost-green);
        color: white;
        border-color: var(--janapost-green);
      }
    }

    @media (max-width: 800px) {
      .profile-grid { grid-template-columns: 1fr; }
      .profile-header { flex-direction: column; align-items: flex-start; }
    }
  `]
})
export class ProfileComponent implements OnInit {
  auth = inject(AuthService);
  i18n = inject(I18nService);
  api = inject(ApiService);

  ngOnInit() {
    this.api.get<any>('/me').subscribe({
      next: (res) => {
        if (res && res.profile) {
          this.auth.currentUser.set(res.profile);
        }
      },
      error: () => {}
    });
  }

  setLang(lang: 'ru' | 'kz') {
    this.i18n.setLanguage(lang);
    this.api.put('/me/locale', { locale: lang }).subscribe({ error: () => {} });
  }

  getDeptName(id?: number): string {
    switch (id) {
      case 1: return 'Отдел поставок заказов';
      case 2: return 'Отдел логистики и склада';
      case 3: return 'Отдел IT и поддержки';
      default: return 'JanaPost';
    }
  }

  getManagerName(role: string): string {
    if (role === 'employee') return 'Ерлан Нұрланов (Руководитель отдела)';
    if (role === 'manager') return 'Айгерим Сатпаева (HR-директор)';
    return 'Совет директоров JanaPost';
  }
}
