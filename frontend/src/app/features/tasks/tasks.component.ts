import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService, User } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { LoadingComponent } from '../../shared/components/loading/loading.component';
import { Department } from '../hr-employees/hr-employees.component';

export interface TaskItem {
  id: number;
  title: string;
  description: string;
  department_id: number;
  created_by: number;
  assigned_to: number | null;
  due_date: string | null;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  rework_comment?: string | null;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  assignee_name?: string | null;
  dept_name_ru?: string;
  dept_code?: string;
}

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, LoadingComponent],
  templateUrl: './tasks.component.html',
  styleUrl: './tasks.component.scss'
})
export class TasksComponent implements OnInit {
  private api = inject(ApiService);
  authService = inject(AuthService);
  i18n = inject(I18nService);

  tasks = signal<TaskItem[]>([]);
  departments = signal<Department[]>([]);
  teamMembers = signal<User[]>([]);
  isLoading = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);

  // View modes: 'kanban' or 'list'
  viewMode = signal<'kanban' | 'list'>('kanban');

  // Active filter tab: 'all' | 'todo' | 'in_progress' | 'review' | 'done' | 'unassigned'
  activeFilter = signal<'all' | 'todo' | 'in_progress' | 'review' | 'done' | 'unassigned'>('all');
  searchQuery = signal<string>('');
  selectedDepartment = signal<string>('all');

  // Notifications toast message
  actionToast = signal<string>('');

  // Modals state
  isModalOpen = signal<boolean>(false);
  isDetailModalOpen = signal<boolean>(false);
  selectedTask = signal<TaskItem | null>(null);
  modalError = signal<string>('');

  // Assign Worker Modal (Manager)
  isAssignModalOpen = signal<boolean>(false);
  taskToAssign = signal<TaskItem | null>(null);
  selectedAssigneeId = signal<number | null>(null);
  assignModalError = signal<string>('');

  // Rework Modal (Manager)
  isReworkModalOpen = signal<boolean>(false);
  taskForRework = signal<TaskItem | null>(null);
  reworkComment = signal<string>('');
  reworkModalError = signal<string>('');

  // New task form state
  newTask = {
    title: '',
    description: '',
    department_id: 1,
    assignee_id: null as number | null,
    due_date: ''
  };

  // Department employees (for Manager assignment: only employees in their department)
  departmentEmployees = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return [];
    if (this.authService.isManager()) {
      return this.teamMembers().filter(
        (m) => m.department_id === user.department_id && m.role === 'employee'
      );
    }
    return this.teamMembers().filter((m) => m.role === 'employee');
  });

  // Filtered tasks pipeline
  filteredTasks = computed(() => {
    let list = this.tasks();
    const query = this.searchQuery().trim().toLowerCase();
    const filter = this.activeFilter();
    const dept = this.selectedDepartment();

    // 1. Department filter (for HR)
    if (this.authService.isHr() && dept !== 'all') {
      const deptId = Number(dept);
      list = list.filter((t) => t.department_id === deptId);
    }

    // 2. Tab filter
    if (filter === 'todo') {
      list = list.filter((t) => t.status === 'todo');
    } else if (filter === 'in_progress') {
      list = list.filter((t) => t.status === 'in_progress');
    } else if (filter === 'review') {
      list = list.filter((t) => t.status === 'review');
    } else if (filter === 'done') {
      list = list.filter((t) => t.status === 'done');
    } else if (filter === 'unassigned') {
      list = list.filter((t) => !t.assigned_to);
    }

    // 3. Search query filter
    if (query) {
      list = list.filter((t) =>
        t.title.toLowerCase().includes(query) ||
        (t.description && t.description.toLowerCase().includes(query)) ||
        (t.assignee_name && t.assignee_name.toLowerCase().includes(query)) ||
        (t.creator_name && t.creator_name.toLowerCase().includes(query)) ||
        (t.dept_name_ru && t.dept_name_ru.toLowerCase().includes(query))
      );
    }

    return list;
  });

  // Kanban Stage Columns
  todoTasks = computed(() => this.filteredTasks().filter((t) => t.status === 'todo'));
  inProgressTasks = computed(() => this.filteredTasks().filter((t) => t.status === 'in_progress'));
  reviewTasks = computed(() => this.filteredTasks().filter((t) => t.status === 'review'));
  doneTasks = computed(() => this.filteredTasks().filter((t) => t.status === 'done'));

  totalCount = computed(() => this.tasks().length);
  unassignedCount = computed(() => this.tasks().filter((t) => !t.assigned_to).length);

  managerDepartmentName = computed(() => {
    const user = this.authService.currentUser();
    if (user?.dept_ru) return user.dept_ru;
    const dept = this.departments().find((d) => d.id === user?.department_id);
    return dept ? (this.i18n.currentLang() === 'ru' ? dept.name_ru : dept.name_kz) : 'Мой отдел';
  });

  ngOnInit(): void {
    this.loadDepartments();
    this.loadTeamMembers();
    this.loadTasks();
  }

  loadDepartments(): void {
    this.api.get<Department[]>('/departments').subscribe({
      next: (data) => this.departments.set(data || []),
      error: (err) => console.error('Failed to load departments', err)
    });
  }

  loadTeamMembers(): void {
    const endpoint = this.authService.isHr() ? '/hr/employees' : '/team';
    this.api.get<User[]>(endpoint).subscribe({
      next: (users) => this.teamMembers.set(users || []),
      error: (err) => console.error('Failed to load team members', err)
    });
  }

  loadTasks(): void {
    this.isLoading.set(true);
    let url = '/tasks';
    if (this.authService.isHr() && this.selectedDepartment() !== 'all') {
      url += `?department_id=${this.selectedDepartment()}`;
    }

    this.api.get<TaskItem[]>(url).subscribe({
      next: (data) => {
        this.tasks.set(data || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load tasks', err);
        this.tasks.set([]);
        this.isLoading.set(false);
      }
    });
  }

  onDepartmentChange(deptId: string): void {
    this.selectedDepartment.set(deptId);
    this.loadTasks();
  }

  showToast(message: string): void {
    this.actionToast.set(message);
    setTimeout(() => {
      this.actionToast.set('');
    }, 4000);
  }

  // ==========================================
  // EMPLOYEE ACTIONS
  // ==========================================

  // Работник: Начать задачу (todo -> in_progress)
  startTask(task: TaskItem): void {
    this.api.put(`/tasks/${task.id}/status`, { status: 'in_progress' }).subscribe({
      next: () => {
        this.tasks.update((list) =>
          list.map((t) => (t.id === task.id ? { ...t, status: 'in_progress' } : t))
        );
        if (this.selectedTask()?.id === task.id) {
          this.selectedTask.update((t) => (t ? { ...t, status: 'in_progress' } : null));
        }
        this.showToast('Задача взята в работу! Приступайте к выполнению.');
      },
      error: (err) => {
        console.error('Failed to start task', err);
        alert(err?.error?.error || 'Не удалось начать задачу.');
      }
    });
  }

  // Работник: Задача готова -> отправить руководителю на проверку (in_progress -> review)
  submitTaskToManager(task: TaskItem): void {
    this.api.put(`/tasks/${task.id}/status`, { status: 'review' }).subscribe({
      next: () => {
        this.tasks.update((list) =>
          list.map((t) => (t.id === task.id ? { ...t, status: 'review' } : t))
        );
        if (this.selectedTask()?.id === task.id) {
          this.selectedTask.update((t) => (t ? { ...t, status: 'review' } : null));
        }
        this.showToast('Задача отправлена руководителю на проверку.');
      },
      error: (err) => {
        console.error('Failed to submit task for review', err);
        alert(err?.error?.error || 'Не удалось отправить задачу на проверку.');
      }
    });
  }

  // ==========================================
  // MANAGER ACTIONS
  // ==========================================

  // Руководитель: Назначить исполнителя из своего отдела
  openAssignModal(task: TaskItem): void {
    this.taskToAssign.set(task);
    const workers = this.departmentEmployees();
    this.selectedAssigneeId.set(workers.length > 0 ? workers[0].id : null);
    this.assignModalError.set('');
    this.isAssignModalOpen.set(true);
  }

  closeAssignModal(): void {
    this.isAssignModalOpen.set(false);
    this.taskToAssign.set(null);
    this.selectedAssigneeId.set(null);
    this.assignModalError.set('');
  }

  submitAssignWorker(): void {
    const task = this.taskToAssign();
    const assigneeId = this.selectedAssigneeId();
    if (!task || !assigneeId) {
      this.assignModalError.set('Выберите сотрудника своего отдела.');
      return;
    }

    this.isSubmitting.set(true);
    this.assignModalError.set('');

    this.api.put(`/tasks/${task.id}/assign`, { assignee_id: assigneeId }).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.closeAssignModal();
        this.loadTasks();
        const worker = this.departmentEmployees().find((w) => w.id === assigneeId);
        this.showToast(
          `Сотрудник ${worker?.full_name || ''} назначен исполнителем. Уведомление отправлено.`
        );
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.assignModalError.set(err?.error?.error || 'Ошибка назначения исполнителя.');
      }
    });
  }

  // Руководитель: Подтвердить выполнение задачи (review -> done)
  approveTask(task: TaskItem): void {
    this.api.put(`/tasks/${task.id}/status`, { status: 'done' }).subscribe({
      next: () => {
        this.tasks.update((list) =>
          list.map((t) => (t.id === task.id ? { ...t, status: 'done', rework_comment: '' } : t))
        );
        if (this.selectedTask()?.id === task.id) {
          this.selectedTask.update((t) =>
            t ? { ...t, status: 'done', rework_comment: '' } : null
          );
        }
        this.showToast('Задача успешно подтверждена и закрыта.');
      },
      error: (err) => {
        console.error('Failed to approve task', err);
        alert(err?.error?.error || 'Ошибка подтверждения задачи.');
      }
    });
  }

  // Руководитель: Отправить на перевыполнение (review -> in_progress с комментарием)
  openReworkModal(task: TaskItem): void {
    this.taskForRework.set(task);
    this.reworkComment.set('');
    this.reworkModalError.set('');
    this.isReworkModalOpen.set(true);
  }

  closeReworkModal(): void {
    this.isReworkModalOpen.set(false);
    this.taskForRework.set(null);
    this.reworkComment.set('');
    this.reworkModalError.set('');
  }

  submitRework(): void {
    const task = this.taskForRework();
    const comment = this.reworkComment().trim();
    if (!task) return;
    if (!comment) {
      this.reworkModalError.set('Укажите комментарий или причину отправки на перевыполнение.');
      return;
    }

    this.isSubmitting.set(true);
    this.reworkModalError.set('');

    this.api
      .put(`/tasks/${task.id}/status`, {
        status: 'in_progress',
        rework_comment: comment
      })
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.closeReworkModal();
          this.loadTasks();
          this.showToast('Задача отправлена работнику на перевыполнение с вашими замечаниями.');
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.reworkModalError.set(err?.error?.error || 'Ошибка отправки на перевыполнение.');
        }
      });
  }

  // ==========================================
  // CREATE TASK (HR & MANAGER)
  // ==========================================
  openCreateModal(): void {
    const user = this.authService.currentUser();
    const defaultDept = user?.department_id || 1;

    // Set default due date to 5 days from now
    const d = new Date();
    d.setDate(d.getDate() + 5);
    const dateStr = d.toISOString().split('T')[0];

    this.newTask = {
      title: '',
      description: '',
      department_id: defaultDept,
      assignee_id: null,
      due_date: dateStr
    };
    this.modalError.set('');
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.modalError.set('');
  }

  submitCreateTask(): void {
    const title = this.newTask.title.trim();
    if (!title) {
      this.modalError.set('Укажите название задачи.');
      return;
    }

    if (this.authService.isHr() && !this.newTask.department_id) {
      this.modalError.set('Выберите отдел назначения.');
      return;
    }

    this.isSubmitting.set(true);
    this.modalError.set('');

    const payload: any = {
      title,
      description: this.newTask.description.trim(),
      department_id: Number(this.newTask.department_id),
      due_date: this.newTask.due_date || null
    };

    if (this.authService.isManager() && this.newTask.assignee_id) {
      payload.assignee_id = Number(this.newTask.assignee_id);
    }

    this.api.post<TaskItem>('/tasks', payload).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.closeModal();
        this.loadTasks();
        if (this.authService.isHr()) {
          this.showToast('Задача успешно направлена в отдел! Руководитель получил оповещение.');
        } else {
          this.showToast('Задача успешно создана.');
        }
      },
      error: (err) => {
        this.isSubmitting.set(false);
        const msg = err?.error?.error || 'Не удалось создать задачу. Проверьте введенные данные.';
        this.modalError.set(msg);
      }
    });
  }

  // ==========================================
  // TASK DETAILS MODAL
  // ==========================================
  viewTaskDetails(task: TaskItem): void {
    this.selectedTask.set(task);
    this.isDetailModalOpen.set(true);
  }

  closeDetailModal(): void {
    this.isDetailModalOpen.set(false);
    this.selectedTask.set(null);
  }

  // Helpers
  isOverdue(dateStr: string | null): boolean {
    if (!dateStr) return false;
    const due = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  }

  isDueToday(dateStr: string | null): boolean {
    if (!dateStr) return false;
    const due = new Date(dateStr);
    const today = new Date();
    return (
      due.getFullYear() === today.getFullYear() &&
      due.getMonth() === today.getMonth() &&
      due.getDate() === today.getDate()
    );
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Без срока';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  getInitials(name: string | null | undefined): string {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
}
