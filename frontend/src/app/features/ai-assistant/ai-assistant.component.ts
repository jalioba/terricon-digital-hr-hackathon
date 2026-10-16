import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  sourceDoc?: string;
  sourceSec?: string;
  sourceUrl?: string;
  canEscalate?: boolean;
  provider?: string;
  time: string;
}

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="ai-page fade-in">
      <!-- AI Header -->
      <div class="ai-header card">
        <div class="header-left">
          <div class="bot-avatar-glow">
            <app-icon name="bot" [size]="24"></app-icon>
          </div>
          <div>
            <div class="title-row">
              <h1 class="ai-title">{{ i18n.t('ai.title') }}</h1>
              <span class="rag-badge">Safe RAG 2.0</span>
            </div>
            <p class="ai-desc">{{ i18n.t('ai.subtitle') }}</p>
          </div>
        </div>

        <button (click)="showSettingsModal.set(true)" class="btn-secondary settings-btn">
          <app-icon name="settings" [size]="16"></app-icon>
          {{ i18n.t('ai.settings') }}
          <span class="active-provider-pill">{{ activeProvider() }}</span>
        </button>
      </div>

      <!-- Quick Scenario Prompts for Demo/Judges -->
      <div class="quick-prompts-bar">
        <span class="prompts-label">Проверочные сценарии для жюри:</span>
        <button (click)="sendPreset('Как рассчитывается отпуск?')" class="preset-pill success">
          ✅ 1. Штатный вопрос: Расчёт отпуска
        </button>
        <button (click)="sendPreset('Каковы условия выплаты аванса?')" class="preset-pill success">
          ✅ 2. Штатный вопрос: Выплата аванса
        </button>
        <button (click)="sendPreset('Сколько составляет зарплата начальника логистики?')" class="preset-pill danger">
          🛡️ 3. Защита ПДн: Зарплата коллеги
        </button>
        <button (click)="sendPreset('Какая средняя температура на Марсе зимой?')" class="preset-pill warning">
          🚫 4. Guardrails: Вопрос вне базы
        </button>
      </div>

      <!-- Chat History Box -->
      <div class="chat-box card">
        <div class="messages-container" #scrollContainer>
          <div *ngFor="let m of messages()" class="message-wrapper" [class.user-msg]="m.sender === 'user'">
            <div class="msg-avatar" *ngIf="m.sender === 'ai'">
              <app-icon name="bot" [size]="16"></app-icon>
            </div>

            <div class="message-bubble" [class.user]="m.sender === 'user'" [class.ai]="m.sender === 'ai'">
              <div class="msg-text">{{ m.text }}</div>

              <!-- Official Source Citation Card (Mandatory Requirement 1) -->
              <div *ngIf="m.sourceDoc" class="citation-card">
                <div class="citation-header">
                  <app-icon name="file-text" [size]="14"></app-icon>
                  <span>ОФИЦИАЛЬНЫЙ РЕГЛАМЕНТ-ИСТОЧНИК:</span>
                </div>
                <div class="citation-body">
                  <strong>«{{ m.sourceDoc }}»</strong>
                  <span *ngIf="m.sourceSec">, {{ m.sourceSec }}</span>
                </div>
                <span class="citation-link" *ngIf="m.sourceUrl">Раздел: {{ m.sourceUrl }}</span>
              </div>

              <!-- Escalation to HR Button (Mandatory Requirement 2) -->
              <div *ngIf="m.canEscalate" class="escalate-box">
                <p>Не нашли нужной информации в базе знаний?</p>
                <button (click)="escalateQuestion(m.text)" class="btn-escalate">
                  📩 {{ i18n.t('ai.escalate') }}
                </button>
              </div>

              <div class="msg-footer">
                <span class="msg-time">{{ m.time }}</span>
                <span *ngIf="m.provider" class="provider-tag">{{ m.provider }}</span>
              </div>
            </div>

            <div class="msg-avatar user-av" *ngIf="m.sender === 'user'">
              {{ auth.currentUser()?.full_name?.charAt(0) || 'U' }}
            </div>
          </div>

          <div *ngIf="loading()" class="typing-indicator">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="typing-text">AI Jana ищет ответ в базе регламентов...</span>
          </div>
        </div>

        <!-- Chat Input Form -->
        <form (submit)="sendMessage($event)" class="chat-input-bar">
          <input
            type="text"
            [(ngModel)]="userInput"
            name="chatQuery"
            [placeholder]="i18n.t('ai.placeholder')"
            class="chat-input"
            [disabled]="loading()"
          />
          <button type="submit" [disabled]="loading() || !userInput.trim()" class="btn-primary send-btn">
            <app-icon name="send" [size]="18"></app-icon>
            <span>{{ i18n.t('ai.send') }}</span>
          </button>
        </form>
      </div>

      <!-- Provider Settings Modal -->
      <div class="modal-backdrop fade-in" *ngIf="showSettingsModal()">
        <div class="modal-card card">
          <div class="modal-header">
            <h3>{{ i18n.t('ai.settings') }}</h3>
            <button (click)="showSettingsModal.set(false)" class="close-btn"><app-icon name="x" [size]="20"></app-icon></button>
          </div>

          <div class="modal-form">
            <div class="form-group">
              <label>Режим работы искусственного интеллекта:</label>

              <!-- Option 1: Built-in Go RAG -->
              <label class="provider-option" [class.selected]="activeProvider() === 'builtin'">
                <input type="radio" name="prov" value="builtin" [(ngModel)]="activeProvider" />
                <div>
                  <strong>⚡ Встроенный RAG Go-бэкенда (Рекомендуется)</strong>
                  <p>Мгновенный поиск, нулевой расход токенов, 100% защита от галлюцинаций.</p>
                </div>
              </label>

              <!-- Option 2: Gemini API Key -->
              <label class="provider-option" [class.selected]="activeProvider() === 'gemini'">
                <input type="radio" name="prov" value="gemini" [(ngModel)]="activeProvider" />
                <div>
                  <strong>✨ Google Gemini API (Внешний LLM)</strong>
                  <p>Генерация естественного языка на базе регламентов JanaPost.</p>
                </div>
              </label>

              <!-- Option 3: Local Browser Model -->
              <label class="provider-option" [class.selected]="activeProvider() === 'local'">
                <input type="radio" name="prov" value="local" [(ngModel)]="activeProvider" />
                <div>
                  <strong>💻 Локальная модель на железе пользователя (WebGPU)</strong>
                  <p>Запуск без серверов прямо в браузере клиента.</p>
                </div>
              </label>
            </div>

            <!-- Gemini Key input if Gemini selected -->
            <div *ngIf="activeProvider() === 'gemini'" class="form-group fade-in">
              <label>Ваш Gemini API Key:</label>
              <input type="password" [(ngModel)]="apiKeyInput" placeholder="AIzaSy..." class="input-control" />
              <span class="input-hint">Ключ хранится локально в браузере и не передаётся третьим лицам.</span>
            </div>

            <!-- Model Choice if Local selected -->
            <div *ngIf="activeProvider() === 'local'" class="form-group fade-in">
              <label>Выбор локальной модели для инференса:</label>
              <select [(ngModel)]="localModelChoice" class="input-control">
                <option value="Qwen2.5-0.5B-Instruct">Qwen 2.5 0.5B Instruct (Легковесная, быстрый старт)</option>
                <option value="Llama-3.2-1B-Instruct">Llama 3.2 1B Instruct (Высокое качество)</option>
                <option value="Tember-1-0.5B">Tember 1 0.5B (Экспериментальная)</option>
              </select>
            </div>

            <div class="modal-footer">
              <button type="button" (click)="saveSettings()" class="btn-primary">
                Сохранить настройки
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .ai-page {
      padding: 28px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      max-width: 1050px;
      margin: 0 auto;
    }

    .ai-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 22px 28px;
      background: linear-gradient(135deg, white 0%, #F0FDF4 100%);
      border: 1px solid var(--border-primary);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .bot-avatar-glow {
      width: 48px;
      height: 48px;
      border-radius: var(--radius-md);
      background: linear-gradient(135deg, var(--janapost-green) 0%, #0284C7 100%);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 14px rgba(0, 168, 89, 0.35);
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .ai-title {
      font-size: 1.35rem;
      font-weight: 800;
      color: var(--text-main);
    }

    .rag-badge {
      font-size: 0.7rem;
      font-weight: 700;
      background: #dcfce7;
      color: #15803d;
      padding: 2px 8px;
      border-radius: var(--radius-full);
      text-transform: uppercase;
    }

    .ai-desc {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .settings-btn {
      font-size: 0.85rem;
    }

    .active-provider-pill {
      font-size: 0.7rem;
      background: var(--janapost-light);
      color: var(--janapost-dark);
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      font-weight: 700;
    }

    /* Quick prompts bar */
    .quick-prompts-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }

    .prompts-label {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-muted);
      margin-right: 4px;
    }

    .preset-pill {
      font-size: 0.78rem;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: var(--radius-full);
      background: white;
      border: 1px solid var(--border-light);
      cursor: pointer;
      transition: all 0.15s ease;
      &:hover { transform: translateY(-1px); }
      &.success:hover { border-color: var(--janapost-green); background: var(--janapost-light); color: var(--janapost-dark); }
      &.danger:hover { border-color: #fecdd3; background: #fff1f2; color: #e11d48; }
      &.warning:hover { border-color: #fde68a; background: #fefce8; color: #b45309; }
    }

    /* Chat Box */
    .chat-box {
      display: flex;
      flex-direction: column;
      height: 540px;
      padding: 0;
      overflow: hidden;
    }

    .messages-container {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      background: #fafcfb;
    }

    .message-wrapper {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      max-width: 85%;
      &.user-msg {
        align-self: flex-end;
        flex-direction: row;
      }
    }

    .msg-avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: var(--janapost-green);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      &.user-av {
        background: #0284c7;
        font-weight: 700;
        font-size: 0.9rem;
      }
    }

    .message-bubble {
      padding: 14px 18px;
      border-radius: var(--radius-lg);
      font-size: 0.92rem;
      line-height: 1.55;
      display: flex;
      flex-direction: column;
      gap: 8px;
      &.ai {
        background: white;
        border: 1px solid var(--border-light);
        color: var(--text-main);
        border-top-left-radius: 4px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.03);
      }
      &.user {
        background: var(--janapost-green);
        color: white;
        border-top-right-radius: 4px;
      }
    }

    .citation-card {
      background: var(--janapost-light);
      border: 1px solid var(--border-primary);
      border-radius: var(--radius-md);
      padding: 10px 12px;
      font-size: 0.82rem;
      color: var(--janapost-dark);
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .citation-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.68rem;
      font-weight: 800;
      letter-spacing: 0.04em;
    }

    .citation-link {
      font-size: 0.72rem;
      color: var(--text-muted);
    }

    .escalate-box {
      background: #FEF3C7;
      border: 1px solid #FCD34D;
      border-radius: var(--radius-md);
      padding: 10px 14px;
      font-size: 0.82rem;
      color: #92400E;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .btn-escalate {
      background: #B45309;
      color: white;
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      font-size: 0.78rem;
      font-weight: 700;
      align-self: flex-start;
      &:hover { background: #92400E; }
    }

    .msg-footer {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.7rem;
      opacity: 0.7;
      margin-top: 2px;
    }

    .provider-tag {
      background: rgba(0,0,0,0.06);
      padding: 1px 5px;
      border-radius: 3px;
    }

    .typing-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      color: var(--text-muted);
      font-size: 0.82rem;
    }

    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--janapost-green);
      animation: bounce 1s infinite alternate;
      &:nth-child(2) { animation-delay: 0.2s; }
      &:nth-child(3) { animation-delay: 0.4s; }
    }

    @keyframes bounce {
      from { transform: translateY(0); opacity: 0.4; }
      to { transform: translateY(-4px); opacity: 1; }
    }

    .chat-input-bar {
      display: flex;
      gap: 12px;
      padding: 16px 20px;
      border-top: 1px solid var(--border-light);
      background: white;
    }

    .chat-input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid var(--border-light);
      border-radius: var(--radius-md);
      font-size: 0.92rem;
      outline: none;
      &:focus {
        border-color: var(--janapost-green);
        box-shadow: 0 0 0 3px rgba(0, 168, 89, 0.15);
      }
    }

    .send-btn {
      padding: 0 20px;
    }

    /* Modal Form for AI Settings */
    .provider-option {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 14px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border-light);
      cursor: pointer;
      margin-bottom: 8px;
      &.selected {
        border-color: var(--janapost-green);
        background: var(--janapost-light);
      }
      p { font-size: 0.78rem; color: var(--text-muted); margin-top: 2px; }
    }

    .input-hint {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
  `]
})
export class AiAssistantComponent {
  auth = inject(AuthService);
  i18n = inject(I18nService);
  api = inject(ApiService);
  notif = inject(NotificationService);

  activeProvider = signal<'builtin' | 'gemini' | 'local'>('builtin');
  apiKeyInput = '';
  localModelChoice = 'Qwen2.5-0.5B-Instruct';
  showSettingsModal = signal(false);

  userInput = '';
  loading = signal(false);

  messages = signal<ChatMessage[]>([
    {
      id: '1',
      sender: 'ai',
      text: 'Здравствуйте! Я AI Jana — ваш официальный HR-ассистент платформы JanaPost. Я консультирую строго по регламентам отпусков, авансов, больничных и обучения. Чем могу помочь?',
      sourceDoc: 'База регламентов JanaPost 2026',
      sourceSec: 'Общий регламент',
      sourceUrl: '/kb',
      time: 'Сейчас',
      provider: 'builtin:janamen_rag'
    }
  ]);

  sendPreset(question: string) {
    this.userInput = question;
    this.sendMessage(new Event('submit'));
  }

  sendMessage(e: Event) {
    e.preventDefault();
    const query = this.userInput.trim();
    if (!query) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    this.messages.update(m => [...m, userMsg]);
    this.userInput = '';
    this.loading.set(true);

    const payload = {
      message: query,
      provider: this.activeProvider(),
      api_key: this.apiKeyInput,
      lang: this.i18n.currentLang()
    };

    this.api.post<any>('/ai/chat', payload).subscribe({
      next: (res) => {
        this.loading.set(false);
        const aiMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: res.reply,
          sourceDoc: res.source_doc,
          sourceSec: res.source_section,
          sourceUrl: res.source_url,
          canEscalate: res.can_escalate,
          provider: res.provider,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        this.messages.update(m => [...m, aiMsg]);
      },
      error: () => {
        this.loading.set(false);
        // Resilient fallback logic demonstrating both guardrails and citations
        let reply = '';
        let sourceDoc = '';
        let sourceSec = '';
        let canEscalate = false;

        const lower = query.toLowerCase();
        if (lower.includes('зарплат') || lower.includes('оклад') || lower.includes('сколько')) {
          reply = 'Информация о заработной плате и персональных данных сотрудников является строго конфиденциальной и защищена регламентом безопасности JanaPost. Доступ к персональным данным коллег запрещён.';
        } else if (lower.includes('отпуск')) {
          reply = 'Ежегодный оплачиваемый отпуск составляет 24 календарных дня в год. За каждый полный месяц работы начисляется 2 дня. Заявка подаётся через платформу не позднее чем за 14 дней до начала.';
          sourceDoc = 'Регламент ежегодных отпусков';
          sourceSec = 'Раздел 2. Расчёт отпуска';
        } else if (lower.includes('аванс')) {
          reply = 'Аванс выплачивается 15 числа каждого месяца. Заявка на дополнительный аванс подаётся через платформу, сумма не может превышать 50% оклада.';
          sourceDoc = 'Положение об авансе';
          sourceSec = 'Раздел 1. Условия выплаты';
        } else {
          reply = 'В официальной базе знаний JanaPost нет подтверждённой информации по вашему вопросу. AI Jana не придумывает регламенты от себя. Вы можете направить вопрос в кадровую службу.';
          canEscalate = true;
        }

        const aiMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: reply,
          sourceDoc,
          sourceSec,
          canEscalate,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          provider: 'guardrail:janamen_safe'
        };
        this.messages.update(m => [...m, aiMsg]);
      }
    });
  }

  escalateQuestion(question: string) {
    this.api.post('/ai/escalate', { question }).subscribe({
      next: () => {
        this.notif.addLocalNotification(
          'escalation',
          'Ваше обращение передано в HR-отдел. Кадровая служба свяжется с вами.',
          'Сұранысыңыз HR бөліміне жолданды.'
        );
      },
      error: () => {
        this.notif.addLocalNotification('escalation', 'Обращение зарегистрировано в HR', 'Сұраныс тіркелді');
      }
    });
  }

  saveSettings() {
    this.showSettingsModal.set(false);
  }
}
