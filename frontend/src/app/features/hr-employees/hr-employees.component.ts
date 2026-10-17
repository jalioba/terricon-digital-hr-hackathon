import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { AuthService, User } from '../../core/services/auth.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { LoadingComponent } from '../../shared/components/loading/loading.component';

export interface Department {
  id: number;
  name_ru: string;
  name_kz: string;
  code: string;
}

@Component({
  selector: 'app-hr-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, LoadingComponent],
  templateUrl: './hr-employees.component.html',
  styleUrl: './hr-employees.component.scss'
})
export class HrEmployeesComponent implements OnInit {
  private api = inject(ApiService);
  authService = inject(AuthService);
  i18n = inject(I18nService);

  employees = signal<User[]>([]);
  departments = signal<Department[]>([]);
  isLoading = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  isModalOpen = signal<boolean>(false);
  showModalPassword = signal<boolean>(false);
  modalError = signal<string>('');
  createdCredentials = signal<{ iin: string; pass: string; name: string } | null>(null);

  // Filter signals for instant reactivity
  searchQuery = signal<string>('');
  selectedDept = signal<string>('all');
  selectedRole = signal<string>('all');

  newEmployee = {
    iin: '',
    password: '',
    full_name: '',
    role: 'employee' as 'employee' | 'manager',
    department_id: 1,
    company: 'JanaPost',
    position: '',
    vacation_days_left: 24
  };

  totalCount = computed(() => this.employees().length);
  supplyCount = computed(() => this.employees().filter((e) => e.dept_code === 'supply').length);
  logisticsCount = computed(() => this.employees().filter((e) => e.dept_code === 'logistics').length);
  itCount = computed(() => this.employees().filter((e) => e.dept_code === 'it_support').length);

  managerDeptId = computed(() => this.authService.currentUser()?.department_id ?? null);
  managerDepartmentName = computed(() => {
    const user = this.authService.currentUser();
    if (user?.dept_ru) return user.dept_ru;
    const deptId = user?.department_id;
    const dept = this.departments().find((d) => d.id === deptId);
    return dept ? (this.i18n.currentLang() === 'ru' ? dept.name_ru : dept.name_kz) : 'Мой отдел';
  });
  deptManagersCount = computed(() => this.employees().filter((e) => e.role === 'manager').length);
  deptEmployeesCount = computed(() => this.employees().filter((e) => e.role === 'employee').length);

  filteredEmployees = computed(() => {
    let list = this.employees();
    const q = this.searchQuery().trim().toLowerCase();
    const dept = this.selectedDept();
    const role = this.selectedRole();

    // 1. Search Query Filter
    if (q) {
      list = list.filter((e) =>
        (e.full_name && e.full_name.toLowerCase().includes(q)) ||
        (e.iin && e.iin.includes(q)) ||
        (e.position && e.position.toLowerCase().includes(q))
      );
    }

    // 2. Department Filter
    if (dept !== 'all') {
      const deptId = Number(dept);
      list = list.filter((e) => e.department_id === deptId);
    }

    // 3. Role Filter
    if (role !== 'all') {
      list = list.filter((e) => e.role === role);
    }

    return list;
  });

  ngOnInit(): void {
    this.loadDepartments();
    this.loadEmployees();
  }

  loadDepartments(): void {
    this.api.get<Department[]>('/departments').subscribe({
      next: (depts) => {
        this.departments.set(depts);
      },
      error: (err) => console.error('Failed to load departments', err)
    });
  }

  loadEmployees(): void {
    this.isLoading.set(true);
    this.api.get<User[]>('/hr/employees').subscribe({
      next: (data) => {
        this.employees.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load employees', err);
        this.isLoading.set(false);
      }
    });
  }

  refreshEmployees(): void {
    this.loadEmployees();
  }

  openAddModal(): void {
    const defaultDept = this.managerDeptId() || 1;
    this.newEmployee = {
      iin: '',
      password: '',
      full_name: '',
      role: 'employee',
      department_id: defaultDept,
      company: 'JanaPost',
      position: '',
      vacation_days_left: 24
    };
    this.generateRandomPassword();
    this.showModalPassword.set(true);
    this.modalError.set('');
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.modalError.set('');
  }

  togglePasswordVisibility(): void {
    this.showModalPassword.update((v) => !v);
  }

  generateRandomPassword(): void {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.newEmployee.password = `JanaPost#${code}`;
  }

  dismissCredentialsAlert(): void {
    this.createdCredentials.set(null);
  }

  onCreateEmployee(): void {
    const cleanIin = this.newEmployee.iin.trim();
    const cleanName = this.newEmployee.full_name.trim();
    const cleanPass = this.newEmployee.password.trim();
    const cleanPos = this.newEmployee.position.trim();

    if (cleanIin.length !== 12 || !/^\d{12}$/.test(cleanIin)) {
      this.modalError.set('ИИН должен состоять ровно из 12 цифр');
      return;
    }

    if (!cleanPass || cleanPass.length < 6) {
      this.modalError.set('Пароль сотрудника должен содержать не менее 6 символов');
      return;
    }

    if (!cleanName) {
      this.modalError.set('Укажите полное ФИО (Фамилия Имя Отчество)');
      return;
    }

    if (cleanName.split(/\s+/).length < 2) {
      this.modalError.set('Пожалуйста, укажите полное ФИО (минимум Фамилия и Имя)');
      return;
    }

    if (!cleanPos) {
      this.modalError.set('Укажите должность сотрудника');
      return;
    }

    this.isSubmitting.set(true);
    this.modalError.set('');

    const payload = {
      iin: cleanIin,
      password: cleanPass,
      full_name: cleanName,
      role: this.newEmployee.role,
      department_id: Number(this.newEmployee.department_id),
      company: 'JanaPost',
      position: cleanPos,
      vacation_days_left: Number(this.newEmployee.vacation_days_left) || 24
    };

    this.api.post<{ employee: User; message: string }>('/hr/employees', payload).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.createdCredentials.set({
          iin: cleanIin,
          pass: cleanPass,
          name: cleanName
        });
        this.closeModal();
        this.loadEmployees();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        let serverError = '';
        if (typeof err?.error === 'string') {
          try {
            const parsed = JSON.parse(err.error);
            serverError = parsed.error || err.error;
          } catch {
            serverError = err.error;
          }
        } else if (err?.error?.error) {
          serverError = err.error.error;
        }

        if (err?.status === 403 || serverError.includes('insufficient role permissions')) {
          this.modalError.set(
            'Недостаточно прав (403 Forbidden). Текущий аккаунт не имеет прав HR или Руководителя. Войдите под учетной записью HR-директора (ИИН 880101300555, пароль JanaMen2026!).'
          );
        } else if (err?.status === 409 || serverError.includes('уже зарегистрирован') || serverError.includes('duplicate')) {
          this.modalError.set('Сотрудник с таким ИИН уже зарегистрирован в системе.');
        } else {
          this.modalError.set(serverError || 'Не удалось создать сотрудника. Проверьте введенные данные.');
        }
      }
    });
  }

  getInitials(name: string): string {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
}
