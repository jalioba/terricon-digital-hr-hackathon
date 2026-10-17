import { Component, OnInit, signal, computed, inject, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService, ChatMessage, ChatResponse } from '../../core/services/ai.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-ai',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './ai.component.html',
  styleUrls: ['./ai.component.scss']
})
export class AiComponent implements OnInit, AfterViewChecked {
  private aiService = inject(AiService);
  authService = inject(AuthService);
  i18n = inject(I18nService);

  @ViewChild('chatScrollContainer') private chatScrollContainer!: ElementRef;

  messages = signal<ChatMessage[]>([]);
  inputText = signal<string>('');
  isLoading = signal<boolean>(false);
  apiKey = signal<string>('');
  isKeyModalOpen = signal<boolean>(false);
  keyInputValue = signal<string>('');
  keySavedNotice = signal<string | null>(null);

  currentUser = computed(() => this.authService.currentUser());
  hasGeminiKey = computed(() => !!this.apiKey().trim());

  quickPrompts = computed(() => {
    const user = this.currentUser();
    const role = user?.role || 'employee';

    if (role === 'hr') {
      return [
        { label: 'Сколько сотрудников в компании?', icon: 'users' },
        { label: 'Сводка по заявкам сотрудников', icon: 'file-text' },
        { label: 'Список подразделений компании', icon: 'home' },
        { label: 'Какие регламенты есть в базе знаний?', icon: 'book-open' },
        { label: 'Сколько у меня дней отпуска?', icon: 'calendar' },
        { label: 'Какие у тебя полномочия?', icon: 'shield' }
      ];
    }

    if (role === 'manager') {
      return [
        { label: 'Кто в моем отделе?', icon: 'users' },
        { label: 'Какие задачи отдела сейчас в работе?', icon: 'kanban' },
        { label: 'Есть ли заявки на согласовании?', icon: 'file-text' },
        { label: 'Сколько у меня дней отпуска?', icon: 'calendar' },
        { label: 'Порядок согласования отпуска', icon: 'book-open' },
        { label: 'Условия получения аванса', icon: 'wallet' },
        { label: 'Какие у тебя полномочия?', icon: 'shield' }
      ];
    }

    // Default: employee
    return [
      { label: 'Сколько у меня дней отпуска?', icon: 'calendar' },
      { label: 'Какие у меня текущие задачи?', icon: 'kanban' },
      { label: 'Статус моих поданных заявок', icon: 'file-text' },
      { label: 'Как рассчитывается ежегодный отпуск?', icon: 'book-open' },
      { label: 'Условия и порядок выплаты аванса', icon: 'wallet' },
      { label: 'Что делать при болезни и больничном?', icon: 'shield' },
      { label: 'Какие у тебя полномочия?', icon: 'sparkles' }
    ];
  });

  private shouldScrollBottom = false;

  ngOnInit(): void {
    const storedKey = this.aiService.getStoredApiKey();
    if (storedKey) {
      this.apiKey.set(storedKey);
    }
    this.initWelcomeMessage();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollBottom) {
      this.scrollToBottom();
      this.shouldScrollBottom = false;
    }
  }

  initWelcomeMessage(): void {
    const user = this.currentUser();
    const name = user?.full_name ? user.full_name.split(' ')[0] : 'коллега';
    let roleText = 'Сотрудник';
    if (user?.role === 'manager') roleText = 'Руководитель подразделения';
    if (user?.role === 'hr') roleText = 'HR-директор';

    const welcomeText = `Здравствуйте, **${name}**! 👋\n\nЯ интеллектуальный HR-ассистент платформы **JAŃA MEN**.\n\nВаша роль в системе: **${roleText}**.\nЯ могу отвечать на любые вопросы по регламентам компании, процедурам отпусков и выплат, а также предоставлять актуальную сводку по вашим задачам и статусам.\n\n*Выберите готовый вопрос ниже или задайте свой вопрос в строке ввода.*`;

    this.messages.set([
      {
        id: 'welcome-msg',
        sender: 'assistant',
        text: welcomeText,
        timestamp: new Date(),
        sourceDoc: 'Корпоративная база знаний',
        sourceSection: 'Правила работы платформы',
        provider: 'builtin:janamen_rag'
      }
    ]);
  }

  sendMessage(textToSend?: string): void {
    const text = (textToSend !== undefined ? textToSend : this.inputText()).trim();
    if (!text || this.isLoading()) {
      return;
    }

    // Add user message
    const userMsg: ChatMessage = {
      id: 'u-' + Date.now(),
      sender: 'user',
      text,
      timestamp: new Date()
    };

    this.messages.update(prev => [...prev, userMsg]);
    this.inputText.set('');
    this.isLoading.set(true);
    this.shouldScrollBottom = true;

    const lang = this.i18n.currentLang();
    const key = this.apiKey();

    this.aiService.sendMessage(text, key, lang).subscribe({
      next: (resp: ChatResponse) => {
        const isActionWarning = resp.provider === 'guardrail:action_shield';
        const aiMsg: ChatMessage = {
          id: 'a-' + Date.now(),
          sender: 'assistant',
          text: resp.reply,
          timestamp: new Date(),
          sourceDoc: resp.source_doc,
          sourceSection: resp.source_section,
          provider: resp.provider,
          isActionWarning
        };

        this.messages.update(prev => [...prev, aiMsg]);
        this.isLoading.set(false);
        this.shouldScrollBottom = true;
      },
      error: (err) => {
        const errorMsg: ChatMessage = {
          id: 'err-' + Date.now(),
          sender: 'assistant',
          text: 'Извините, произошла ошибка связи с сервером. Пожалуйста, попробуйте повторить вопрос немного позже.',
          timestamp: new Date(),
          provider: 'error'
        };
        this.messages.update(prev => [...prev, errorMsg]);
        this.isLoading.set(false);
        this.shouldScrollBottom = true;
      }
    });
  }

  openKeyModal(): void {
    this.keyInputValue.set(this.apiKey());
    this.keySavedNotice.set(null);
    this.isKeyModalOpen.set(true);
  }

  closeKeyModal(): void {
    this.isKeyModalOpen.set(false);
  }

  saveApiKey(): void {
    const clean = this.keyInputValue().trim();
    this.aiService.setStoredApiKey(clean);
    this.apiKey.set(clean);
    this.keySavedNotice.set(clean ? 'Ключ Gemini 1.5 Flash успешно сохранен!' : 'Ключ удален. Активирован бесплатный встроенный движок.');
    setTimeout(() => {
      this.closeKeyModal();
    }, 1200);
  }

  removeApiKey(): void {
    this.aiService.clearStoredApiKey();
    this.apiKey.set('');
    this.keyInputValue.set('');
    this.keySavedNotice.set('Ключ удален. Активирован бесплатный встроенный движок.');
    setTimeout(() => {
      this.closeKeyModal();
    }, 1200);
  }

  clearChat(): void {
    this.initWelcomeMessage();
    this.shouldScrollBottom = true;
  }

  formatMarkdown(text: string): string {
    if (!text) return '';
    // Escaping html brackets
    let safe = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Bold **text**
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic *text*
    safe = safe.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Bullet points
    safe = safe.replace(/^• (.*?)$/gm, '<li class="bullet-item">$1</li>');
    safe = safe.replace(/((?:<li class="bullet-item">.*?<\/li>\s*)+)/g, '<ul class="bullet-list">$1</ul>');
    // Numbered lists 1. text
    safe = safe.replace(/^(\d+)\. (.*?)$/gm, '<li class="num-item"><span class="num-idx">$1.</span> $2</li>');
    safe = safe.replace(/((?:<li class="num-item">.*?<\/li>\s*)+)/g, '<ol class="num-list">$1</ol>');
    // Line breaks
    safe = safe.replace(/\n\n/g, '<div class="paragraph-gap"></div>');
    safe = safe.replace(/\n/g, '<br/>');

    return safe;
  }

  private scrollToBottom(): void {
    try {
      if (this.chatScrollContainer) {
        this.chatScrollContainer.nativeElement.scrollTop = this.chatScrollContainer.nativeElement.scrollHeight;
      }
    } catch {}
  }
}
