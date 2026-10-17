import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

export interface UserProfileData {
  id: number;
  iin: string;
  full_name: string;
  role: 'employee' | 'manager' | 'hr';
  department_id: number | null;
  company: string;
  position: string;
  hired_at: string;
  vacation_days_left: number;
  created_at: string;
  dept_code?: string;
  dept_ru?: string;
  dept_kz?: string;
}

export interface MeResponse {
  profile: UserProfileData;
  zup_sync: string;
  zup_source: string;
  zup_read_only: boolean;
  zup_record?: any;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  private api = inject(ApiService);
  authService = inject(AuthService);
  i18n = inject(I18nService);

  profileData = signal<UserProfileData | null>(null);
  zupSource = signal<string>('1С:ЗУП ред. 3.1 КОРП');
  isZupSynced = signal<boolean>(true);
  isLoading = signal<boolean>(true);

  // Activity stats
  activeTasksCount = signal<number>(0);
  completedTasksCount = signal<number>(0);
  academyCompletedCount = signal<number>(0);

  // Password change form
  currentPassword = signal<string>('');
  newPassword = signal<string>('');
  confirmPassword = signal<string>('');
  showCurrentPass = signal<boolean>(false);
  showNewPass = signal<boolean>(false);
  isSubmittingPass = signal<boolean>(false);
  passwordError = signal<string | null>(null);
  passwordSuccess = signal<string | null>(null);

  userInitials = computed(() => {
    const prof = this.profileData();
    if (!prof || !prof.full_name) return 'JM';
    const parts = prof.full_name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  });

  tenureText = computed(() => {
    const prof = this.profileData();
    if (!prof || !prof.hired_at) return '1 год';
    const hireDate = new Date(prof.hired_at);
    const now = new Date();

    let months = (now.getFullYear() - hireDate.getFullYear()) * 12 + (now.getMonth() - hireDate.getMonth());
    if (months < 1) return 'Менее месяца';

    const years = Math.floor(months / 12);
    const remMonths = months % 12;

    if (years === 0) {
      return `${remMonths} мес.`;
    }
    if (remMonths === 0) {
      return `${years} г.`;
    }
    return `${years} г. ${remMonths} мес.`;
  });

  vacationPercent = computed(() => {
    const prof = this.profileData();
    if (!prof) return 100;
    const days = Math.max(0, Math.min(24, prof.vacation_days_left));
    return Math.round((days / 24) * 100);
  });

  ngOnInit(): void {
    this.loadProfile();
    this.loadStats();
  }

  loadProfile(): void {
    this.isLoading.set(true);
    this.api.get<MeResponse>('/me').subscribe({
      next: (res) => {
        if (res && res.profile) {
          this.profileData.set(res.profile);
          if (res.zup_source) {
            this.zupSource.set(res.zup_source);
          }
          this.isZupSynced.set(res.zup_sync === 'synced');
        }
        this.isLoading.set(false);
      },
      error: () => {
        // Fallback to authService user if /me errors
        const u = this.authService.currentUser();
        if (u) {
          this.profileData.set({
            id: u.id,
            iin: u.iin,
            full_name: u.full_name,
            role: u.role,
            department_id: u.department_id ?? null,
            company: 'JanaPost',
            position: u.position || 'Специалист',
            hired_at: '2023-01-10',
            vacation_days_left: u.vacation_days_left || 24,
            created_at: new Date().toISOString(),
            dept_ru: u.dept_ru
          });
        }
        this.isLoading.set(false);
      }
    });
  }

  loadStats(): void {
    // Load tasks stats
    this.api.get<any[]>('/tasks').subscribe({
      next: (tasks) => {
        if (Array.isArray(tasks)) {
          const active = tasks.filter(t => t.status === 'in_progress' || t.status === 'todo').length;
          const done = tasks.filter(t => t.status === 'done').length;
          this.activeTasksCount.set(active);
          this.completedTasksCount.set(done);
        }
      },
      error: () => {}
    });

    // Load academy courses stats
    this.api.get<any[]>('/courses').subscribe({
      next: (courses) => {
        if (Array.isArray(courses)) {
          this.academyCompletedCount.set(courses.length > 0 ? 2 : 0);
        }
      },
      error: () => {}
    });
  }

  changePassword(): void {
    const cur = this.currentPassword().trim();
    const np = this.newPassword().trim();
    const conf = this.confirmPassword().trim();

    this.passwordError.set(null);
    this.passwordSuccess.set(null);

    if (!cur) {
      this.passwordError.set('Введите текущий пароль');
      return;
    }
    if (!np) {
      this.passwordError.set('Введите новый пароль');
      return;
    }
    if (np.length < 6) {
      this.passwordError.set('Новый пароль должен содержать минимум 6 символов');
      return;
    }
    if (np !== conf) {
      this.passwordError.set('Новый пароль и подтверждение не совпадают');
      return;
    }

    this.isSubmittingPass.set(true);

    this.api.put('/profile/password', {
      current_password: cur,
      new_password: np
    }).subscribe({
      next: () => {
        this.isSubmittingPass.set(false);
        this.passwordSuccess.set('Пароль успешно изменен! Используйте его для следующего входа.');
        this.currentPassword.set('');
        this.newPassword.set('');
        this.confirmPassword.set('');
      },
      error: (err) => {
        this.isSubmittingPass.set(false);
        const msg = err?.error?.error || 'Неверный текущий пароль или ошибка сохранения';
        this.passwordError.set(msg);
      }
    });
  }
}
