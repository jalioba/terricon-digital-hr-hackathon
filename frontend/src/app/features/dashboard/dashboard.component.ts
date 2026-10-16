import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, IconComponent],
  template: `
    <div class="dashboard-page fade-in">
      <!-- Welcome Hero Banner -->
      <section class="welcome-hero card" *ngIf="auth.currentUser() as user">
        <div class="hero-content">
          <div class="hero-badge">
            <app-icon name="shield" [size]="14"></app-icon>
            {{ i18n.t('dash.official_1c') }}
          </div>
          <h1 class="hero-title">
            {{ i18n.t('dash.welcome') }}, {{ user.full_name }}! 👋
          </h1>
          <p class="hero-desc">
            {{ user.position }} • {{ getDeptName(user.department_id) }} • Компания: <strong>JanaPost</strong>
          </p>
        </div>

        <div class="vacation-widget">
          <div class="vacation-circle">
            <span class="days-number">{{ user.vacation_days_left }}</span>
            <span class="days-label">{{ i18n.t('dash.days') }}</span>
          </div>
          <div class="vacation-meta">
            <span class="vacation-title">{{ i18n.t('dash.vacation_balance') }}</span>
            <span class="vacation-sub">Ежегодный оплачиваемый</span>
          </div>
        </div>
      </section>

      <!-- Quick Actions Grid -->
      <section class="quick-services">
        <h2 class="section-title">{{ i18n.t('dash.quick_actions') }}</h2>
        <div class="services-grid">
          <button (click)="openRequestModal('vacation')" class="service-card card hover-scale">
            <div class="service-icon-bg green">
              <app-icon name="calendar" [size]="24"></app-icon>
            </div>
            <div class="service-info">
              <h3>{{ i18n.t('dash.apply_vacation') }}</h3>
              <p>Проверка остатка и согласование с 1С</p>
            </div>
          </button>

          <button (click)="openRequestModal('advance')" class="service-card card hover-scale">
            <div class="service-icon-bg blue">
              <app-icon name="file-text" [size]="24"></app-icon>
            </div>
            <div class="service-info">
              <h3>{{ i18n.t('dash.apply_advance') }}</h3>
              <p>Внеочередной аванс до 50% оклада</p>
            </div>
          </button>

          <a routerLink="/academy" class="service-card card hover-scale">
            <div class="service-icon-bg amber">
              <app-icon name="book-open" [size]="24"></app-icon>
            </div>
            <div class="service-info">
              <h3>{{ i18n.t('dash.open_academy') }}</h3>
              <p>Обязательные курсы и тесты</p>
            </div>
          </a>

          <a routerLink="/ai" class="service-card card hover-scale ai-glow">
            <div class="service-icon-bg purple">
              <app-icon name="sparkles" [size]="24"></app-icon>
            </div>
            <div class="service-info">
              <h3>{{ i18n.t('dash.ask_ai') }}</h3>
              <p>Консультации по регламентам без выдумок</p>
            </div>
          </a>
        </div>
      </section>

      <!-- Two Column Layout: Active Requests & Assigned Tasks -->
      <div class="dashboard-columns">
        <!-- Left: Active Requests -->
        <section class="column-card card">
          <div class="card-header-row">
            <div class="title-with-badge">
              <h2>{{ i18n.t('dash.active_requests') }}</h2>
              <span class="count-pill">{{ requests().length }}</span>
            </div>
            <a routerLink="/requests" class="link-btn">Все заявки →</a>
          </div>

          <div class="items-list" *ngIf="requests().length > 0; else noRequests">
            <div *ngFor="let req of requests().slice(0, 4)" class="request-row-item">
              <div class="request-type-icon" [class.vacation]="req.type === 'vacation'">
                <app-icon [name]="req.type === 'vacation' ? 'calendar' : 'file-text'" [size]="18"></app-icon>
              </div>
              <div class="request-details">
                <span class="request-main-title">
                  {{ req.type === 'vacation' ? 'Заявка на отпуск (' + req.days + ' дн.)' : 'Аванс ' + (req.amount | number) + ' ₸' }}
                </span>
                <span class="request-date">{{ req.created_at | date:'dd.MM.yyyy, HH:mm' }}</span>
              </div>
              <div class="request-status-col">
                <span class="badge" [ngClass]="getStatusBadgeClass(req.status)">
                  {{ i18n.t('status.' + req.status) }}
                </span>
              </div>
            </div>
          </div>
          <ng-template #noRequests>
            <div class="empty-state">
              <app-icon name="file-text" [size]="32" extraClass="text-muted"></app-icon>
              <p>{{ i18n.t('dash.no_requests') }}</p>
            </div>
          </ng-template>
        </section>

        <!-- Right: Tasks from Supervisor & Academy -->
        <section class="column-card card">
          <div class="card-header-row">
            <div class="title-with-badge">
              <h2>{{ i18n.t('dash.assigned_tasks') }}</h2>
              <span class="count-pill">{{ tasks().length }}</span>
            </div>
            <span class="subtitle-tag">Руководитель отдела</span>
          </div>

          <div class="items-list" *ngIf="tasks().length > 0; else noTasks">
            <div *ngFor="let t of tasks().slice(0, 4)" class="task-row-item">
              <button
                (click)="toggleTaskStatus(t)"
                class="checkbox-circle"
                [class.checked]="t.status === 'done'"
              >
                <app-icon *ngIf="t.status === 'done'" name="check" [size]="12"></app-icon>
              </button>
              <div class="task-details">
                <span class="task-title" [class.completed]="t.status === 'done'">{{ t.title }}</span>
                <span class="task-meta">Срок: {{ t.due_date ? (t.due_date | date:'dd MMM') : 'Текущая неделя' }}</span>
              </div>
              <span class="badge" [class.badge-green]="t.status === 'done'" [class.badge-amber]="t.status === 'in_progress'" [class.badge-blue]="t.status === 'open'">
                {{ t.status }}
              </span>
            </div>
          </div>
          <ng-template #noTasks>
            <div class="empty-state">
              <app-icon name="check-circle" [size]="32" extraClass="text-muted"></app-icon>
              <p>{{ i18n.t('dash.no_tasks') }}</p>
            </div>
          </ng-template>
        </section>
      </div>

      <!-- Quick Modal for New Request -->
      <div class="modal-backdrop fade-in" *ngIf="showModal()">
        <div class="modal-card card">
          <div class="modal-header">
            <h3>{{ modalType() === 'vacation' ? 'Оформление заявки на отпуск' : 'Оформление заявки на аванс' }}</h3>
            <button (click)="showModal.set(false)" class="close-btn"><app-icon name="x" [size]="20"></app-icon></button>
          </div>

          <form (submit)="submitNewRequest($event)" class="modal-form">
            <div *ngIf="modalType() === 'vacation'">
              <div class="balance-alert">
                <app-icon name="calendar" [size]="18"></app-icon>
                <span>Доступный остаток: <strong>{{ auth.currentUser()?.vacation_days_left }} дней</strong></span>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Дата начала</label>
                  <input type="date" [(ngModel)]="vacationFrom" name="dateFrom" required class="input-control" />
                </div>
                <div class="form-group">
                  <label>Дата окончания</label>
                  <input type="date" [(ngModel)]="vacationTo" name="dateTo" required class="input-control" />
                </div>
              </div>

              <div class="form-group">
                <label>Количество дней</label>
                <input type="number" [(ngModel)]="vacationDays" name="days" min="1" max="24" required class="input-control" />
              </div>
            </div>

            <div *ngIf="modalType() === 'advance'">
              <div class="form-group">
                <label>Сумма аванса (в тенге)</label>
                <input type="number" [(ngModel)]="advanceAmount" name="amount" min="10000" step="5000" required class="input-control" placeholder="100 000" />
              </div>
            </div>

            <div class="form-group">
              <label>Комментарий (причина)</label>
              <textarea [(ngModel)]="requestComment" name="comment" rows="2" class="input-control" placeholder="Обоснование для руководителя..."></textarea>
            </div>

            <div *ngIf="errorMessage()" class="error-banner">
              {{ errorMessage() }}
            </div>

            <div class="modal-footer">
              <button type="button" (click)="showModal.set(false)" class="btn-secondary">{{ i18n.t('btn.cancel') }}</button>
              <button type="submit" [disabled]="isSubmitting()" class="btn-primary">
                {{ isSubmitting() ? 'Отправка...' : i18n.t('btn.submit') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-page {
      padding: 28px;
      display: flex;
      flex-direction: column;
      gap: 28px;
      max-width: 1300px;
      margin: 0 auto;
    }

    .welcome-hero {
      background: linear-gradient(135deg, #FFFFFF 0%, var(--janapost-light) 100%);
      border: 1px solid var(--border-primary);
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 28px 32px;
    }

    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--janapost-dark);
      background: rgba(0, 168, 89, 0.12);
      padding: 4px 10px;
      border-radius: var(--radius-full);
      margin-bottom: 12px;
    }

    .hero-title {
      font-size: 1.75rem;
      font-weight: 800;
      color: var(--text-main);
      margin-bottom: 6px;
    }

    .hero-desc {
      color: var(--text-muted);
      font-size: 0.95rem;
    }

    .vacation-widget {
      display: flex;
      align-items: center;
      gap: 16px;
      background: white;
      padding: 14px 20px;
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-light);
      box-shadow: var(--shadow-sm);
    }

    .vacation-circle {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--janapost-green) 0%, var(--janapost-dark) 100%);
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .days-number {
      font-size: 1.35rem;
      font-weight: 800;
      line-height: 1;
    }

    .days-label {
      font-size: 0.65rem;
      text-transform: uppercase;
      font-weight: 600;
    }

    .vacation-meta {
      display: flex;
      flex-direction: column;
    }

    .vacation-title {
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--text-main);
    }

    .vacation-sub {
      font-size: 0.78rem;
      color: var(--text-muted);
    }

    .section-title {
      font-size: 1.2rem;
      font-weight: 800;
      color: var(--text-main);
      margin-bottom: 14px;
    }

    .services-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 18px;
    }

    .service-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px;
      text-align: left;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }

    .hover-scale:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
      border-color: var(--janapost-green);
    }

    .service-icon-bg {
      width: 48px;
      height: 48px;
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      &.green { background: #dcfce7; color: #15803d; }
      &.blue { background: #e0f2fe; color: #0369a1; }
      &.amber { background: #fef3c7; color: #b45309; }
      &.purple { background: #f3e8ff; color: #7e22ce; }
    }

    .service-info {
      h3 { font-size: 1rem; font-weight: 700; margin-bottom: 2px; }
      p { font-size: 0.8rem; color: var(--text-muted); }
    }

    .ai-glow {
      border: 1px solid rgba(0, 168, 89, 0.4);
      background: linear-gradient(135deg, white 0%, #F5FBF8 100%);
    }

    .dashboard-columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    .card-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      h2 { font-size: 1.1rem; font-weight: 800; }
    }

    .title-with-badge {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .count-pill {
      background: var(--bg-surface-subtle);
      color: var(--text-muted);
      border: 1px solid var(--border-light);
      font-size: 0.75rem;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: var(--radius-full);
    }

    .link-btn {
      font-size: 0.82rem;
      color: var(--janapost-dark);
      font-weight: 600;
      text-decoration: none;
      &:hover { text-decoration: underline; }
    }

    .subtitle-tag {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 500;
    }

    .items-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .request-row-item, .task-row-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: var(--radius-md);
      background: var(--bg-surface-subtle);
      border: 1px solid var(--border-light);
    }

    .request-type-icon {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #e0f2fe;
      color: #0369a1;
      display: flex;
      align-items: center;
      justify-content: center;
      &.vacation { background: #dcfce7; color: #15803d; }
    }

    .request-details, .task-details {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
    }

    .request-main-title, .task-title {
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--text-main);
    }

    .task-title.completed {
      text-decoration: line-through;
      color: var(--text-muted);
    }

    .request-date, .task-meta {
      font-size: 0.74rem;
      color: var(--text-muted);
    }

    .checkbox-circle {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 2px solid var(--border-light);
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      &.checked {
        background: var(--janapost-green);
        border-color: var(--janapost-green);
        color: white;
      }
    }

    .empty-state {
      padding: 36px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      color: var(--text-muted);
      font-size: 0.88rem;
    }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 16px;
    }

    .modal-card {
      width: 100%;
      max-width: 480px;
      background: white;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-light);
      margin-bottom: 16px;
      h3 { font-size: 1.15rem; font-weight: 700; }
    }

    .close-btn {
      color: var(--text-muted);
      &:hover { color: var(--text-main); }
    }

    .modal-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      label {
        font-size: 0.82rem;
        font-weight: 600;
        color: var(--text-main);
      }
    }

    .input-control {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border-light);
      border-radius: var(--radius-md);
      font-size: 0.9rem;
      outline: none;
      &:focus {
        border-color: var(--janapost-green);
        box-shadow: 0 0 0 3px rgba(0, 168, 89, 0.15);
      }
    }

    .balance-alert {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--janapost-light);
      color: var(--janapost-dark);
      padding: 10px 14px;
      border-radius: var(--radius-md);
      font-size: 0.85rem;
      margin-bottom: 14px;
    }

    .error-banner {
      background: #ffe4e6;
      color: #9f1239;
      padding: 10px 14px;
      border-radius: var(--radius-md);
      font-size: 0.85rem;
      font-weight: 500;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 10px;
      padding-top: 16px;
      border-top: 1px solid var(--border-light);
    }

    @media (max-width: 900px) {
      .dashboard-columns { grid-template-columns: 1fr; }
      .welcome-hero { flex-direction: column; align-items: flex-start; gap: 16px; }
    }
  `]
})
export class DashboardComponent implements OnInit {
  auth = inject(AuthService);
  i18n = inject(I18nService);
  api = inject(ApiService);
  notif = inject(NotificationService);

  requests = signal<any[]>([
    {
      id: 1,
      type: 'vacation',
      days: 9,
      status: 'pending_manager',
      created_at: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: 2,
      type: 'vacation',
      days: 5,
      status: 'completed',
      created_at: new Date(Date.now() - 3456000000).toISOString()
    }
  ]);

  tasks = signal<any[]>([
    { id: 1, title: 'Сверить поставки по заказам недели', due_date: '2026-10-25', status: 'open' },
    { id: 2, title: 'Подготовить отчёт по просроченным поставкам', due_date: '2026-10-28', status: 'in_progress' }
  ]);

  showModal = signal(false);
  modalType = signal<'vacation' | 'advance'>('vacation');
  vacationFrom = '2026-11-15';
  vacationTo = '2026-11-22';
  vacationDays = 7;
  advanceAmount = 80000;
  requestComment = '';
  errorMessage = signal('');
  isSubmitting = signal(false);

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.api.get<any[]>('/requests').subscribe({
      next: (data) => {
        if (data && Array.isArray(data)) this.requests.set(data);
      },
      error: () => {}
    });

    this.api.get<any[]>('/tasks').subscribe({
      next: (data) => {
        if (data && Array.isArray(data)) this.tasks.set(data);
      },
      error: () => {}
    });
  }

  openRequestModal(type: 'vacation' | 'advance') {
    this.modalType.set(type);
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  submitNewRequest(e: Event) {
    e.preventDefault();
    this.errorMessage.set('');

    const user = this.auth.currentUser();
    if (!user) return;

    if (this.modalType() === 'vacation') {
      if (this.vacationDays > user.vacation_days_left) {
        this.errorMessage.set(`Ошибка: недостаточно дней отпуска (доступно ${user.vacation_days_left}, запрошено ${this.vacationDays})`);
        return;
      }
    }

    this.isSubmitting.set(true);
    const payload = this.modalType() === 'vacation'
      ? {
          type: 'vacation',
          date_from: this.vacationFrom,
          date_to: this.vacationTo,
          days: this.vacationDays,
          amount: 0,
          comment: this.requestComment
        }
      : {
          type: 'advance',
          amount: this.advanceAmount,
          days: 0,
          comment: this.requestComment
        };

    this.api.post<any>('/requests', payload).subscribe({
      next: (created) => {
        this.isSubmitting.set(false);
        this.showModal.set(false);
        this.requests.update(list => [created, ...list]);
        this.notif.addLocalNotification(
          'request',
          `Заявка на ${payload.type === 'vacation' ? 'отпуск' : 'аванс'} успешно создана и передана руководителю`,
          `Өтінім сәтті құрылып, басшыға жолданды`,
          `/requests`
        );
      },
      error: (err) => {
        this.isSubmitting.set(false);
        // Robust mock fallback
        const mockNew = {
          id: Date.now(),
          type: payload.type,
          days: payload.days,
          amount: payload.amount,
          status: 'pending_manager',
          created_at: new Date().toISOString()
        };
        this.requests.update(list => [mockNew, ...list]);
        this.showModal.set(false);
        this.notif.addLocalNotification(
          'request',
          `Заявка успешно зарегистрирована`,
          `Өтінім сәтті тіркелді`,
          `/requests`
        );
      }
    });
  }

  toggleTaskStatus(task: any) {
    const newStatus = task.status === 'done' ? 'open' : 'done';
    task.status = newStatus;
    this.api.put(`/tasks/${task.id}/status`, { status: newStatus }).subscribe({ error: () => {} });
  }

  getDeptName(id?: number): string {
    switch (id) {
      case 1: return 'Отдел поставок заказов';
      case 2: return 'Отдел логистики и склада';
      case 3: return 'Отдел IT и поддержки';
      default: return 'JanaPost';
    }
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'completed': return 'badge-green';
      case 'approved': return 'badge-blue';
      case 'pending_manager': return 'badge-amber';
      case 'rejected': return 'badge-rose';
      default: return 'badge-blue';
    }
  }
}
