import { Injectable, signal } from '@angular/core';

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
    'app.login': { ru: 'Вход в систему', kz: 'Жүйеге кіру' },
    'app.logout': { ru: 'Выйти из системы', kz: 'Жүйеден шығу' },

    // Navigation
    'nav.employees': { ru: 'Сотрудники', kz: 'Қызметкерлер' },
    'nav.tasks': { ru: 'Задачи', kz: 'Тапсырмалар' },
    'nav.requests': { ru: 'Заявки', kz: 'Өтінімдер' },
    'nav.team': { ru: 'Моя команда', kz: 'Менің командам' },
    'nav.academy': { ru: 'Jana Academy', kz: 'Jana Academy' },
    'nav.ai': { ru: 'Jana AI', kz: 'Jana AI' },
    'nav.analytics': { ru: 'Аналитика', kz: 'Талдау' },

    // Roles
    'role.employee': { ru: 'Работник', kz: 'Қызметкер' },
    'role.manager': { ru: 'Руководитель', kz: 'Басшы' },
    'role.hr': { ru: 'HR-директор', kz: 'HR-директор' },

    // HR Employees
    'hr.title': { ru: 'Управление персоналом', kz: 'Персоналды басқару' },
    'hr.subtitle': { ru: 'Создание учетных записей сотрудников, распределение по отделам и контроль баланса отпусков', kz: 'Қызметкерлердің тіркелгілерін құру, бөлімдерге бөлу және демалыс қалдықтарын бақылау' },
    'hr.add_employee': { ru: 'Добавить сотрудника', kz: 'Қызметкер қосу' },
    'hr.total_employees': { ru: 'Всего сотрудников', kz: 'Барлық қызметкерлер' },
    'hr.supply_dept': { ru: 'Отдел поставок', kz: 'Жеткізу бөлімі' },
    'hr.logistics_dept': { ru: 'Логистика и склад', kz: 'Логистика және қойма' },
    'hr.it_dept': { ru: 'IT и поддержка', kz: 'IT және қолдау' },
    'hr.search_placeholder': { ru: 'Поиск по ФИО, ИИН или должности...', kz: 'Аты-жөні, ЖСН немесе лауазымы бойынша іздеу...' },
    'hr.filter_all_departments': { ru: 'Все отделы', kz: 'Барлық бөлімдер' },
    'hr.filter_all_roles': { ru: 'Все роли', kz: 'Барлық рөлдер' },
    'hr.col_name': { ru: 'ФИО / Должность', kz: 'Аты-жөні / Лауазымы' },
    'hr.col_iin': { ru: 'ИИН', kz: 'ЖСН' },
    'hr.col_role': { ru: 'Роль', kz: 'Рөлі' },
    'hr.col_dept': { ru: 'Подразделение', kz: 'Бөлімшесі' },
    'hr.col_vacation': { ru: 'Остаток отпуска', kz: 'Демалыс қалдығы' },
    'hr.col_date': { ru: 'Дата приема', kz: 'Қабылданған күні' },

    // Modal Add Employee
    'modal.add_title': { ru: 'Новый сотрудник компании', kz: 'Жаңа қызметкер қосу' },
    'modal.iin_label': { ru: 'ИИН сотрудника (12 цифр)', kz: 'Қызметкердің ЖСН (12 сан)' },
    'modal.iin_hint': { ru: 'ИИН используется для входа в платформу', kz: 'ЖСН платформаға кіру үшін пайдаланылады' },
    'modal.password_label': { ru: 'Первоначальный пароль', kz: 'Бастапқы құпиясөз' },
    'modal.name_label': { ru: 'ФИО (Фамилия Имя Отчество)', kz: 'Аты-жөні толық' },
    'modal.role_label': { ru: 'Роль в системе', kz: 'Жүйедегі рөлі' },
    'modal.dept_label': { ru: 'Подразделение (Отдел)', kz: 'Бөлімше (Бөлім)' },
    'modal.position_label': { ru: 'Должность', kz: 'Лауазымы' },
    'modal.vacation_label': { ru: 'Баланс отпуска (дней)', kz: 'Демалыс күндерінің қалдығы' },
    'modal.btn_cancel': { ru: 'Отмена', kz: 'Бас тарту' },
    'modal.btn_submit': { ru: 'Создать профиль', kz: 'Профиль құру' },
    'modal.success_msg': { ru: 'Профиль сотрудника успешно создан!', kz: 'Қызметкер профилі сәтті құрылды!' },

    // Notifications
    'notif.title': { ru: 'Уведомления', kz: 'Хабарламалар' },
    'notif.empty': { ru: 'Нет новых уведомлений', kz: 'Жаңа хабарламалар жоқ' },
    'notif.mark_all': { ru: 'Прочитать все', kz: 'Барлығын оқылды деп белгілеу' }
  };

  t(key: string): string {
    const item = this.dict[key];
    if (!item) return key;
    return item[this.currentLang()] || item.ru || key;
  }

  setLanguage(lang: Language): void {
    this.currentLang.set(lang);
  }

  toggleLanguage(): void {
    this.currentLang.set(this.currentLang() === 'ru' ? 'kz' : 'ru');
  }
}
