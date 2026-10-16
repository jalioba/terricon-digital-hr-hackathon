import { Injectable, signal, computed, inject } from '@angular/core';
import { ApiService } from './api.service';

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: 'employee' | 'manager' | 'hr_admin';
  department_id?: number;
  manager_id?: number;
  company: string;
  position: string;
  hired_at: string;
  vacation_days_left: number;
  locale: string;
}

export interface DemoUserOption {
  id: number;
  email: string;
  full_name: string;
  role: 'employee' | 'manager' | 'hr_admin';
  position: string;
  dept_ru?: string;
  dept_kz?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private api = inject(ApiService);

  currentUser = signal<User | null>(null);
  token = signal<string | null>(null);

  // Pre-configured demo users for instant 1-click testing
  demoUsers = signal<DemoUserOption[]>([
    {
      id: 5,
      email: 'employee.supply@janamen.kz',
      full_name: 'Алия Бекова',
      role: 'employee',
      position: 'Специалист по поставкам',
      dept_ru: 'Отдел поставок заказов',
      dept_kz: 'Тапсырыстарды жеткізу бөлімі'
    },
    {
      id: 2,
      email: 'manager.supply@janamen.kz',
      full_name: 'Ерлан Нұрланов',
      role: 'manager',
      position: 'Руководитель отдела поставок',
      dept_ru: 'Отдел поставок заказов',
      dept_kz: 'Тапсырыстарды жеткізу бөлімі'
    },
    {
      id: 1,
      email: 'hr@janamen.kz',
      full_name: 'Айгерим Сатпаева',
      role: 'hr_admin',
      position: 'HR-директор',
      dept_ru: 'Управление персоналом',
      dept_kz: 'Персоналды басқару'
    }
  ]);

  isLoggedIn = computed(() => !!this.currentUser());
  isEmployee = computed(() => this.currentUser()?.role === 'employee');
  isManager = computed(() => this.currentUser()?.role === 'manager');
  isHrAdmin = computed(() => this.currentUser()?.role === 'hr_admin');

  constructor() {
    this.restoreSession();
  }

  private restoreSession() {
    if (typeof localStorage !== 'undefined') {
      const savedToken = localStorage.getItem('janamen_token');
      const savedUser = localStorage.getItem('janamen_user');
      if (savedToken && savedUser) {
        try {
          this.token.set(savedToken);
          this.currentUser.set(JSON.parse(savedUser));
        } catch {
          this.loginAsDemo(5);
        }
      } else {
        // Default login as Employee (Алия Бекова) for zero-click immediate demo experience!
        this.loginAsDemo(5);
      }
    }
  }

  loginAsDemo(userId: number) {
    this.api.post<{ token: string; user: User }>('/auth/demo-login', { user_id: userId })
      .subscribe({
        next: (res) => {
          this.setSession(res.token, res.user);
        },
        error: () => {
          // Robust client-side fallback if backend is offline
          const found = this.demoUsers().find(u => u.id === userId) || this.demoUsers()[0];
          const mockUser: User = {
            id: found.id,
            email: found.email,
            full_name: found.full_name,
            role: found.role,
            department_id: found.id === 1 ? undefined : 1,
            company: 'JanaPost',
            position: found.position,
            hired_at: '2022-06-01',
            vacation_days_left: 24,
            locale: 'ru'
          };
          this.setSession('demo-offline-jwt-token', mockUser);
        }
      });
  }

  setSession(token: string, user: User) {
    this.token.set(token);
    this.currentUser.set(user);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('janamen_token', token);
      localStorage.setItem('janamen_user', JSON.stringify(user));
    }
  }

  logout() {
    this.token.set(null);
    this.currentUser.set(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('janamen_token');
      localStorage.removeItem('janamen_user');
    }
  }
}
