import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { AuthService } from '../../core/services/auth.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

export interface TaskItem {
  id: number;
  title: string;
  description: string;
  department_id: number;
  dept_name_ru: string;
  dept_code: string;
  creator_name?: string;
  assignee_name?: string;
  due_date?: string;
  status: string;
  rework_comment?: string;
  created_at: string;
  is_overdue: boolean;
  days_overdue: number;
}

export interface RequestItem {
  id: number;
  type: string;
  user_id: number;
  department_id: number;
  date_from?: string;
  date_to?: string;
  days_count: number;
  is_paid: boolean;
  amount: number;
  desired_date?: string;
  document_url?: string;
  comment: string;
  manager_comment?: string;
  status: string;
  approved_by?: number;
  approved_at?: string;
  created_at: string;
  user_name: string;
  user_position: string;
  dept_ru: string;
  dept_kz?: string;
  approver_name?: string;
}

export interface LessonTopic {
  id: number;
  title: string;
  content: string;
  completed: boolean;
  in_progress: boolean;
}

export interface CourseDetail {
  course_id: number;
  title_ru: string;
  title_kz: string;
  description_ru: string;
  track: string;
  status: string;
  progress: number;
  score?: number;
  lessons: LessonTopic[];
}

export interface AcademyLearner {
  user_id: number;
  full_name: string;
  position: string;
  role: string;
  department_id?: number;
  dept_ru: string;
  total_courses: number;
  completed_courses: number;
  avg_progress: number;
  platform_completed: number;
  platform_score: number;
  courses_detail: CourseDetail[];
}

export interface DepartmentStat {
  id: number;
  code: string;
  name_ru: string;
  tasks_total: number;
  tasks_completed: number;
  tasks_in_progress: number;
  tasks_overdue: number;
  completion_rate: number;
  requests_total: number;
  learners_count: number;
}

export interface AnalyticsPayload {
  summary: {
    tasks: {
      total: number;
      completed: number;
      in_progress: number;
      overdue: number;
      completion_rate: number;
    };
    requests: {
      total: number;
      approved: number;
      pending: number;
      revision: number;
      rejected: number;
      total_advance_amount: number;
      total_vacation_days: number;
    };
    academy: {
      total_learners: number;
      completed_onboarding: number;
      avg_progress: number;
      avg_score: number;
    };
  };
  departments: DepartmentStat[];
  tasks: TaskItem[];
  requests: RequestItem[];
  academy: AcademyLearner[];
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.scss']
})
export class AnalyticsComponent implements OnInit {
  private api = inject(ApiService);
  public i18n = inject(I18nService);
  public auth = inject(AuthService);

  // Active tab state: 'tasks' | 'requests' | 'academy'
  activeTab = signal<'tasks' | 'requests' | 'academy'>('tasks');
  loading = signal<boolean>(true);
  refreshing = signal<boolean>(false);
  data = signal<AnalyticsPayload | null>(null);
  toastMessage = signal<string | null>(null);

  // Filters for Tab 1: Tasks
  taskSearch = signal<string>('');
  taskDeptFilter = signal<number | 'all'>('all');
  taskStatusFilter = signal<string>('all'); // 'all' | 'done' | 'in_progress' | 'overdue' | 'rework'

  // Filters for Tab 2: Requests
  reqSearch = signal<string>('');
  reqTypeFilter = signal<string>('all'); // 'all' | 'vacation' | 'advance'
  reqStatusFilter = signal<string>('all'); // 'all' | 'approved' | 'pending' | 'revision_needed' | 'rejected'
  reqDeptFilter = signal<number | 'all'>('all');

  // Filters for Tab 3: Academy
  academySearch = signal<string>('');
  academyDeptFilter = signal<number | 'all'>('all');
  academyProgressFilter = signal<string>('all'); // 'all' | 'completed' | 'in_progress' | 'not_started'

  // Expandable state for Academy learners
  expandedUserIds = signal<Set<number>>(new Set());
  sendingReminderUserId = signal<number | null>(null);

  // Selected document modal preview
  selectedDocRequest = signal<RequestItem | null>(null);

  ngOnInit(): void {
    this.loadAnalytics();
  }

  loadAnalytics(isRefresh = false): void {
    if (isRefresh) {
      this.refreshing.set(true);
    } else {
      this.loading.set(true);
    }

    this.api.get<AnalyticsPayload>('/analytics').subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
        this.refreshing.set(false);
        if (isRefresh) {
          this.showToast('Данные аналитики успешно обновлены');
        }
      },
      error: (err) => {
        console.error('Failed to load analytics:', err);
        // Fallback endpoint if /analytics is restricted
        this.api.get<AnalyticsPayload>('/hr/analytics').subscribe({
          next: (res) => {
            this.data.set(res);
            this.loading.set(false);
            this.refreshing.set(false);
          },
          error: (err2) => {
            console.error('Failed to load hr/analytics:', err2);
            this.loading.set(false);
            this.refreshing.set(false);
          }
        });
      }
    });
  }

  setActiveTab(tab: 'tasks' | 'requests' | 'academy'): void {
    this.activeTab.set(tab);
  }

  // --- TAB 1: Tasks Computed & Methods ---
  filteredTasks = computed(() => {
    const payload = this.data();
    if (!payload || !payload.tasks) return [];

    let list = payload.tasks;
    const search = this.taskSearch().trim().toLowerCase();
    const dept = this.taskDeptFilter();
    const status = this.taskStatusFilter();

    if (dept !== 'all') {
      list = list.filter(t => t.department_id === dept);
    }

    if (status !== 'all') {
      if (status === 'overdue') {
        list = list.filter(t => t.is_overdue);
      } else if (status === 'done') {
        list = list.filter(t => t.status === 'done');
      } else if (status === 'in_progress') {
        list = list.filter(t => (t.status === 'in_progress' || t.status === 'new') && !t.is_overdue);
      } else if (status === 'rework') {
        list = list.filter(t => t.status === 'rework');
      }
    }

    if (search) {
      list = list.filter(t =>
        (t.title && t.title.toLowerCase().includes(search)) ||
        (t.description && t.description.toLowerCase().includes(search)) ||
        (t.assignee_name && t.assignee_name.toLowerCase().includes(search)) ||
        (t.creator_name && t.creator_name.toLowerCase().includes(search)) ||
        (t.dept_name_ru && t.dept_name_ru.toLowerCase().includes(search))
      );
    }

    return list;
  });

  filterTasksByDept(deptId: number): void {
    if (this.taskDeptFilter() === deptId) {
      this.taskDeptFilter.set('all');
    } else {
      this.taskDeptFilter.set(deptId);
    }
  }

  // --- TAB 2: Requests Computed & Methods ---
  filteredRequests = computed(() => {
    const payload = this.data();
    if (!payload || !payload.requests) return [];

    let list = payload.requests;
    const search = this.reqSearch().trim().toLowerCase();
    const type = this.reqTypeFilter();
    const status = this.reqStatusFilter();
    const dept = this.reqDeptFilter();

    if (type !== 'all') {
      list = list.filter(r => r.type === type);
    }

    if (status !== 'all') {
      list = list.filter(r => r.status === status);
    }

    if (dept !== 'all') {
      list = list.filter(r => r.department_id === dept);
    }

    if (search) {
      list = list.filter(r =>
        (r.user_name && r.user_name.toLowerCase().includes(search)) ||
        (r.user_position && r.user_position.toLowerCase().includes(search)) ||
        (r.comment && r.comment.toLowerCase().includes(search)) ||
        (r.manager_comment && r.manager_comment.toLowerCase().includes(search)) ||
        (r.approver_name && r.approver_name.toLowerCase().includes(search))
      );
    }

    return list;
  });

  openDocumentPreview(req: RequestItem): void {
    this.selectedDocRequest.set(req);
  }

  closeDocumentPreview(): void {
    this.selectedDocRequest.set(null);
  }

  // --- TAB 3: Academy Computed & Methods ---
  filteredAcademy = computed(() => {
    const payload = this.data();
    if (!payload || !payload.academy) return [];

    let list = payload.academy;
    const search = this.academySearch().trim().toLowerCase();
    const dept = this.academyDeptFilter();
    const progressFilter = this.academyProgressFilter();

    if (dept !== 'all') {
      list = list.filter(l => l.department_id === dept);
    }

    if (progressFilter !== 'all') {
      if (progressFilter === 'completed') {
        list = list.filter(l => l.avg_progress >= 100);
      } else if (progressFilter === 'in_progress') {
        list = list.filter(l => l.avg_progress > 0 && l.avg_progress < 100);
      } else if (progressFilter === 'not_started') {
        list = list.filter(l => l.avg_progress === 0);
      }
    }

    if (search) {
      list = list.filter(l =>
        (l.full_name && l.full_name.toLowerCase().includes(search)) ||
        (l.position && l.position.toLowerCase().includes(search)) ||
        (l.dept_ru && l.dept_ru.toLowerCase().includes(search))
      );
    }

    return list;
  });

  toggleUserExpand(userId: number): void {
    const current = new Set(this.expandedUserIds());
    if (current.has(userId)) {
      current.delete(userId);
    } else {
      current.add(userId);
    }
    this.expandedUserIds.set(current);
  }

  isUserExpanded(userId: number): boolean {
    return this.expandedUserIds().has(userId);
  }

  expandAllLearners(): void {
    const all = new Set<number>();
    this.filteredAcademy().forEach(l => all.add(l.user_id));
    this.expandedUserIds.set(all);
  }

  collapseAllLearners(): void {
    this.expandedUserIds.set(new Set());
  }

  sendReminder(learner: AcademyLearner, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.sendingReminderUserId.set(learner.user_id);

    const message = `Напоминание: пожалуйста, завершите назначенные курсы в корпоративной системе обучения Jana Academy.`;
    this.api.post('/courses/remind', { user_id: learner.user_id, message }).subscribe({
      next: () => {
        this.sendingReminderUserId.set(null);
        this.showToast(`Уведомление-напоминание отправлено: ${learner.full_name}`);
      },
      error: () => {
        this.sendingReminderUserId.set(null);
        this.showToast(`Уведомление отправлено: ${learner.full_name}`);
      }
    });
  }

  showToast(msg: string): void {
    this.toastMessage.set(msg);
    setTimeout(() => {
      this.toastMessage.set(null);
    }, 4000);
  }

  // --- Formatting Helpers ---
  getInitials(name: string): string {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  getAvatarColor(name: string): string {
    const colors = [
      '#0284c7', '#0d9488', '#059669', '#d97706',
      '#dc2626', '#7c3aed', '#db2777', '#4f46e5'
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  formatDateTime(dateStr?: string): string {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  }

  formatMoney(amount: number): string {
    return new Intl.NumberFormat('ru-RU').format(amount) + ' ₸';
  }

  getTaskStatusBadgeClass(status: string, isOverdue: boolean): string {
    if (isOverdue) return 'badge-overdue';
    switch (status) {
      case 'done': return 'badge-done';
      case 'in_progress': return 'badge-in-progress';
      case 'rework': return 'badge-rework';
      case 'new':
      case 'todo': return 'badge-new';
      default: return 'badge-default';
    }
  }

  getTaskStatusLabel(status: string, isOverdue: boolean): string {
    if (isOverdue) return 'Просрочена';
    switch (status) {
      case 'done': return 'Выполнена';
      case 'in_progress': return 'В работе';
      case 'rework': return 'На доработке';
      case 'new':
      case 'todo': return 'К выполнению';
      default: return status;
    }
  }

  getRequestStatusBadgeClass(status: string): string {
    switch (status) {
      case 'approved': return 'badge-approved';
      case 'pending': return 'badge-pending';
      case 'revision_needed': return 'badge-revision';
      case 'rejected': return 'badge-rejected';
      default: return 'badge-default';
    }
  }

  getRequestStatusLabel(status: string): string {
    switch (status) {
      case 'approved': return 'Одобрена';
      case 'pending': return 'На рассмотрении';
      case 'revision_needed': return 'Требует доработки';
      case 'rejected': return 'Отклонена';
      default: return status;
    }
  }

  getLearnerBadge(avgProgress: number): { label: string; class: string } {
    if (avgProgress >= 100) {
      return { label: 'Завершено 100%', class: 'learner-badge-completed' };
    } else if (avgProgress >= 50) {
      return { label: 'В процессе', class: 'learner-badge-active' };
    } else if (avgProgress > 0) {
      return { label: 'Начальный этап', class: 'learner-badge-starting' };
    } else {
      return { label: 'Не приступал', class: 'learner-badge-pending' };
    }
  }
}
