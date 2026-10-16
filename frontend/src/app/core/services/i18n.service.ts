import { Injectable, signal, computed } from '@angular/core';

export type Language = 'ru' | 'kz';

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  currentLang = signal<Language>('ru');

  private dict: Record<string, { ru: string; kz: string }> = {
    // Brand & App
    'app.name': { ru: 'JanaMen', kz: 'JanaMen' },
    'app.tagline': { ru: 'Единая HR-платформа JanaPost', kz: 'JanaPost бірыңғай HR-платформасы' },
    'app.switch_role': { ru: 'Переключить демо-роль', kz: 'Демо-рөлді ауыстыру' },

    // Navigation
    'nav.dashboard': { ru: 'Дашборд', kz: 'Басты бет' },
    'nav.profile': { ru: 'Личный кабинет', kz: 'Жеке кабинет' },
    'nav.requests': { ru: 'Мои заявки', kz: 'Менің өтінімдерім' },
    'nav.approvals': { ru: 'Согласование заявок', kz: 'Өтінімдерді келісу' },
    'nav.team': { ru: 'Мой отдел и задачи', kz: 'Бөлім және тапсырмалар' },
    'nav.academy': { ru: 'Jana Academy', kz: 'Jana Academy' },
    'nav.ai': { ru: 'AI Jana Ассистент', kz: 'AI Jana Көмекшісі' },
    'nav.admin': { ru: 'HR Аналитика', kz: 'HR Талдау' },
    'nav.logout': { ru: 'Выйти', kz: 'Шығу' },

    // Roles
    'role.employee': { ru: 'Работник', kz: 'Қызметкер' },
    'role.manager': { ru: 'Руководитель', kz: 'Басшы' },
    'role.hr_admin': { ru: 'HR / Администратор', kz: 'HR / Әкімші' },

    // Dashboard
    'dash.welcome': { ru: 'С возвращением', kz: 'Қош келдіңіз' },
    'dash.quick_actions': { ru: 'Быстрые кадровые сервисы', kz: 'Жылдам кадрлық қызметтер' },
    'dash.apply_vacation': { ru: 'Заявка на отпуск', kz: 'Демалысқа өтінім' },
    'dash.apply_advance': { ru: 'Заявка на аванс', kz: 'Авансқа өтінім' },
    'dash.open_academy': { ru: 'Начать обучение', kz: 'Оқуды бастау' },
    'dash.ask_ai': { ru: 'Спросить AI Jana', kz: 'AI Jana-дан сұрау' },
    'dash.vacation_balance': { ru: 'Остаток дней отпуска', kz: 'Демалыс күндерінің қалдығы' },
    'dash.days': { ru: 'дней', kz: 'күн' },
    'dash.official_1c': { ru: 'Официальные данные из 1С:ЗУП (только чтение)', kz: '1С:ЗУП ресми деректері (тек оқу)' },
    'dash.active_requests': { ru: 'Активные заявки', kz: 'Белсенді өтінімдер' },
    'dash.assigned_tasks': { ru: 'Поручения и задачи отдела', kz: 'Бөлім тапсырмалары мен міндеттері' },
    'dash.my_courses': { ru: 'Назначенное обучение', kz: 'Тағайындалған оқыту' },
    'dash.no_tasks': { ru: 'Нет открытых задач', kz: 'Ашық тапсырмалар жоқ' },
    'dash.no_requests': { ru: 'Нет активных заявок', kz: 'Белсенді өтінімдер жоқ' },

    // Requests
    'req.title': { ru: 'Реестр кадровых заявок', kz: 'Кадрлық өтінімдер тізілімі' },
    'req.type': { ru: 'Тип заявки', kz: 'Өтінім түрі' },
    'req.type_vacation': { ru: 'Оплачиваемый отпуск', kz: 'Ақылы демалыс' },
    'req.type_advance': { ru: 'Внеочередной аванс', kz: 'Кезектен тыс аванс' },
    'req.status': { ru: 'Статус', kz: 'Күйі' },
    'req.created_at': { ru: 'Дата подачи', kz: 'Берілген күні' },
    'req.applicant': { ru: 'Сотрудник', kz: 'Қызметкер' },
    'req.period': { ru: 'Период', kz: 'Мерзімі' },
    'req.amount': { ru: 'Сумма', kz: 'Сомасы' },
    'req.days_count': { ru: 'Количество дней', kz: 'Күндер саны' },
    'req.create_btn': { ru: 'Подать новую заявку', kz: 'Жаңа өтінім беру' },
    'req.timeline': { ru: 'Маршрут и история согласования', kz: 'Келісу бағыты мен тарихы' },

    // Statuses
    'status.created': { ru: 'Создана', kz: 'Құрылды' },
    'status.pending_manager': { ru: 'На согласовании у руководителя', kz: 'Басшының келісуінде' },
    'status.approved': { ru: 'Одобрена руководителем', kz: 'Басшы мақұлдады' },
    'status.sent_documentolog': { ru: 'Отправлена в Documentolog', kz: 'Documentolog-қа жіберілді' },
    'status.completed': { ru: 'Проведена в 1С:ЗУП', kz: '1С:ЗУП-та өткізілді' },
    'status.rejected': { ru: 'Отклонена', kz: 'Қабылданбады' },

    // Academy
    'academy.title': { ru: 'Корпоративная академия Jana Academy', kz: 'Jana Academy корпоративтік академиясы' },
    'academy.subtitle': { ru: 'Обучение стандартам сервиса и безопасности JanaPost', kz: 'JanaPost сервис және қауіпсіздік стандарттары бойынша оқыту' },
    'academy.start_test': { ru: 'Сдать итоговый тест', kz: 'Қорытынды тест тапсыру' },
    'academy.passed': { ru: 'Курс завершён', kz: 'Курс аяқталды' },
    'academy.progress': { ru: 'Прогресс', kz: 'Прогресс' },
    'academy.score': { ru: 'Результат теста', kz: 'Тест нәтижесі' },
    'academy.congrats': { ru: 'Поздравляем! Знания успешно подтверждены', kz: 'Құттықтаймыз! Білім сәтті расталды' },

    // AI Assistant
    'ai.title': { ru: 'AI Jana — Корпоративный HR-ассистент', kz: 'AI Jana — Корпоративтік HR-көмекшісі' },
    'ai.subtitle': { ru: 'Строгие ответы по базе знаний JanaPost без галлюцинаций', kz: 'JanaPost білім базасы бойынша қатаң әрі нақты жауаптар' },
    'ai.placeholder': { ru: 'Задайте вопрос по отпускам, авансам, регламентам...', kz: 'Демалыс, аванс, ережелер бойынша сұрақ қойыңыз...' },
    'ai.send': { ru: 'Спросить', kz: 'Сұрау' },
    'ai.source': { ru: 'Официальный регламент-источник', kz: 'Ресми нормативтік дереккөз' },
    'ai.escalate': { ru: 'Создать обращение в HR', kz: 'HR-ге ресми сұраныс жолдау' },
    'ai.settings': { ru: 'Настройки движка AI', kz: 'AI қозғалтқышының баптаулары' },

    // Notifications
    'notif.title': { ru: 'Центр уведомлений', kz: 'Хабарландырулар орталығы' },
    'notif.mark_all': { ru: 'Прочитать все', kz: 'Барлығын оқылды деп белгілеу' },
    'notif.empty': { ru: 'У вас нет новых уведомлений', kz: 'Сізде жаңа хабарландырулар жоқ' },

    // Common
    'btn.cancel': { ru: 'Отмена', kz: 'Бас тарту' },
    'btn.submit': { ru: 'Отправить', kz: 'Жіберу' },
    'btn.approve': { ru: 'Одобрить', kz: 'Мақұлдау' },
    'btn.reject': { ru: 'Отклонить', kz: 'Қабылдамау' },
    'btn.close': { ru: 'Закрыть', kz: 'Жабу' },
  };

  setLanguage(lang: Language) {
    this.currentLang.set(lang);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('janamen_lang', lang);
    }
  }

  t(key: string): string {
    const entry = this.dict[key];
    if (!entry) return key;
    return entry[this.currentLang()];
  }
}
