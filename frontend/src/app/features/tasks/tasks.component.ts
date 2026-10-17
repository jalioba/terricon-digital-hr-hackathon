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
  assigned_to: number;
  due_date: string | null;
  status: 'todo' | 'in_progress' | 'done';
  created_at: string;
  updated_at: string;
  creator_name?: string;
  assignee_name?: string;
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

  // Active filter tab: 'all', 'in_progress', 'my', 'delegated', 'overdue'
  activeFilter = signal<'all' | 'in_progress' | 'my' | 'delegated' | 'overdue'>('all');
  searchQuery = signal<string>('');
  selectedDepartment = signal<string>('all');

  // Modals state
  isModalOpen = signal<boolean>(false);
  isDetailModalOpen = signal<boolean>(false);
  selectedTask = signal<TaskItem | null>(null);
  modalError = signal<string>('');

  // Drag and Drop state
  draggedTask = signal<TaskItem | null>(null);
  dragOverColumn = signal<'todo' | 'in_progress' | 'done' | null>(null);

  // New task form state
  newTask = {
    title: '',
    description: '',
    assignee_id: 0,
    department_id: 1,
    due_date: '',
    status: 'todo' as 'todo' | 'in_progress'
  };

  // Computed signals for counts
  totalCount = computed(() => this.tasks().length);
  myTasksCount = computed(() => {
    const uid = this.authService.currentUser()?.id;
    return this.tasks().filter((t) => t.assigned_to === uid && t.status !== 'done').length;
  });
  delegatedCount = computed(() => {
    const uid = this.authService.currentUser()?.id;
    return this.tasks().filter((t) => t.created_by === uid && t.assigned_to !== uid).length;
  });
  overdueCount = computed(() => {
    return this.tasks().filter((t) => t.status !== 'done' && this.isOverdue(t.due_date)).length;
  });

  managerDepartmentName = computed(() => {
    const user = this.authService.currentUser();
    if (user?.dept_ru) return user.dept_ru;
    const dept = this.departments().find((d) => d.id === user?.department_id);
    return dept ? (this.i18n.currentLang() === 'ru' ? dept.name_ru : dept.name_kz) : 'Мой отдел';
  });

  // Filtered tasks pipeline
  filteredTasks = computed(() => {
    let list = this.tasks();
    const query = this.searchQuery().trim().toLowerCase();
    const filter = this.activeFilter();
    const dept = this.selectedDepartment();
    const currentUid = this.authService.currentUser()?.id;

    // 1. Department filter (for HR)
    if (this.authService.isHr() && dept !== 'all') {
      const deptId = Number(dept);
      list = list.filter((t) => t.department_id === deptId);
    }

    // 2. Tab filter
    if (filter === 'in_progress') {
      list = list.filter((t) => t.status === 'in_progress');
    } else if (filter === 'my') {
      list = list.filter((t) => t.assigned_to === currentUid);
    } else if (filter === 'delegated') {
      list = list.filter((t) => t.created_by === currentUid && t.assigned_to !== currentUid);
    } else if (filter === 'overdue') {
      list = list.filter((t) => t.status !== 'done' && this.isOverdue(t.due_date));
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
  doneTasks = computed(() => this.filteredTasks().filter((t) => t.status === 'done'));

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

  // Drag and Drop handlers
  onDragStart(event: DragEvent, task: TaskItem): void {
    this.draggedTask.set(task);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(task.id));
    }
  }

  onDragOver(event: DragEvent, targetStatus: 'todo' | 'in_progress' | 'done'): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOverColumn.set(targetStatus);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragOverColumn.set(null);
  }

  onDrop(event: DragEvent, targetStatus: 'todo' | 'in_progress' | 'done'): void {
    event.preventDefault();
    this.dragOverColumn.set(null);
    const task = this.draggedTask();
    if (task && task.status !== targetStatus) {
      this.moveTaskStatus(task, targetStatus);
    }
    this.draggedTask.set(null);
  }

  // Quick Advance / Status Move
  moveTaskStatus(task: TaskItem, newStatus: 'todo' | 'in_progress' | 'done'): void {
    const oldStatus = task.status;
    if (oldStatus === newStatus) return;

    // Optimistic UI update
    this.tasks.update((list) =>
      list.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
    );

    if (this.selectedTask()?.id === task.id) {
      this.selectedTask.update((t) => (t ? { ...t, status: newStatus } : null));
    }

    this.api.put(`/tasks/${task.id}/status`, { status: newStatus }).subscribe({
      next: () => {
        // Success
      },
      error: (err) => {
        console.error('Failed to update task status', err);
        // Revert back on error
        this.tasks.update((list) =>
          list.map((t) => (t.id === task.id ? { ...t, status: oldStatus } : t))
        );
      }
    });
  }

  // Modal Open / Close
  openCreateModal(defaultStatus: 'todo' | 'in_progress' = 'todo'): void {
    const user = this.authService.currentUser();
    const defaultAssignee = user ? user.id : 0;
    const defaultDept = user?.department_id || 1;

    // Set default due date to 5 days from now
    const d = new Date();
    d.setDate(d.getDate() + 5);
    const dateStr = d.toISOString().split('T')[0];

    this.newTask = {
      title: '',
      description: '',
      assignee_id: defaultAssignee,
      department_id: defaultDept,
      due_date: dateStr,
      status: defaultStatus
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
    if (!this.newTask.assignee_id) {
      this.modalError.set('Выберите исполнителя задачи.');
      return;
    }

    this.isSubmitting.set(true);
    this.modalError.set('');

    const payload = {
      title,
      description: this.newTask.description.trim(),
      assignee_id: Number(this.newTask.assignee_id),
      due_date: this.newTask.due_date || null
    };

    this.api.post<TaskItem>('/tasks', payload).subscribe({
      next: (created) => {
        this.isSubmitting.set(false);
        this.closeModal();
        this.loadTasks();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        const msg = err?.error?.error || 'Не удалось создать задачу. Проверьте введенные данные.';
        this.modalError.set(msg);
      }
    });
  }

  // Task Details Modal
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

  getInitials(name: string | undefined): string {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
}
