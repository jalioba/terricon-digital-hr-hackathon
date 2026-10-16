import { Injectable, signal, inject } from '@angular/core';
import { ApiService } from './api.service';

export interface NotificationItem {
  id: number;
  user_id: number;
  kind: string;
  title_ru: string;
  title_kz: string;
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
      user_id: 5,
      kind: 'course',
      title_ru: 'Вам назначен обязательный курс «Информационная безопасность»',
      title_kz: 'Сізге «Ақпараттық қауіпсіздік» міндетті курсы тағайындалды',
      link: '/academy/1',
      read: false,
      created_at: new Date().toISOString()
    },
    {
      id: 2,
      user_id: 5,
      kind: 'system',
      title_ru: 'Добро пожаловать в единую HR-платформу JanaMen!',
      title_kz: 'JanaMen бірыңғай HR-платформасына қош келдіңіз!',
      link: '/dashboard',
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
            this.notifications.set(res.notifications);
            this.unreadCount.set(res.unread_count);
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
      title_ru: titleRu,
      title_kz: titleKz,
      link,
      read: false,
      created_at: new Date().toISOString()
    };
    this.notifications.update(items => [item, ...items]);
    this.unreadCount.update(c => c + 1);
  }
}
