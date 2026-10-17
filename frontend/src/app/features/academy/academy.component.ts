import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { LoadingComponent } from '../../shared/components/loading/loading.component';

export interface Lesson {
  id: number;
  title: string;
  content: string;
}

export interface Course {
  id: number;
  title_ru: string;
  title_kz: string;
  description_ru: string;
  description_kz: string;
  track: 'platform' | 'job';
  target_role: string;
  department_id: number | null;
  lessons: Lesson[];
  assigned: boolean;
  status: 'not_started' | 'in_progress' | 'completed';
  progress: number;
  score?: number | null;
}

export interface QuizQuestion {
  id: number;
  course_id: number;
  question_ru: string;
  question_kz: string;
  options_ru: string[];
  options_kz: string[];
}

export interface HrOversightUser {
  user_id: number;
  full_name: string;
  position: string;
  role: 'employee' | 'manager';
  department_id: number | null;
  dept_ru: string;
  total_courses: number;
  completed_courses: number;
  avg_progress: number;
  platform_completed: number;
  platform_score: number;
}

@Component({
  selector: 'app-academy',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, LoadingComponent],
  templateUrl: './academy.component.html',
  styleUrl: './academy.component.scss'
})
export class AcademyComponent implements OnInit {
  private api = inject(ApiService);
  authService = inject(AuthService);
  i18n = inject(I18nService);

  // Active independent learning track: 'platform' (Часть 1) vs 'job' (Часть 2)
  activeTrack = signal<'platform' | 'job'>('platform');

  // Courses & Data
  courses = signal<Course[]>([]);
  hrUsers = signal<HrOversightUser[]>([]);
  isLoading = signal<boolean>(false);
  actionSuccess = signal<string>('');
  actionError = signal<string>('');

  // Role getters
  currentUser = computed(() => this.authService.currentUser());
  isHr = computed(() => this.authService.isHr());
  isManager = computed(() => this.authService.isManager());
  isEmployee = computed(() => this.authService.isEmployee());

  // Platform Course (Track 1) for Employee / Manager
  platformCourse = computed(() => {
    return this.courses().find((c) => c.track === 'platform');
  });

  // Job Courses (Track 2) for Employee / Manager
  jobCourses = computed(() => {
    return this.courses().filter((c) => c.track === 'job');
  });

  // HR Oversight Filters (Track 1)
  hrFilterDept = signal<string>('all');
  hrFilterRole = signal<string>('all');
  hrSearch = signal<string>('');

  // HR Job Catalog Filters (Track 2)
  hrSelectedJobDept = signal<number>(1);
  hrSelectedJobRole = signal<'employee' | 'manager'>('employee');

  hrJobCourses = computed(() => {
    const deptId = this.hrSelectedJobDept();
    const role = this.hrSelectedJobRole();
    return this.courses().filter(
      (c) => c.track === 'job' && (c.department_id === deptId || !c.department_id) && (c.target_role === role || c.target_role === 'all')
    );
  });

  // Filtered HR Oversight list
  filteredHrUsers = computed(() => {
    let list = this.hrUsers();
    const dept = this.hrFilterDept();
    if (dept !== 'all') {
      const dId = Number(dept);
      list = list.filter((u) => u.department_id === dId);
    }
    const r = this.hrFilterRole();
    if (r !== 'all') {
      list = list.filter((u) => u.role === r);
    }
    const q = this.hrSearch().trim().toLowerCase();
    if (q) {
      list = list.filter(
        (u) =>
          u.full_name.toLowerCase().includes(q) ||
          u.position.toLowerCase().includes(q) ||
          u.dept_ru.toLowerCase().includes(q)
      );
    }
    return list;
  });

  // HR Metrics Stats
  hrStats = computed(() => {
    const all = this.hrUsers();
    const total = all.length;
    const completed = all.filter((u) => u.platform_completed === 1).length;
    const inProgress = all.filter((u) => u.platform_completed === 0 && u.total_courses > 0).length;
    const notStarted = total - completed - inProgress;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, notStarted, percent };
  });

  // Interactive Lesson & Quiz Modal State
  isLearnModalOpen = signal<boolean>(false);
  activeCourse = signal<Course | null>(null);
  currentLessonIndex = signal<number>(0);
  isQuizActive = signal<boolean>(false);
  quizQuestions = signal<QuizQuestion[]>([]);
  userAnswers = signal<{ [key: string]: number }>({});
  quizResult = signal<{ passed: boolean; score: number; correct: number; total: number; message: string } | null>(null);
  isSubmittingQuiz = signal<boolean>(false);

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.isLoading.set(true);

    // 1. Load available courses for current user
    this.api.get<Course[]>('/courses').subscribe({
      next: (data) => {
        const parsed = (data || []).map((c) => {
          let lessons: Lesson[] = [];
          if (Array.isArray(c.lessons)) {
            lessons = c.lessons;
          } else if (typeof c.lessons === 'string') {
            try {
              lessons = JSON.parse(c.lessons);
            } catch {
              lessons = [];
            }
          }
          return { ...c, lessons };
        });
        this.courses.set(parsed);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load courses', err);
        this.isLoading.set(false);
      }
    });

    // 2. If HR, load company onboarding oversight
    if (this.isHr()) {
      this.api.get<HrOversightUser[]>('/courses/hr-oversight').subscribe({
        next: (data) => this.hrUsers.set(data || []),
        error: (err) => console.error('Failed to load HR oversight data', err)
      });
    }
  }

  switchTrack(track: 'platform' | 'job'): void {
    this.activeTrack.set(track);
  }

  // --- Learning Flow ---
  startCourse(course: Course): void {
    this.activeCourse.set(course);
    this.currentLessonIndex.set(0);
    this.isQuizActive.set(false);
    this.userAnswers.set({});
    this.quizResult.set(null);
    this.isLearnModalOpen.set(true);

    // Fetch quiz questions for this course
    this.api.get<{ questions: QuizQuestion[] }>(`/courses/${course.id}`).subscribe({
      next: (res) => {
        this.quizQuestions.set(res.questions || []);
      },
      error: (err) => console.error('Failed to load questions', err)
    });

    // Only mark status as in_progress if not completed yet, keep progress at earned value
    if (course.status === 'not_started') {
      this.updateProgress(course.id, 0);
    }
  }

  nextLesson(): void {
    const course = this.activeCourse();
    if (!course) return;

    const total = course.lessons.length;
    const current = this.currentLessonIndex();

    if (total > 0 && current < total - 1) {
      const nextIdx = current + 1;
      this.currentLessonIndex.set(nextIdx);
      const calculatedProgress = Math.round(((nextIdx) / total) * 75);
      if (course.status !== 'completed' && course.progress < calculatedProgress) {
        this.updateProgress(course.id, calculatedProgress);
      }
    } else {
      // Completed all lessons, ready for Quiz (75% progress)
      if (course.status !== 'completed' && course.progress < 75) {
        this.updateProgress(course.id, 75);
      }
      this.isQuizActive.set(true);
    }
  }

  prevLesson(): void {
    const current = this.currentLessonIndex();
    if (current > 0) {
      this.currentLessonIndex.set(current - 1);
    }
  }

  goToLesson(index: number): void {
    this.isQuizActive.set(false);
    this.currentLessonIndex.set(index);
  }

  startQuiz(): void {
    const course = this.activeCourse();
    if (course && course.status !== 'completed' && course.progress < 75) {
      this.updateProgress(course.id, 75);
    }
    this.isQuizActive.set(true);
  }

  closeLearnModal(): void {
    this.isLearnModalOpen.set(false);
    this.activeCourse.set(null);
    this.isQuizActive.set(false);
    this.quizResult.set(null);
  }

  // --- Quiz Handling ---
  selectAnswer(questionId: number, optionIndex: number): void {
    const updated = { ...this.userAnswers() };
    updated[String(questionId)] = optionIndex;
    this.userAnswers.set(updated);
  }

  submitQuiz(): void {
    const course = this.activeCourse();
    if (!course) return;

    const questions = this.quizQuestions();
    const answers = this.userAnswers();

    // Check all questions answered
    const unanswered = questions.filter((q) => answers[String(q.id)] === undefined);
    if (unanswered.length > 0) {
      this.actionError.set(`Пожалуйста, ответьте на все вопросы теста (осталось: ${unanswered.length})`);
      setTimeout(() => this.actionError.set(''), 3500);
      return;
    }

    this.isSubmittingQuiz.set(true);
    this.actionError.set('');

    this.api
      .post<{
        passed: boolean;
        score: number;
        correct: number;
        total: number;
        message: string;
      }>(`/courses/${course.id}/quiz`, { answers })
      .subscribe({
        next: (res) => {
          this.isSubmittingQuiz.set(false);
          this.quizResult.set(res);
          // Refresh list of courses to update status and scores
          this.loadData();
        },
        error: (err) => {
          this.isSubmittingQuiz.set(false);
          console.error('Quiz submission failed', err);
          this.actionError.set(err.error?.error || 'Ошибка отправки результатов теста');
        }
      });
  }

  retakeQuiz(): void {
    this.userAnswers.set({});
    this.quizResult.set(null);
  }

  updateProgress(courseId: number, progress: number): void {
    this.api.put(`/courses/${courseId}/progress`, { progress }).subscribe({
      next: () => {
        // Local update
        this.courses.update((list) =>
          list.map((c) => (c.id === courseId ? { ...c, progress, status: progress === 100 ? 'completed' : 'in_progress' } : c))
        );
      },
      error: (err) => console.error('Failed to update progress', err)
    });
  }

  // --- HR Oversight Reminder ---
  sendReminder(user: HrOversightUser): void {
    const message = `Уважаемый(ая) ${user.full_name}! Напоминаем о необходимости пройти обязательное обучение по функционалу платформы JanaMen в Jana Academy.`;
    this.api.post('/courses/remind', { user_id: user.user_id, message }).subscribe({
      next: () => {
        this.actionSuccess.set(`Напоминание успешно отправлено сотруднику ${user.full_name}`);
        setTimeout(() => this.actionSuccess.set(''), 4000);
      },
      error: (err) => {
        console.error('Failed to send reminder', err);
        this.actionError.set('Не удалось отправить напоминание');
      }
    });
  }
}
