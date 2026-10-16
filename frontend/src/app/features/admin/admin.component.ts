import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ApiService } from '../../core/services/api.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="admin-page fade-in">
      <div class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('nav.admin') }}</h1>
          <p class="page-subtitle">Сводная аналитика по всем подразделениям JanaPost и управление базой знаний AI</p>
        </div>

        <div class="hr-badge">
          <app-icon name="shield" [size]="16"></app-icon>
          <span>Роль: HR Admin (Полный доступ)</span>
        </div>
      </div>

      <!-- KPI Metrics Grid -->
      <div class="kpi-grid">
        <div class="kpi-card card">
          <span class="kpi-label">Штат сотрудников</span>
          <span class="kpi-val">10 чел.</span>
          <span class="kpi-sub">3 подразделения JanaPost</span>
        </div>

        <div class="kpi-card card">
          <span class="kpi-label">Всего кадровых заявок</span>
          <span class="kpi-val green-text">5</span>
          <span class="kpi-sub">Отпуска и авансы</span>
        </div>

        <div class="kpi-card card">
          <span class="kpi-label">Прохождение обучения</span>
          <span class="kpi-val blue-text">68%</span>
          <span class="kpi-sub">Jana Academy (2 курса)</span>
        </div>

        <div class="kpi-card card">
          <span class="kpi-label">База знаний AI</span>
          <span class="kpi-val purple-text">{{ kbDocs().length }} регл.</span>
          <span class="kpi-sub">Статьи на RU и KZ</span>
        </div>
      </div>

      <!-- Departments Overview Table -->
      <div class="card depts-card">
        <h3>Метрики подразделений JanaPost</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Подразделение</th>
              <th>Сотрудников</th>
              <th>Заявок в работе</th>
              <th>Открытых задач</th>
              <th>Статус интеграции 1С</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let d of departments()">
              <td class="dept-col">
                <strong>{{ i18n.currentLang() === 'kz' ? d.name_kz : d.name_ru }}</strong>
              </td>
              <td>{{ d.employees }} чел.</td>
              <td>{{ d.requests }}</td>
              <td>{{ d.open_tasks }}</td>
              <td><span class="badge badge-green">Синхронизировано</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Knowledge Base Documents Manager -->
      <div class="card kb-card">
        <div class="kb-header-row">
          <div>
            <h3>База знаний AI Jana (Регламенты)</h3>
            <p>Документы, по которым консультирует HR-ассистент</p>
          </div>
          <button (click)="showNewKbModal.set(true)" class="btn-primary">
            <app-icon name="plus" [size]="16"></app-icon>
            Добавить регламент
          </button>
        </div>

        <div class="kb-list">
          <div *ngFor="let doc of kbDocs()" class="kb-item card">
            <div class="kb-meta">
              <span class="badge badge-blue">{{ doc.lang?.toUpperCase() }}</span>
              <span class="kb-section">{{ doc.section }}</span>
            </div>
            <h4 class="kb-title">{{ doc.title }}</h4>
            <p class="kb-content">{{ doc.content }}</p>
            <div class="kb-footer">
              <span class="kb-url">URL: {{ doc.url }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Add KB Modal -->
      <div class="modal-backdrop fade-in" *ngIf="showNewKbModal()">
        <div class="modal-card card">
          <div class="modal-header">
            <h3>Добавление документа в базу знаний AI</h3>
            <button (click)="showNewKbModal.set(false)" class="close-btn"><app-icon name="x" [size]="20"></app-icon></button>
          </div>

          <form (submit)="saveNewKb($event)" class="modal-form">
            <div class="form-group">
              <label>Название регламента</label>
              <input type="text" [(ngModel)]="newKbTitle" name="kbtitle" required class="input-control" placeholder="Например: Регламент командировок" />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Раздел</label>
                <input type="text" [(ngModel)]="newKbSection" name="kbsec" required class="input-control" placeholder="Раздел 1. Суточные" />
              </div>
              <div class="form-group">
                <label>Язык</label>
                <select [(ngModel)]="newKbLang" name="kblang" class="input-control">
                  <option value="ru">Русский</option>
                  <option value="kz">Қазақша</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label>Текст правила / регламента</label>
              <textarea [(ngModel)]="newKbContent" name="kbcontent" rows="4" required class="input-control" placeholder="Точный текст правила..."></textarea>
            </div>

            <div class="modal-footer">
              <button type="button" (click)="showNewKbModal.set(false)" class="btn-secondary">Отмена</button>
              <button type="submit" class="btn-primary">Сохранить в базу знаний</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .admin-page {
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

    .hr-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--accent-amber-light);
      color: #92400e;
      padding: 8px 14px;
      border-radius: var(--radius-full);
      font-size: 0.85rem;
      font-weight: 700;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }

    .kpi-card {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .kpi-label {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .kpi-val {
      font-size: 1.8rem;
      font-weight: 800;
      color: var(--text-main);
    }

    .green-text { color: var(--janapost-green); }
    .blue-text { color: var(--accent-blue); }
    .purple-text { color: #7e22ce; }

    .kpi-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .depts-card {
      padding: 24px;
      h3 { font-size: 1.15rem; font-weight: 800; margin-bottom: 16px; }
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
      th {
        text-align: left;
        padding: 12px 14px;
        color: var(--text-muted);
        border-bottom: 2px solid var(--border-light);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      td {
        padding: 14px;
        border-bottom: 1px solid var(--border-light);
      }
    }

    .dept-col {
      color: var(--janapost-dark);
    }

    .kb-card {
      padding: 24px;
    }

    .kb-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 18px;
      h3 { font-size: 1.15rem; font-weight: 800; }
      p { font-size: 0.82rem; color: var(--text-muted); }
    }

    .kb-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
    }

    .kb-item {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .kb-meta {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .kb-section {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .kb-title {
      font-size: 0.95rem;
      font-weight: 700;
    }

    .kb-content {
      font-size: 0.85rem;
      color: var(--text-muted);
      line-height: 1.45;
    }

    .kb-footer {
      margin-top: auto;
      padding-top: 8px;
      border-top: 1px solid var(--border-light);
      font-size: 0.72rem;
      color: var(--janapost-dark);
      font-family: monospace;
    }
  `]
})
export class AdminComponent implements OnInit {
  auth = inject(AuthService);
  i18n = inject(I18nService);
  api = inject(ApiService);

  departments = signal<any[]>([
    { name_ru: 'Отдел поставок заказов', name_kz: 'Тапсырыстарды жеткізу бөлімі', employees: 3, requests: 2, open_tasks: 2 },
    { name_ru: 'Отдел логистики и склада', name_kz: 'Логистика және қойма бөлімі', employees: 3, requests: 2, open_tasks: 2 },
    { name_ru: 'Отдел IT и поддержки', name_kz: 'IT және қолдау бөлімі', employees: 3, requests: 1, open_tasks: 2 }
  ]);

  kbDocs = signal<any[]>([
    { title: 'Регламент ежегодных отпусков', section: 'Раздел 2. Расчёт отпуска', url: '/kb/vacation#calc', content: 'Ежегодный оплачиваемый отпуск составляет 24 календарных дня в год.', lang: 'ru' },
    { title: 'Положение об авансе', section: 'Раздел 1. Условия выплаты', url: '/kb/advance#terms', content: 'Аванс выплачивается 15 числа каждого месяца, сумма не более 50% оклада.', lang: 'ru' },
    { title: 'Политика обучения Jana Academy', section: 'Раздел 1. Обязательное обучение', url: '/kb/academy#mandatory', content: 'Назначенные курсы необходимо пройти в течение 30 дней.', lang: 'ru' },
    { title: 'Жыл сайынғы демалыс регламенті', section: '2-бөлім. Демалысты есептеу', url: '/kb/vacation#calc', content: 'Жыл сайынғы ақылы демалыс 24 күнтізбелік күнді құрайды.', lang: 'kz' }
  ]);

  showNewKbModal = signal(false);
  newKbTitle = '';
  newKbSection = '';
  newKbLang = 'ru';
  newKbContent = '';

  ngOnInit() {
    this.api.get<any[]>('/ai/kb').subscribe({
      next: (docs) => {
        if (docs && Array.isArray(docs) && docs.length > 0) this.kbDocs.set(docs);
      },
      error: () => {}
    });

    this.api.get<any>('/analytics').subscribe({
      next: (res) => {
        if (res && res.departments) this.departments.set(res.departments);
      },
      error: () => {}
    });
  }

  saveNewKb(e: Event) {
    e.preventDefault();
    const newDoc = {
      title: this.newKbTitle,
      section: this.newKbSection,
      url: `/kb/${encodeURIComponent(this.newKbTitle.toLowerCase())}`,
      content: this.newKbContent,
      keywords: this.newKbTitle.toLowerCase(),
      lang: this.newKbLang
    };

    this.api.post<any>('/ai/kb', newDoc).subscribe({
      next: (created) => {
        this.kbDocs.update(l => [created, ...l]);
        this.showNewKbModal.set(false);
      },
      error: () => {
        this.kbDocs.update(l => [{ ...newDoc, id: Date.now() }, ...l]);
        this.showNewKbModal.set(false);
      }
    });
  }
}
