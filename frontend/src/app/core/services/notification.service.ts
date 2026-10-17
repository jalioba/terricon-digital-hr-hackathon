import { Injectable, signal, inject } from '@angular/core';
import { ApiService } from './api.service';

export interface NotificationItem {
  id: number;
  user_id: number;
  kind: string;
  title?: string;
  message?: string;
  title_ru?: string;
  title_kz?: string;
  link: string;
  read: boolean;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private api = inject(ApiService);

  notifications = signal<NotificationItem[]>([
    {
      id: 1,
      user_id: 0,
      kind: 'course',
      title: 'Вам назначен обязательный курс «Информационная безопасность»',
      title_ru: 'Вам назначен обязательный курс «Информационная безопасность»',
      title_kz: 'Сізге «Ақпараттық қауіпсіздік» міндетті курсы тағайындалды',
      message: 'Пройдите тестирование в разделе Jana Academy',
      link: '/academy',
      read: false,
      created_at: new Date().toISOString()
    },
    {
      id: 2,
      user_id: 0,
      kind: 'system',
      title: 'Добро пожаловать в единую HR-платформу JanaMen!',
      title_ru: 'Добро пожаловать в единую HR-платформу JanaMen!',
      title_kz: 'JanaMen бірыңғай HR-платформасына қош келдіңіз!',
      message: 'Все кадровые процессы, задачи и заявки в одном месте',
      link: '/tasks',
      read: false,
      created_at: new Date(Date.now() - 3600000).toISOString()
    }
  ]);

  unreadCount = signal<number>(2);

  loadNotifications() {
    this.api.get<{ notifications: NotificationItem[]; unread_count: number }>('/notifications')
      .subscribe({
        next: (res) => {
          if (res && res.notifications) {
            // If backend has notifications, use them; if empty, keep initial helpful onboarding notifications
            if (res.notifications.length > 0) {
              this.notifications.set(res.notifications);
              this.unreadCount.set(res.unread_count);
            }
          }
        },
        error: () => {
          // Keep current in-memory notifications
        }
      });
  }

  markAsRead(id: number) {
    this.notifications.update(items =>
      items.map(n => n.id === id ? { ...n, read: true } : n)
    );
    this.unreadCount.update(c => Math.max(0, c - 1));
    this.api.put(`/notifications/${id}/read`, {}).subscribe({ error: () => {} });
  }

  markAllAsRead() {
    this.notifications.update(items => items.map(n => ({ ...n, read: true })));
    this.unreadCount.set(0);
    this.api.put('/notifications/read-all', {}).subscribe({ error: () => {} });
  }

  addLocalNotification(kind: string, titleRu: string, titleKz: string, link: string = '') {
    const item: NotificationItem = {
      id: Date.now(),
      user_id: 0,
      kind,
      title: titleRu,
      title_ru: titleRu,
      title_kz: titleKz,
      link,
      read: false,
      created_at: new Date().toISOString()
    };
    this.notifications.update(items => [item, ...items]);
    this.unreadCount.update(c => c + 1);
  }

  getNotificationTitle(item: NotificationItem, lang: string = 'ru'): string {
    if (lang === 'kz' && item.title_kz) return item.title_kz;
    if (item.title_ru) return item.title_ru;
    if (item.title) return item.title;
    return item.message || 'Уведомление';
  }
}
