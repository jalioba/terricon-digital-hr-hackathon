import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService, User } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { LoadingComponent } from '../../shared/components/loading/loading.component';

export interface RequestItem {
  id: number;
  type: 'vacation' | 'advance';
  user_id: number;
  department_id: number;
  date_from: string | null;
  date_to: string | null;
  days_count: number;
  is_paid: boolean;
  amount: number;
  desired_date: string | null;
  document_url: string;
  comment: string;
  manager_comment: string;
  status: 'pending' | 'approved' | 'revision_needed' | 'rejected';
  approved_by?: number | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_position?: string;
  dept_ru?: string;
  dept_kz?: string;
  approver_name?: string;
}

export interface RequestHistoryItem {
  id: number;
  request_id: number;
  status: string;
  actor_id?: number | null;
  actor_name?: string;
  comment: string;
  created_at: string;
}

export interface Department {
  id: number;
  code: string;
  name_ru: string;
  name_kz: string;
}

@Component({
  selector: 'app-requests',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, LoadingComponent],
  templateUrl: './requests.component.html',
  styleUrl: './requests.component.scss'
})
export class RequestsComponent implements OnInit {
  private api = inject(ApiService);
  authService = inject(AuthService);
  i18n = inject(I18nService);

  // Lists
  myRequests = signal<RequestItem[]>([]);
  departmentRequests = signal<RequestItem[]>([]);
  allRequests = signal<RequestItem[]>([]);
  departments = signal<Department[]>([]);

  // Navigation & Tabs
  activeTab = signal<'my' | 'department' | 'all'>('my');

  // Filters
  statusFilter = signal<string>('all');
  typeFilter = signal<string>('all');
  searchQuery = signal<string>('');
  selectedDeptFilter = signal<string>('all');

  // Loading & Action states
  isLoading = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  isUploading = signal<boolean>(false);
  actionError = signal<string>('');
  actionSuccess = signal<string>('');

  // Filing Modal State
  isFilingModalOpen = signal<boolean>(false);
  isEditingMode = signal<boolean>(false);
  editingRequestId = signal<number | null>(null);
  filingMode = signal<'form' | 'file'>('form'); // 'form' = digital form, 'file' = scan/photo attachment
  existingManagerFeedback = signal<string>('');

  // Form Fields
  formType = signal<'vacation' | 'advance'>('vacation');
  formIsPaid = signal<boolean>(true);
  formDateFrom = signal<string>('');
  formDateTo = signal<string>('');
  formAmount = signal<number>(100000);
  formDesiredDate = signal<string>('');
  formComment = signal<string>('');
  formSubstitute = signal<string>('');
  formDocumentUrl = signal<string>('');
  attachedFileName = signal<string>('');
  uploadProgress = signal<number>(0);

  // Inspection / Decision Modal
  isViewModalOpen = signal<boolean>(false);
  selectedRequest = signal<RequestItem | null>(null);
  selectedHistory = signal<RequestHistoryItem[]>([]);
  isHistoryLoading = signal<boolean>(false);
  managerDecisionComment = signal<string>('');
  decisionType = signal<'approved' | 'revision_needed' | 'rejected' | null>(null);
  isDecisionSubmitting = signal<boolean>(false);

  // Role getters
  currentUser = computed(() => this.authService.currentUser());
  isManager = computed(() => this.authService.isManager());
  isHr = computed(() => this.authService.isHr());

  // Vacation balance calculation
  vacationBalance = computed(() => this.currentUser()?.vacation_days_left ?? 0);

  // Calculate days between date_from and date_to
  formDaysCount = computed(() => {
    const from = this.formDateFrom();
    const to = this.formDateTo();
    if (!from || !to) return 0;
    const d1 = new Date(from);
    const d2 = new Date(to);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d2 < d1) return 0;
    const diffTime = d2.getTime() - d1.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
  });

  // Check if vacation days exceed remaining balance
  isVacationOverLimit = computed(() => {
    if (this.formType() !== 'vacation' || !this.formIsPaid()) return false;
    return this.formDaysCount() > this.vacationBalance();
  });

  vacationDaysDeficit = computed(() => {
    if (!this.isVacationOverLimit()) return 0;
    return this.formDaysCount() - this.vacationBalance();
  });

  // Filtered List Computed for Active Tab
  filteredRequests = computed(() => {
    let list: RequestItem[] = [];
    const tab = this.activeTab();

    if (tab === 'my') {
      list = this.myRequests() || [];
    } else if (tab === 'department') {
      list = this.departmentRequests() || [];
    } else if (tab === 'all') {
      list = this.allRequests() || [];
    }

    if (!Array.isArray(list)) {
      list = [];
    }

    const st = this.statusFilter();
    if (st !== 'all') {
      list = list.filter((r) => r.status === st);
    }

    const tp = this.typeFilter();
    if (tp !== 'all') {
      list = list.filter((r) => r.type === tp);
    }

    const dept = this.selectedDeptFilter();
    if (tab === 'all' && dept !== 'all') {
      const deptId = Number(dept);
      list = list.filter((r) => r.department_id === deptId);
    }

    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        (r.user_name && r.user_name.toLowerCase().includes(q)) ||
        (r.comment && r.comment.toLowerCase().includes(q)) ||
        (r.user_position && r.user_position.toLowerCase().includes(q)) ||
        (r.dept_ru && r.dept_ru.toLowerCase().includes(q)) ||
        String(r.id).includes(q)
      );
    }

    return list;
  });

  // Pending counts for badges
  myPendingCount = computed(() => (this.myRequests() || []).filter((r) => r.status === 'pending').length);
  myRevisionCount = computed(() => (this.myRequests() || []).filter((r) => r.status === 'revision_needed').length);
  deptPendingCount = computed(() => (this.departmentRequests() || []).filter((r) => r.status === 'pending').length);
  allPendingCount = computed(() => (this.allRequests() || []).filter((r) => r.status === 'pending').length);

  ngOnInit(): void {
    this.loadDepartments();
    this.loadData();
  }

  loadDepartments(): void {
    this.api.get<Department[]>('/departments').subscribe({
      next: (data) => this.departments.set(data || []),
      error: (err) => console.error('Failed to load departments', err)
    });
  }

  loadData(): void {
    this.isLoading.set(true);
    this.actionError.set('');

    // 1. Always load current user's requests
    this.api.get<RequestItem[]>('/requests/my').subscribe({
      next: (data) => {
        this.myRequests.set(data || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load my requests', err);
        this.myRequests.set([]);
        this.isLoading.set(false);
      }
    });

    // 2. If Manager or HR, load department requests
    if (this.isManager() || this.isHr()) {
      this.api.get<RequestItem[]>('/requests/department').subscribe({
        next: (data) => this.departmentRequests.set(data || []),
        error: (err) => {
          console.error('Failed to load department requests', err);
          this.departmentRequests.set([]);
        }
      });
    }

    // 3. If HR, load all company requests
    if (this.isHr()) {
      this.api.get<RequestItem[]>('/requests/all').subscribe({
        next: (data) => this.allRequests.set(data || []),
        error: (err) => {
          console.error('Failed to load all company requests', err);
          this.allRequests.set([]);
        }
      });
    }

    // Refresh profile to have exact current vacation_days_left
    this.authService.refreshProfile();
  }

  switchTab(tab: 'my' | 'department' | 'all'): void {
    this.activeTab.set(tab);
    this.statusFilter.set('all');
    this.typeFilter.set('all');
    this.searchQuery.set('');
  }

  // --- Filing Modal Operations ---
  openNewRequestModal(type: 'vacation' | 'advance'): void {
    this.isEditingMode.set(false);
    this.editingRequestId.set(null);
    this.existingManagerFeedback.set('');
    this.filingMode.set('form');
    this.formType.set(type);
    this.formIsPaid.set(true);

    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const endNextWeek = new Date(today.getTime() + 20 * 24 * 60 * 60 * 1000);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    if (type === 'vacation') {
      this.formDateFrom.set(formatDate(nextWeek));
      this.formDateTo.set(formatDate(endNextWeek));
      this.formAmount.set(0);
      this.formDesiredDate.set('');
    } else {
      this.formDateFrom.set('');
      this.formDateTo.set('');
      this.formAmount.set(100000);
      this.formDesiredDate.set(formatDate(nextWeek));
    }

    this.formComment.set('');
    this.formSubstitute.set('');
    this.formDocumentUrl.set('');
    this.attachedFileName.set('');
    this.actionError.set('');
    this.isFilingModalOpen.set(true);
  }

  openResubmitModal(item: RequestItem): void {
    this.isEditingMode.set(true);
    this.editingRequestId.set(item.id);
    this.existingManagerFeedback.set(item.manager_comment || '');
    this.formType.set(item.type);
    this.formIsPaid.set(item.is_paid);
    this.filingMode.set(item.document_url ? 'file' : 'form');

    if (item.date_from) {
      this.formDateFrom.set(item.date_from.split('T')[0]);
    } else {
      this.formDateFrom.set('');
    }
    if (item.date_to) {
      this.formDateTo.set(item.date_to.split('T')[0]);
    } else {
      this.formDateTo.set('');
    }

    this.formAmount.set(item.amount || 100000);
    if (item.desired_date) {
      this.formDesiredDate.set(item.desired_date.split('T')[0]);
    } else {
      this.formDesiredDate.set('');
    }

    this.formComment.set(item.comment || '');
    this.formSubstitute.set('');
    this.formDocumentUrl.set(item.document_url || '');
    this.attachedFileName.set(item.document_url ? 'Прикрепленный документ' : '');
    this.actionError.set('');
    this.isFilingModalOpen.set(true);
  }

  closeFilingModal(): void {
    this.isFilingModalOpen.set(false);
    this.actionError.set('');
  }

  setPresetAmount(val: number): void {
    this.formAmount.set(val);
  }

  // --- File Upload Handler (Supabase Storage) ---
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      this.actionError.set('Разрешены только файлы JPG, PNG, WEBP и PDF');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.actionError.set('Размер файла превышает 10 МБ');
      return;
    }

    this.isUploading.set(true);
    this.actionError.set('');
    this.attachedFileName.set(file.name);

    const formData = new FormData();
    formData.append('file', file);

    this.api.upload(formData).subscribe({
      next: (res) => {
        this.formDocumentUrl.set(res.url);
        this.isUploading.set(false);
      },
      error: (err) => {
        console.error('File upload failed', err);
        this.actionError.set('Не удалось загрузить файл в хранилище. Попробуйте еще раз.');
        this.isUploading.set(false);
      }
    });
  }

  removeAttachedFile(): void {
    this.formDocumentUrl.set('');
    this.attachedFileName.set('');
  }

  // --- Submit Request (Create or Resubmit) ---
  submitRequest(): void {
    this.actionError.set('');

    const type = this.formType();

    if (type === 'vacation') {
      if (!this.formDateFrom() || !this.formDateTo()) {
        this.actionError.set('Укажите дату начала и окончания отпуска');
        return;
      }
      if (this.formDaysCount() <= 0) {
        this.actionError.set('Дата окончания должна быть позже даты начала');
        return;
      }
      if (this.formIsPaid() && this.isVacationOverLimit()) {
        this.actionError.set(
          `Запрошено ${this.formDaysCount()} дней, а доступно только ${this.vacationBalance()} дней. Уменьшите период или выберите неоплачиваемый отпуск.`
        );
        return;
      }
    } else if (type === 'advance') {
      if (!this.formAmount() || this.formAmount() <= 0) {
        this.actionError.set('Укажите корректную сумму аванса');
        return;
      }
      if (!this.formDesiredDate()) {
        this.actionError.set('Укажите желаемую дату получения аванса');
        return;
      }
    }

    if (this.filingMode() === 'file' && !this.formDocumentUrl()) {
      this.actionError.set('Прикрепите скан или фотографию заявления перед отправкой');
      return;
    }

    const payload = {
      type: this.formType(),
      date_from: this.formType() === 'vacation' ? this.formDateFrom() : null,
      date_to: this.formType() === 'vacation' ? this.formDateTo() : null,
      days_count: this.formType() === 'vacation' ? this.formDaysCount() : 0,
      is_paid: this.formType() === 'vacation' ? this.formIsPaid() : false,
      amount: this.formType() === 'advance' ? Number(this.formAmount()) : 0,
      desired_date: this.formType() === 'advance' ? this.formDesiredDate() : null,
      document_url: this.formDocumentUrl(),
      comment: this.formComment().trim()
    };

    this.isSubmitting.set(true);

    if (this.isEditingMode() && this.editingRequestId()) {
      // Resubmit request
      const reqId = this.editingRequestId()!;
      this.api.put<RequestItem>(`/requests/${reqId}/resubmit`, payload).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.isFilingModalOpen.set(false);
          this.actionSuccess.set('Заявка успешно скорректирована и отправлена на согласование!');
          this.loadData();
          setTimeout(() => this.actionSuccess.set(''), 4000);
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.actionError.set(err.error?.error || 'Ошибка при обновлении заявки');
        }
      });
    } else {
      // Create new request
      this.api.post<RequestItem>('/requests', payload).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.isFilingModalOpen.set(false);
          this.actionSuccess.set('Заявка успешно зарегистрирована и направлена на согласование!');
          this.loadData();
          setTimeout(() => this.actionSuccess.set(''), 4000);
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.actionError.set(err.error?.error || 'Ошибка при отправке заявки');
        }
      });
    }
  }

  // --- Detail & Decision Modal Operations ---
  openDetailModal(item: RequestItem): void {
    this.selectedRequest.set(item);
    this.managerDecisionComment.set('');
    this.decisionType.set(null);
    this.actionError.set('');
    this.isViewModalOpen.set(true);
    this.loadHistory(item.id);
  }

  closeDetailModal(): void {
    this.isViewModalOpen.set(false);
    this.selectedRequest.set(null);
    this.decisionType.set(null);
  }

  loadHistory(requestId: number): void {
    this.isHistoryLoading.set(true);
    this.api.get<{ request: RequestItem; history: RequestHistoryItem[] }>(`/requests/${requestId}`).subscribe({
      next: (res) => {
        this.selectedHistory.set(res.history || []);
        this.isHistoryLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load request history', err);
        this.isHistoryLoading.set(false);
      }
    });
  }

  // Manager or HR submits decision
  makeDecision(decision: 'approved' | 'revision_needed' | 'rejected'): void {
    const req = this.selectedRequest();
    if (!req) return;

    if (decision === 'revision_needed' && !this.managerDecisionComment().trim()) {
      this.actionError.set('Обязательно укажите комментарий: что именно сотруднику необходимо исправить');
      return;
    }
    if (decision === 'rejected' && !this.managerDecisionComment().trim()) {
      this.actionError.set('Укажите причину отклонения заявки');
      return;
    }

    this.isDecisionSubmitting.set(true);
    this.actionError.set('');

    const body = {
      decision: decision,
      manager_comment: this.managerDecisionComment().trim()
    };

    this.api.post<RequestItem>(`/requests/${req.id}/decision`, body).subscribe({
      next: () => {
        this.isDecisionSubmitting.set(false);
        this.isViewModalOpen.set(false);
        let msg = 'Решение сохранено: заявка одобрена!';
        if (decision === 'revision_needed') {
          msg = 'Заявка возвращена сотруднику на доработку с вашим комментарием';
        } else if (decision === 'rejected') {
          msg = 'Заявка отклонена';
        }
        this.actionSuccess.set(msg);
        this.loadData();
        setTimeout(() => this.actionSuccess.set(''), 4500);
      },
      error: (err) => {
        this.isDecisionSubmitting.set(false);
        this.actionError.set(err.error?.error || 'Ошибка при сохранении решения');
      }
    });
  }

  // Blank template printable trigger
  downloadBlankTemplate(type: 'vacation' | 'advance'): void {
    const user = this.currentUser();
    const docTitle = type === 'vacation' ? 'Заявление на отпуск' : 'Заявление на аванс';
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${docTitle} — АО «JanaPost»</title>
        <style>
          body { font-family: 'Times New Roman', serif; padding: 40px; color: #111; line-height: 1.6; }
          .header { text-align: right; margin-left: 50%; margin-bottom: 50px; font-size: 14px; }
          .title { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 30px; letter-spacing: 1px; }
          .body-text { text-indent: 40px; font-size: 15px; margin-bottom: 50px; text-align: justify; }
          .footer { display: flex; justify-content: space-between; margin-top: 60px; font-size: 14px; }
          .signature-line { border-bottom: 1px solid #000; width: 180px; display: inline-block; }
          .logo { font-size: 20px; font-weight: bold; color: #00A859; margin-bottom: 20px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="logo">АО «JanaPost»</div>
        <div class="header">
          Председателю Правления АО «JanaPost»<br>
          от сотрудника: <b>${user?.full_name || '______________________'}</b><br>
          Должность: ${user?.position || '______________________'}<br>
          ИИН: ${user?.iin || '____________'}
        </div>
        <div class="title">ЗАЯВЛЕНИЕ</div>
        <div class="body-text">
          ${
            type === 'vacation'
              ? 'Прошу предоставить мне очередной оплачиваемый трудовой отпуск продолжительностью _____ календарных дней с «___» __________ 2026 г. по «___» __________ 2026 г.'
              : 'Прошу выдать мне аванс в счет заработной платы за текущий месяц в размере ____________ (_____________________________________________________) тенге в связи с __________________________________________________________________________.'
          }
        </div>
        <div class="footer">
          <div>«___» _____________ 2026 г.</div>
          <div>Подпись сотрудника: <span class="signature-line"></span></div>
        </div>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  }

  // Format currency
  formatCurrency(val: number): string {
    return new Intl.NumberFormat('ru-RU').format(val) + ' ₸';
  }

  // Format date helper
  formatDate(d: string | null): string {
    if (!d) return '—';
    try {
      const date = new Date(d);
      return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return d;
    }
  }

  // Can current user approve this request?
  canApproveRequest(req: RequestItem): boolean {
    const user = this.currentUser();
    if (!user) return false;
    // Cannot self-approve
    if (req.user_id === user.id) return false;
    // Must be pending
    if (req.status !== 'pending') return false;

    // HR can approve all
    if (user.role === 'hr') return true;

    // Manager can approve within their department (if request is not from another manager)
    if (user.role === 'manager' && user.department_id === req.department_id) {
      return true;
    }
    return false;
  }
}
