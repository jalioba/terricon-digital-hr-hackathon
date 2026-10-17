import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';

export interface TourStep {
  id: string;
  route: string;
  targetSelector: string;
  titleRu: string;
  titleKz: string;
  descriptionRu: string;
  descriptionKz: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  role?: 'employee' | 'manager' | 'all';
}

@Injectable({
  providedIn: 'root',
})
export class OnboardingTourService {
  private router = inject(Router);

  // Tour State Signals
  readonly isActive = signal<boolean>(false);
  readonly currentStepIndex = signal<number>(0);
  readonly activeRole = signal<'employee' | 'manager'>('employee');
  readonly targetRect = signal<DOMRect | null>(null);

  // Observable and signal trigger when user finishes the tour
  readonly tourCompleted$ = new Subject<{ role: 'employee' | 'manager' }>();
  readonly tourCompletedSignal = signal<number>(0);

  // Employee onboarding steps
  private readonly employeeSteps: TourStep[] = [
    {
      id: 'academy-intro',
      route: '/academy',
      targetSelector: '[data-tour="academy-track-platform"]',
      titleRu: 'Добро пожаловать в JanaMen!',
      titleKz: 'JanaMen жүйесіне қош келдіңіз!',
      descriptionRu:
        'Вы находитесь в корпоративном университете Jana Academy. Давайте совершим краткий тур по вашим рабочим инструментам платформы.',
      descriptionKz:
        'Сіз Jana Academy корпоративтік университетіндесіз. Платформаның негізгі құралдарымен танысу үшін интерактивті турды бастайық.',
      placement: 'bottom',
    },
    {
      id: 'tasks-board',
      route: '/tasks',
      targetSelector: '[data-tour="tasks-kanban-board"]',
      titleRu: 'Канбан-доска рабочих задач',
      titleKz: 'Жұмыс тапсырмаларының канбан-тақтасы',
      descriptionRu:
        'Все ваши задания распределены по 4 стадиям: «К выполнению», «В работе», «На проверке» и «Завершено». Никаких потерянных поручений.',
      descriptionKz:
        'Барлық тапсырмалар 4 кезеңге бөлінген: «Орындауға», «Жұмыста», «Тексеруде» және «Аяқталды».',
      placement: 'bottom',
    },
    {
      id: 'tasks-actions',
      route: '/tasks',
      targetSelector: '[data-tour="task-action-btn"]',
      titleRu: 'Быстрые действия с задачей',
      titleKz: 'Тапсырмамен жылдам әрекеттер',
      descriptionRu:
        'Нажмите «Начать», чтобы взять задачу в работу. По готовности нажмите «Задача готова» — она моментально отправится руководителю на проверку.',
      descriptionKz:
        'Тапсырманы орындауды бастау үшін «Бастау» батырмасын басыңыз. Дайын болғанда «Тапсырма дайын» басып, жетекшіге тексеруге жіберіңіз.',
      placement: 'top',
    },
    {
      id: 'requests-create',
      route: '/requests',
      targetSelector: '[data-tour="requests-create-btn"]',
      titleRu: 'Кадровые заявки в 2 клика',
      titleKz: 'Кадрлық өтініштер 2 басуда',
      descriptionRu:
        'Оформляйте отпуска, заказывайте справки с места работы, больничные и авансы напрямую без очередей и бумажных бланков.',
      descriptionKz:
        'Еңбек демалысын ресімдеңіз, жұмыс орнынан анықтама, аурухана парағын немесе авансқа өтінішті қағазсыз тікелей жіберіңіз.',
      placement: 'bottom',
    },
    {
      id: 'ai-chat',
      route: '/ai',
      targetSelector: '[data-tour="ai-chat-input"]',
      titleRu: 'Персональный Jana AI',
      titleKz: 'Жеке Jana AI көмекшісі',
      descriptionRu:
        'Ваш умный ассистент ответит на любые вопросы по Трудовому кодексу РК, внутренним регламентам JanaPost, льготам и графику отпусков 24/7.',
      descriptionKz:
        'ҚР Еңбек кодексі, JanaPost ішкі регламенттері мен демалыс кестесі бойынша кез келген сұрағыңызға тәулік бойы жауап береді.',
      placement: 'top',
    },
    {
      id: 'header-profile',
      route: '/ai',
      targetSelector: '[data-tour="header-actions"]',
      titleRu: 'Уведомления и профиль',
      titleKz: 'Хабарламалар және профиль',
      descriptionRu:
        'Следите за оповещениями о статусах задач и согласований, переключайте язык интерфейса (RU / KZ) и управляйте личными данными.',
      descriptionKz:
        'Тапсырмалар мен өтініштер мәртебесі туралы хабарламаларды бақылаңыз, тілді (RU / KZ) ауыстырыңыз.',
      placement: 'bottom',
    },
    {
      id: 'academy-finish',
      route: '/academy',
      targetSelector: '[data-tour="academy-track-job"]',
      titleRu: 'Онбординг успешно завершен! 🎉',
      titleKz: 'Онбординг сәтті аяқталды! 🎉',
      descriptionRu:
        'Поздравляем! Вы освоили весь базовый функционал системы. Программа 1 завершена на 100%, теперь вам открыта Программа 2 с профессиональными курсами.',
      descriptionKz:
        'Құттықтаймыз! Сіз платформаның барлық мүмкіндіктерін меңгердіңіз. 1-бағдарлама 100% аяқталды, енді 2-бөлімге өте аласыз.',
      placement: 'top',
    },
  ];

  // Manager onboarding steps
  private readonly managerSteps: TourStep[] = [
    {
      id: 'academy-intro-mgr',
      route: '/academy',
      targetSelector: '[data-tour="academy-track-platform"]',
      titleRu: 'Управленческий онбординг JanaMen',
      titleKz: 'JanaMen басқарушылық онбордингі',
      descriptionRu:
        'Добро пожаловать, руководитель! Давайте кратко познакомимся с инструментами управления командой и контроля задач подразделения.',
      descriptionKz:
        'Қош келдіңіз, құрметті жетекші! Бөлім тапсырмаларын және қызметкерлерді басқару құралдарымен танысайық.',
      placement: 'bottom',
    },
    {
      id: 'tasks-board-mgr',
      route: '/tasks',
      targetSelector: '[data-tour="tasks-kanban-board"]',
      titleRu: 'Контроль задач подразделения',
      titleKz: 'Бөлімше тапсырмаларын бақылау',
      descriptionRu:
        'Полная картина по задачам сотрудников вашего отдела: назначайте исполнителей, следите за сроками и ставьте новые задачи подразделению.',
      descriptionKz:
        'Бөлім қызметкерлерінің тапсырмалары бойынша толық көрініс: орындаушыларды тағайындаңыз және жаңа міндеттер қойыңыз.',
      placement: 'bottom',
    },
    {
      id: 'tasks-review-mgr',
      route: '/tasks',
      targetSelector: '[data-tour="task-review-actions"]',
      titleRu: 'Согласование выполненной работы',
      titleKz: 'Орындалған жұмысты мақұлдау',
      descriptionRu:
        'В колонке «На проверке» вы можете принять результат работы сотрудника («Подтвердить») либо вернуть с замечанием («На перевыполнение»).',
      descriptionKz:
        '«Тексеруде» бағанында сіз қызметкер жұмысын қабылдай аласыз («Мақұлдау») немесе ескертумен қайтара аласыз («Қайта орындауға»).',
      placement: 'top',
    },
    {
      id: 'requests-mgr',
      route: '/requests',
      targetSelector: '[data-tour="requests-create-btn"]',
      titleRu: 'Кадровые процессы отдела',
      titleKz: 'Бөлімнің кадрлық үдерістері',
      descriptionRu:
        'Оперативно рассматривайте и согласовывайте заявления подчиненных на отпуска, справки и командировки прямо в едином окне.',
      descriptionKz:
        'Бағынышты қызметкерлердің демалыс, анықтама және іссапар туралы өтініштерін бірыңғай терезеде жылдам қараңыз.',
      placement: 'bottom',
    },
    {
      id: 'ai-mgr',
      route: '/ai',
      targetSelector: '[data-tour="ai-chat-input"]',
      titleRu: 'Jana AI для руководителя',
      titleKz: 'Жетекшіге арналған Jana AI',
      descriptionRu:
        'Помощник составит проекты служебных записок, должностные инструкции, отчеты и проконсультирует по трудовым нормам РК.',
      descriptionKz:
        'Қызметтік жазбалар, лауазымдық нұсқаулықтар мен есептерді дайындауға және заңнамалық кеңес алуға көмектеседі.',
      placement: 'top',
    },
    {
      id: 'academy-finish-mgr',
      route: '/academy',
      targetSelector: '[data-tour="academy-track-platform"]',
      titleRu: 'Онбординг руководителя завершен! 🎉',
      titleKz: 'Жетекші онбордингі аяқталды! 🎉',
      descriptionRu:
        'Вы готовы к эффективной координации рабочих процессов в цифровой среде JanaMen. Программа онбординга закрыта на 100%!',
      descriptionKz:
        'Сіз JanaMen цифрлық ортасында жұмыс үдерістерін басқаруға дайынсыз. Онбординг бағдарламасы 100% аяқталды!',
      placement: 'bottom',
    },
  ];

  // Steps for active role
  readonly steps = computed<TourStep[]>(() => {
    return this.activeRole() === 'manager' ? this.managerSteps : this.employeeSteps;
  });

  readonly currentStep = computed<TourStep | null>(() => {
    const list = this.steps();
    const idx = this.currentStepIndex();
    return list[idx] || null;
  });

  readonly isLastStep = computed<boolean>(() => {
    return this.currentStepIndex() >= this.steps().length - 1;
  });

  readonly isFirstStep = computed<boolean>(() => {
    return this.currentStepIndex() === 0;
  });

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.updateTargetRect());
      window.addEventListener('scroll', () => this.updateTargetRect(), true);
    }
  }

  startTour(role: 'employee' | 'manager' = 'employee'): void {
    this.activeRole.set(role);
    this.currentStepIndex.set(0);
    this.isActive.set(true);
    this.goToStep(0);
  }

  goToStep(index: number): void {
    const list = this.steps();
    if (index < 0 || index >= list.length) {
      return;
    }

    this.currentStepIndex.set(index);
    const step = list[index];

    // Check if we need to navigate to another route
    const currentUrl = this.router.url.split('?')[0];
    if (currentUrl !== step.route) {
      this.targetRect.set(null);
      this.router.navigate([step.route]).then(() => {
        // Wait for DOM to render after route change
        setTimeout(() => this.locateAndHighlightTarget(step), 350);
      });
    } else {
      setTimeout(() => this.locateAndHighlightTarget(step), 100);
    }
  }

  nextStep(): void {
    if (this.isLastStep()) {
      this.completeTour();
    } else {
      this.goToStep(this.currentStepIndex() + 1);
    }
  }

  prevStep(): void {
    if (!this.isFirstStep()) {
      this.goToStep(this.currentStepIndex() - 1);
    }
  }

  skipTour(): void {
    this.isActive.set(false);
    this.targetRect.set(null);
  }

  completeTour(): void {
    const role = this.activeRole();
    this.isActive.set(false);
    this.targetRect.set(null);
    this.tourCompletedSignal.update((n) => n + 1);
    this.tourCompleted$.next({ role });
  }

  updateTargetRect(): void {
    if (!this.isActive()) return;
    const step = this.currentStep();
    if (!step) return;

    const el = document.querySelector(step.targetSelector);
    if (el) {
      const rect = el.getBoundingClientRect();
      this.targetRect.set(rect);
    } else {
      this.targetRect.set(null);
    }
  }

  private locateAndHighlightTarget(step: TourStep, retryCount = 0): void {
    if (!this.isActive()) return;

    const el = document.querySelector(step.targetSelector) as HTMLElement | null;
    if (el) {
      // Smoothly scroll element into visible area if needed
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

      // Allow a brief moment for scroll animation to settle
      setTimeout(() => {
        const rect = el.getBoundingClientRect();
        this.targetRect.set(rect);
      }, 250);
    } else if (retryCount < 5) {
      // Retry in 200ms if element is still rendering
      setTimeout(() => this.locateAndHighlightTarget(step, retryCount + 1), 200);
    } else {
      // Fallback: center in screen
      this.targetRect.set(null);
    }
  }
}
