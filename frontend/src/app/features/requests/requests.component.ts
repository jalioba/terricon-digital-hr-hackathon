import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-requests',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="requests-page fade-in">
      <!-- Header Row -->
      <div class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('req.title') }}</h1>
          <p class="page-subtitle">Единое окно согласования отпусков и авансов через Documentolog и 1С:ЗУП</p>
        </div>
        <button (click)="openCreateModal()" class="btn-primary">
          <app-icon name="plus" [size]="18"></app-icon>
          {{ i18n.t('req.create_btn') }}
        </button>
      </div>

      <!-- Filters & Stats Bar -->
      <div class="filters-bar card">
        <div class="filter-pills">
          <button (click)="filter.set('all')" class="pill-btn" [class.active]="filter() === 'all'">Все заявки ({{ requests().length }})</button>
          <button (click)="filter.set('vacation')" class="pill-btn" [class.active]="filter() === 'vacation'">Отпуска</button>
          <button (click)="filter.set('advance')" class="pill-btn" [class.active]="filter() === 'advance'">Авансы</button>
        </div>

        <div class="balance-tag" *ngIf="auth.currentUser() as user">
          <span>Остаток отпуска:</span>
          <strong>{{ user.vacation_days_left }} дней</strong>
        </div>
      </div>

      <!-- Requests Table / Cards -->
      <div class="requests-list">
        <div *ngFor="let req of filteredRequests()" class="request-card card fade-in" (click)="openDetail(req)">
          <div class="req-left">
            <div class="req-type-avatar" [class.vacation]="req.type === 'vacation'">
              <app-icon [name]="req.type === 'vacation' ? 'calendar' : 'file-text'" [size]="20"></app-icon>
            </div>
            <div class="req-main-info">
              <div class="req-title-row">
                <span class="req-id">#{{ req.id }}</span>
                <h3 class="req-type-title">
                  {{ req.type === 'vacation' ? 'Ежегодный оплачиваемый отпуск' : 'Внеочередной аванс' }}
                </h3>
              </div>
              <p class="req-details-line">
                <span *ngIf="req.type === 'vacation'">
                  {{ req.date_from | date:'dd.MM.yyyy' }} — {{ req.date_to | date:'dd.MM.yyyy' }} ({{ req.days }} дн.)
                </span>
                <span *ngIf="req.type === 'advance'">
                  Сумма: <strong>{{ req.amount | number }} ₸</strong>
                </span>
                <span class="dot-separator">•</span>
                <span>Подано: {{ req.created_at | date:'dd.MM.yyyy, HH:mm' }}</span>
              </p>
              <p class="req-comment" *ngIf="req.comment">«{{ req.comment }}»</p>
            </div>
          </div>

          <div class="req-right">
            <span class="badge" [ngClass]="getStatusBadgeClass(req.status)">
              {{ i18n.t('status.' + req.status) }}
            </span>
            <span class="open-details-hint">История маршрута →</span>
          </div>
        </div>

        <div *ngIf="filteredRequests().length === 0" class="card empty-card">
          <app-icon name="file-text" [size]="40" extraClass="text-muted"></app-icon>
          <p>В этом разделе пока нет заявок</p>
        </div>
      </div>

      <!-- Detail Modal with Full Timeline -->
      <div class="modal-backdrop fade-in" *ngIf="selectedRequest() as req">
        <div class="modal-card card detail-modal">
          <div class="modal-header">
            <div>
              <span class="req-id">Заявка #{{ req.id }}</span>
              <h3>{{ req.type === 'vacation' ? 'Заявка на отпуск (' + req.days + ' дн.)' : 'Заявка на аванс (' + (req.amount | number) + ' ₸)' }}</h3>
            </div>
            <button (click)="selectedRequest.set(null)" class="close-btn"><app-icon name="x" [size]="20"></app-icon></button>
          </div>

          <div class="detail-body">
            <!-- Timeline Route -->
            <h4 class="timeline-heading">{{ i18n.t('req.timeline') }}</h4>
            <div class="timeline-flow">
              <!-- Step 1: Created -->
              <div class="timeline-step done">
                <div class="step-icon"><app-icon name="check" [size]="14"></app-icon></div>
                <div class="step-info">
                  <span class="step-title">Заявка создана сотрудником</span>
                  <span class="step-sub">Проверено наличие остатка дней в 1С:ЗУП</span>
                </div>
              </div>

              <!-- Step 2: Manager Approval -->
              <div class="timeline-step" [class.done]="req.status !== 'pending_manager' && req.status !== 'created'" [class.active]="req.status === 'pending_manager'">
                <div class="step-icon">
                  <app-icon [name]="req.status === 'pending_manager' ? 'clock' : (req.status === 'rejected' ? 'x' : 'check')" [size]="14"></app-icon>
                </div>
                <div class="step-info">
                  <span class="step-title">Согласование непосредственным руководителем</span>
                  <span class="step-sub">{{ req.status === 'pending_manager' ? 'Ожидает решения руководителя отдела' : (req.status === 'rejected' ? 'Отклонено' : 'Одобрено руководителем') }}</span>
                </div>
              </div>

              <!-- Step 3: Documentolog -->
              <div class="timeline-step" [class.done]="req.status === 'completed'" [class.active]="req.status === 'approved' || req.status === 'sent_documentolog'">
                <div class="step-icon">
                  <app-icon [name]="req.status === 'completed' ? 'check' : 'clock'" [size]="14"></app-icon>
                </div>
                <div class="step-info">
                  <span class="step-title">Регистрация в СЭД Documentolog</span>
                  <span class="step-sub">Маршрут кадрового документооборота и присвоение входящего номера</span>
                </div>
              </div>

              <!-- Step 4: 1C:ZUP Completed -->
              <div class="timeline-step" [class.done]="req.status === 'completed'">
                <div class="step-icon">
                  <app-icon [name]="req.status === 'completed' ? 'check' : 'clock'" [size]="14"></app-icon>
                </div>
                <div class="step-info">
                  <span class="step-title">Проведение кадрового приказа в 1С:ЗУП</span>
                  <span class="step-sub">Финальная проводка и автоматический перерасчёт баланса отпусков</span>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button (click)="selectedRequest.set(null)" class="btn-secondary">{{ i18n.t('btn.close') }}</button>
          </div>
        </div>
      </div>

      <!-- Create Request Modal -->
      <div class="modal-backdrop fade-in" *ngIf="showCreateModal()">
        <div class="modal-card card">
          <div class="modal-header">
            <h3>Подача кадровой заявки</h3>
            <button (click)="showCreateModal.set(false)" class="close-btn"><app-icon name="x" [size]="20"></app-icon></button>
          </div>

          <form (submit)="createRequest($event)" class="modal-form">
            <div class="form-group">
              <label>Тип заявки</label>
              <div class="type-selector">
                <button
                  type="button"
                  (click)="newType.set('vacation')"
                  class="type-btn"
                  [class.active]="newType() === 'vacation'"
                >
                  <app-icon name="calendar" [size]="18"></app-icon>
                  Оплачиваемый отпуск
                </button>
                <button
                  type="button"
                  (click)="newType.set('advance')"
                  class="type-btn"
                  [class.active]="newType() === 'advance'"
                >
                  <app-icon name="file-text" [size]="18"></app-icon>
                  Внеочередной аванс
                </button>
              </div>
            </div>

            <div *ngIf="newType() === 'vacation'">
              <div class="balance-alert">
                <app-icon name="shield" [size]="16"></app-icon>
                <span>Доступный остаток по данным 1С:ЗУП: <strong>{{ auth.currentUser()?.vacation_days_left }} дней</strong></span>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Дата начала</label>
                  <input type="date" [(ngModel)]="newDateFrom" name="nFrom" required class="input-control" />
                </div>
                <div class="form-group">
                  <label>Дата окончания</label>
                  <input type="date" [(ngModel)]="newDateTo" name="nTo" required class="input-control" />
                </div>
              </div>
              <div class="form-group">
                <label>Количество календарных дней</label>
                <input type="number" [(ngModel)]="newDays" name="nDays" min="1" [max]="auth.currentUser()?.vacation_days_left || 24" required class="input-control" />
              </div>
            </div>

            <div *ngIf="newType() === 'advance'">
              <div class="form-group">
                <label>Сумма аванса (в тенге)</label>
                <input type="number" [(ngModel)]="newAmount" name="nAmount" min="10000" step="5000" required class="input-control" placeholder="100 000" />
              </div>
            </div>

            <div class="form-group">
              <label>Обоснование для руководителя</label>
              <textarea [(ngModel)]="newComment" name="nComment" rows="2" class="input-control" placeholder="Укажите причину или детали..."></textarea>
            </div>

            <div *ngIf="errorMsg()" class="error-banner">{{ errorMsg() }}</div>

            <div class="modal-footer">
              <button type="button" (click)="showCreateModal.set(false)" class="btn-secondary">{{ i18n.t('btn.cancel') }}</button>
              <button type="submit" [disabled]="submitting()" class="btn-primary">
                {{ submitting() ? 'Отправка...' : 'Отправить на согласование' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .requests-page {
      padding: 28px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .page-title {
      font-size: 1.6rem;
      font-weight: 800;
      color: var(--text-main);
    }

    .page-subtitle {
      color: var(--text-muted);
      font-size: 0.9rem;
    }

    .filters-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 20px;
    }

    .filter-pills {
      display: flex;
      gap: 8px;
    }

    .pill-btn {
      padding: 6px 14px;
      border-radius: var(--radius-full);
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-muted);
      background: var(--bg-surface-subtle);
      border: 1px solid var(--border-light);
      &:hover { color: var(--text-main); }
      &.active {
        background: var(--janapost-green);
        color: white;
        border-color: var(--janapost-green);
      }
    }

    .balance-tag {
      font-size: 0.85rem;
      color: var(--text-muted);
      strong { color: var(--janapost-dark); font-size: 0.95rem; margin-left: 4px; }
    }

    .requests-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .request-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 18px 24px;
      cursor: pointer;
      transition: all 0.2s ease;
      &:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-md);
        border-color: var(--janapost-green);
      }
    }

    .req-left {
      display: flex;
      align-items: center;
      gap: 18px;
    }

    .req-type-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #e0f2fe;
      color: #0369a1;
      display: flex;
      align-items: center;
      justify-content: center;
      &.vacation { background: #dcfce7; color: #15803d; }
    }

    .req-main-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .req-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .req-id {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-muted);
      font-family: monospace;
    }

    .req-type-title {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-main);
    }

    .req-details-line {
      font-size: 0.82rem;
      color: var(--text-muted);
    }

    .dot-separator {
      margin: 0 6px;
    }

    .req-comment {
      font-size: 0.8rem;
      color: var(--text-muted);
      font-style: italic;
    }

    .req-right {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
    }

    .open-details-hint {
      font-size: 0.75rem;
      color: var(--janapost-dark);
      font-weight: 600;
    }

    .empty-card {
      padding: 40px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      color: var(--text-muted);
    }

    /* Timeline styles */
    .detail-modal {
      max-width: 580px;
    }

    .timeline-heading {
      font-size: 0.95rem;
      font-weight: 700;
      margin-bottom: 16px;
    }

    .timeline-flow {
      display: flex;
      flex-direction: column;
      gap: 16px;
      position: relative;
      padding-left: 10px;
      &::before {
        content: '';
        position: absolute;
        left: 21px;
        top: 15px;
        bottom: 25px;
        width: 2px;
        background: var(--border-light);
      }
    }

    .timeline-step {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      position: relative;
      z-index: 2;
    }

    .step-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: white;
      border: 2px solid var(--border-light);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
    }

    .timeline-step.done .step-icon {
      background: var(--janapost-green);
      border-color: var(--janapost-green);
      color: white;
    }

    .timeline-step.active .step-icon {
      border-color: var(--accent-amber);
      color: var(--accent-amber);
      box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
    }

    .step-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .step-title {
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--text-main);
    }

    .step-sub {
      font-size: 0.78rem;
      color: var(--text-muted);
    }

    /* Modal Form Styles */
    .type-selector {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .type-btn {
      padding: 12px;
      border: 1px solid var(--border-light);
      border-radius: var(--radius-md);
      font-size: 0.85rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: white;
      &.active {
        border-color: var(--janapost-green);
        background: var(--janapost-light);
        color: var(--janapost-dark);
        font-weight: 700;
      }
    }
  `]
})
export class RequestsComponent implements OnInit {
  auth = inject(AuthService);
  i18n = inject(I18nService);
  api = inject(ApiService);
  notif = inject(NotificationService);

  requests = signal<any[]>([
    {
      id: 1,
      type: 'vacation',
      days: 9,
      date_from: '2026-11-10',
      date_to: '2026-11-20',
      amount: 0,
      comment: 'Семейная поездка',
      status: 'pending_manager',
      created_at: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: 2,
      type: 'vacation',
      days: 5,
      date_from: '2026-09-01',
      date_to: '2026-09-05',
      amount: 0,
      comment: 'Отпуск',
      status: 'completed',
      created_at: new Date(Date.now() - 3456000000).toISOString()
    }
  ]);

  filter = signal<'all' | 'vacation' | 'advance'>('all');
  selectedRequest = signal<any | null>(null);
  showCreateModal = signal(false);

  newType = signal<'vacation' | 'advance'>('vacation');
  newDateFrom = '2026-11-20';
  newDateTo = '2026-11-27';
  newDays = 7;
  newAmount = 100000;
  newComment = '';
  errorMsg = signal('');
  submitting = signal(false);

  ngOnInit() {
    this.loadRequests();
  }

  loadRequests() {
    this.api.get<any[]>('/requests').subscribe({
      next: (data) => {
        if (data && Array.isArray(data)) {
          this.requests.set(data);
        }
      },
      error: () => {}
    });
  }

  filteredRequests(): any[] {
    const f = this.filter();
    if (f === 'all') return this.requests();
    return this.requests().filter(r => r.type === f);
  }

  openCreateModal() {
    this.errorMsg.set('');
    this.showCreateModal.set(true);
  }

  openDetail(req: any) {
    this.selectedRequest.set(req);
  }

  createRequest(e: Event) {
    e.preventDefault();
    this.errorMsg.set('');

    const user = this.auth.currentUser();
    if (this.newType() === 'vacation' && user && this.newDays > user.vacation_days_left) {
      this.errorMsg.set(`Превышен доступный остаток отпуска (${user.vacation_days_left} дн.)`);
      return;
    }

    this.submitting.set(true);
    const payload = this.newType() === 'vacation'
      ? {
          type: 'vacation',
          date_from: this.newDateFrom,
          date_to: this.newDateTo,
          days: this.newDays,
          amount: 0,
          comment: this.newComment
        }
      : {
          type: 'advance',
          amount: this.newAmount,
          days: 0,
          comment: this.newComment
        };

    this.api.post<any>('/requests', payload).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.showCreateModal.set(false);
        this.requests.update(l => [res, ...l]);
        this.notif.addLocalNotification('request', 'Заявка успешно подана', 'Өтінім сәтті берілді');
      },
      error: () => {
        this.submitting.set(false);
        const mockItem = {
          id: Date.now(),
          type: payload.type,
          days: payload.days,
          date_from: payload.type === 'vacation' ? this.newDateFrom : null,
          date_to: payload.type === 'vacation' ? this.newDateTo : null,
          amount: payload.amount,
          comment: this.newComment,
          status: 'pending_manager',
          created_at: new Date().toISOString()
        };
        this.requests.update(l => [mockItem, ...l]);
        this.showCreateModal.set(false);
      }
    });
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
