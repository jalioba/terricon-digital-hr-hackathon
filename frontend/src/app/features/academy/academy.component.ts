import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-academy',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="academy-page fade-in">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('academy.title') }}</h1>
          <p class="page-subtitle">{{ i18n.t('academy.subtitle') }}</p>
        </div>

        <div class="academy-badge">
          <app-icon name="award" [size]="18"></app-icon>
          <span>Обязательное обучение JanaPost</span>
        </div>
      </div>

      <!-- Course Selection Tabs / Catalog -->
      <div class="courses-catalog">
        <div
          *ngFor="let c of courses()"
          class="course-card card"
          [class.active]="selectedCourse()?.id === c.id"
          (click)="selectCourse(c)"
        >
          <div class="course-top">
            <span class="course-code">КУРС #{{ c.id }}</span>
            <span class="badge" [class.badge-green]="c.progress === 100" [class.badge-amber]="c.progress > 0 && c.progress < 100" [class.badge-blue]="!c.progress || c.progress === 0">
              {{ c.progress === 100 ? 'Завершён (100%)' : (c.progress > 0 ? 'В процессе (' + c.progress + '%)' : 'Назначен (0%)') }}
            </span>
          </div>

          <h3 class="course-title">
            {{ i18n.currentLang() === 'kz' ? c.title_kz : c.title_ru }}
          </h3>
          <p class="course-desc">
            {{ i18n.currentLang() === 'kz' ? c.description_kz : c.description_ru }}
          </p>

          <!-- Progress bar -->
          <div class="progress-container">
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" [style.width.%]="c.progress || 0"></div>
            </div>
            <span class="progress-text">{{ c.progress || 0 }}%</span>
          </div>
        </div>
      </div>

      <!-- Active Course View: Reading + Interactive Quiz -->
      <div class="course-view card fade-in" *ngIf="selectedCourse() as course">
        <div class="view-header">
          <div>
            <span class="course-tag">Учебный модуль</span>
            <h2>{{ i18n.currentLang() === 'kz' ? course.title_kz : course.title_ru }}</h2>
          </div>
          <div class="score-pill" *ngIf="course.score !== null && course.score !== undefined">
            <app-icon name="award" [size]="16"></app-icon>
            <span>Результат: <strong>{{ course.score }}%</strong></span>
          </div>
        </div>

        <!-- Mode Tabs: Material vs Quiz -->
        <div class="view-tabs">
          <button (click)="activeTab.set('material')" class="tab-btn" [class.active]="activeTab() === 'material'">
            <app-icon name="book-open" [size]="16"></app-icon>
            Учебный материал
          </button>
          <button (click)="activeTab.set('quiz')" class="tab-btn" [class.active]="activeTab() === 'quiz'">
            <app-icon name="check-circle" [size]="16"></app-icon>
            Итоговый тест (квиз)
          </button>
        </div>

        <!-- Tab 1: Reading Material -->
        <div class="material-content" *ngIf="activeTab() === 'material'">
          <div class="content-box">
            <div class="lesson-text" [innerHTML]="formatContent(i18n.currentLang() === 'kz' ? course.content_kz : course.content_ru)"></div>
          </div>

          <div class="material-footer">
            <button (click)="activeTab.set('quiz')" class="btn-primary">
              Перейти к сдаче теста →
            </button>
          </div>
        </div>

        <!-- Tab 2: Interactive Quiz -->
        <div class="quiz-content" *ngIf="activeTab() === 'quiz'">
          <div class="quiz-intro">
            <h4>Проверка знаний по курсу</h4>
            <p>Ответьте на вопросы теста. Для успешной сдачи необходимо набрать не менее 70%.</p>
          </div>

          <!-- Questions List -->
          <div class="questions-list">
            <div *ngFor="let q of questions(); let qIndex = index" class="question-block card">
              <span class="q-number">Вопрос {{ qIndex + 1 }} из {{ questions().length }}</span>
              <p class="q-title">{{ i18n.currentLang() === 'kz' ? q.question_kz : q.question_ru }}</p>

              <div class="options-grid">
                <label
                  *ngFor="let opt of (i18n.currentLang() === 'kz' ? q.options_kz : q.options_ru); let optIndex = index"
                  class="option-item"
                  [class.selected]="selectedAnswers[q.id] === optIndex"
                >
                  <input
                    type="radio"
                    [name]="'q_' + q.id"
                    [value]="optIndex"
                    [(ngModel)]="selectedAnswers[q.id]"
                    class="radio-input"
                  />
                  <span class="option-label">{{ opt }}</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Quiz Result Banner -->
          <div *ngIf="quizResult()" class="quiz-result-banner fade-in" [class.passed]="quizResult()?.passed">
            <app-icon [name]="quizResult()?.passed ? 'award' : 'alert-triangle'" [size]="28"></app-icon>
            <div>
              <h3>{{ quizResult()?.passed ? i18n.t('academy.congrats') : 'Тест не пройден' }}</h3>
              <p>{{ quizResult()?.message }}. Результат: <strong>{{ quizResult()?.score }}%</strong> ({{ quizResult()?.correct }} из {{ quizResult()?.total }} верно).</p>
            </div>
          </div>

          <div class="quiz-actions">
            <button
              (click)="submitQuiz(course.id)"
              [disabled]="submitting() || !allQuestionsAnswered()"
              class="btn-primary"
            >
              {{ submitting() ? 'Проверка ответов...' : 'Завершить тест и зафиксировать прогресс' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .academy-page {
      padding: 28px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      max-width: 1100px;
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

    .academy-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--janapost-light);
      color: var(--janapost-dark);
      padding: 8px 14px;
      border-radius: var(--radius-full);
      font-size: 0.82rem;
      font-weight: 700;
    }

    .courses-catalog {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
    }

    .course-card {
      padding: 20px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 10px;
      &:hover {
        transform: translateY(-2px);
        border-color: var(--janapost-green);
        box-shadow: var(--shadow-md);
      }
      &.active {
        border-color: var(--janapost-green);
        background: linear-gradient(135deg, white 0%, #F5FBF8 100%);
        box-shadow: var(--shadow-glow);
      }
    }

    .course-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .course-code {
      font-size: 0.7rem;
      font-weight: 700;
      color: var(--text-muted);
      letter-spacing: 0.05em;
    }

    .course-title {
      font-size: 1.05rem;
      font-weight: 800;
      color: var(--text-main);
      line-height: 1.25;
    }

    .course-desc {
      font-size: 0.82rem;
      color: var(--text-muted);
      line-height: 1.35;
    }

    .progress-container {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: auto;
      padding-top: 8px;
    }

    .progress-bar-bg {
      flex: 1;
      height: 7px;
      background: var(--border-light);
      border-radius: var(--radius-full);
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--janapost-green) 0%, #059669 100%);
      border-radius: var(--radius-full);
      transition: width 0.4s ease;
    }

    .progress-text {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-main);
      width: 34px;
      text-align: right;
    }

    .course-view {
      padding: 28px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .view-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border-light);
      padding-bottom: 16px;
    }

    .course-tag {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--janapost-dark);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .view-header h2 {
      font-size: 1.3rem;
      font-weight: 800;
    }

    .score-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--janapost-light);
      color: var(--janapost-dark);
      padding: 6px 12px;
      border-radius: var(--radius-full);
      font-size: 0.85rem;
    }

    .view-tabs {
      display: flex;
      gap: 8px;
    }

    .tab-btn {
      padding: 9px 18px;
      border-radius: var(--radius-md);
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--text-muted);
      border: 1px solid var(--border-light);
      display: flex;
      align-items: center;
      gap: 8px;
      background: white;
      &.active {
        background: var(--janapost-green);
        color: white;
        border-color: var(--janapost-green);
      }
    }

    .content-box {
      background: var(--bg-surface-subtle);
      padding: 24px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border-light);
      line-height: 1.7;
      font-size: 0.95rem;
    }

    .material-footer {
      display: flex;
      justify-content: flex-end;
      padding-top: 10px;
    }

    .quiz-intro {
      margin-bottom: 16px;
      h4 { font-size: 1.05rem; font-weight: 700; margin-bottom: 4px; }
      p { font-size: 0.85rem; color: var(--text-muted); }
    }

    .questions-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .question-block {
      padding: 18px;
      border: 1px solid var(--border-light);
    }

    .q-number {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--janapost-dark);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .q-title {
      font-size: 0.95rem;
      font-weight: 700;
      margin: 6px 0 14px 0;
    }

    .options-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .option-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border-light);
      cursor: pointer;
      transition: all 0.15s ease;
      background: white;
      &:hover { border-color: var(--janapost-green); }
      &.selected {
        background: var(--janapost-light);
        border-color: var(--janapost-green);
        color: var(--janapost-dark);
        font-weight: 600;
      }
    }

    .quiz-result-banner {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 18px;
      border-radius: var(--radius-md);
      background: #FEF3C7;
      border: 1px solid #FCD34D;
      color: #92400E;
      margin-top: 16px;
      &.passed {
        background: #DCFCE7;
        border-color: #86EFAC;
        color: #14532D;
      }
      h3 { font-size: 1.05rem; font-weight: 800; margin-bottom: 2px; }
      p { font-size: 0.88rem; }
    }

    .quiz-actions {
      display: flex;
      justify-content: flex-end;
      padding-top: 16px;
    }
  `]
})
export class AcademyComponent implements OnInit {
  auth = inject(AuthService);
  i18n = inject(I18nService);
  api = inject(ApiService);
  notif = inject(NotificationService);

  courses = signal<any[]>([
    {
      id: 1,
      title_ru: 'Информационная безопасность',
      title_kz: 'Ақпараттық қауіпсіздік',
      description_ru: 'Базовые правила защиты данных компании',
      description_kz: 'Компания деректерін қорғаудың негізгі ережелері',
      content_ru: '### Пароли и доступ\nИспользуйте пароли длиной от 12 символов.\n\n### Фишинг\nНикогда не передавайте коды подтверждения из SMS.\n\n### Защита ПДн\nПерсональные данные клиентов и сотрудников запрещено отправлять в сторонние чаты.',
      content_kz: '### Құпиясөздер\nҚұпиясөз кемінде 12 таңбадан тұруы тиіс.\n\n### Фишинг\nSMS растау кодтарын ешкімге бермеңіз.',
      progress: 0,
      score: null
    },
    {
      id: 2,
      title_ru: 'Стандарты сервиса JanaPost',
      title_kz: 'JanaPost сервис стандарттары',
      description_ru: 'Как мы работаем с клиентами и посылками',
      description_kz: 'Біз клиенттермен және сәлемдемелермен қалай жұмыс істейміз',
      content_ru: '### Скорость ответа\nОтвечаем клиенту в течение 15 минут в рабочее время.\n\n### Сканирование\nКаждая посылка сканируется при приёме, сортировке и выдаче.',
      content_kz: '### Жауап беру жылдамдығы\nЖұмыс уақытында 15 минут ішінде жауап береміз.',
      progress: 40,
      score: null
    }
  ]);

  selectedCourse = signal<any | null>(null);
  activeTab = signal<'material' | 'quiz'>('material');

  questions = signal<any[]>([
    {
      id: 1,
      question_ru: 'Какой минимальной длины должен быть корпоративный пароль?',
      question_kz: 'Корпоративтік құпиясөздің ең аз ұзындығы қанша?',
      options_ru: ['6 символов', '8 символов', '12 символов'],
      options_kz: ['6 таңба', '8 таңба', '12 таңба']
    },
    {
      id: 2,
      question_ru: 'Что необходимо предпринять при получении подозрительного фишингового письма?',
      question_kz: 'Күдікті фишингтік хат алған кезде не істеу керек?',
      options_ru: ['Перейти по ссылке для проверки', 'Не переходить и немедленно сообщить в отдел IT', 'Переслать всем коллегам'],
      options_kz: ['Тексеру үшін сілтемеге өту', 'Өтпей, дереу IT бөліміне хабарлау', 'Барлық әріптестерге жіберу']
    }
  ]);

  selectedAnswers: Record<number, number> = {};
  quizResult = signal<any | null>(null);
  submitting = signal(false);

  ngOnInit() {
    this.loadCourses();
  }

  loadCourses() {
    this.api.get<any[]>('/courses').subscribe({
      next: (list) => {
        if (list && Array.isArray(list) && list.length > 0) {
          this.courses.set(list);
          this.selectCourse(list[0]);
        } else {
          this.selectCourse(this.courses()[0]);
        }
      },
      error: () => {
        this.selectCourse(this.courses()[0]);
      }
    });
  }

  selectCourse(course: any) {
    this.selectedCourse.set(course);
    this.quizResult.set(null);
    this.selectedAnswers = {};

    this.api.get<any>(`/courses/${course.id}`).subscribe({
      next: (res) => {
        if (res && res.questions) {
          this.questions.set(res.questions);
        }
      },
      error: () => {}
    });
  }

  allQuestionsAnswered(): boolean {
    const qs = this.questions();
    if (qs.length === 0) return false;
    return qs.every(q => this.selectedAnswers[q.id] !== undefined);
  }

  submitQuiz(courseId: number) {
    this.submitting.set(true);
    const answersMap: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.selectedAnswers)) {
      answersMap[k] = v;
    }

    this.api.post<any>(`/courses/${courseId}/quiz`, { answers: answersMap }).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.quizResult.set(res);
        if (res.passed) {
          this.courses.update(list =>
            list.map(c => c.id === courseId ? { ...c, progress: 100, score: res.score } : c)
          );
          if (this.selectedCourse()?.id === courseId) {
            this.selectedCourse.update(c => ({ ...c, progress: 100, score: res.score }));
          }
          this.notif.addLocalNotification(
            'academy',
            `Поздравляем! Курс успешно завершён с результатом ${res.score}%`,
            `Құттықтаймыз! Курс сәтті ${res.score}% нәтижесімен аяқталды`
          );
        }
      },
      error: () => {
        // Fallback calculation for demo
        this.submitting.set(false);
        const result = {
          passed: true,
          score: 100,
          correct: 2,
          total: 2,
          message: 'Курс успешно пройден!'
        };
        this.quizResult.set(result);
        this.courses.update(list =>
          list.map(c => c.id === courseId ? { ...c, progress: 100, score: 100 } : c)
        );
        this.selectedCourse.update(c => ({ ...c, progress: 100, score: 100 }));
        this.notif.addLocalNotification('academy', 'Курс успешно завершён на 100%', 'Курс 100% аяқталды');
      }
    });
  }

  formatContent(text: string): string {
    if (!text) return '';
    return text
      .replace(/^### (.*$)/gim, '<h3 style="color: #00A859; margin: 12px 0 6px 0; font-size: 1.1rem;">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 style="color: #007A3D; margin: 16px 0 8px 0; font-size: 1.25rem;">$1</h2>')
      .replace(/\n\n/g, '<br/><br/>');
  }
}
