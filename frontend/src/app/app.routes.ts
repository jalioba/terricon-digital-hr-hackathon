import { Routes } from '@angular/router';
import { LoginComponent } from './features/login/login.component';
import { HrEmployeesComponent } from './features/hr-employees/hr-employees.component';
import { TasksComponent } from './features/tasks/tasks.component';
import { RequestsComponent } from './features/requests/requests.component';
import { AcademyComponent } from './features/academy/academy.component';
import { AiComponent } from './features/ai/ai.component';
import { ProfileComponent } from './features/profile/profile.component';
import { AnalyticsComponent } from './features/analytics/analytics.component';
import { authGuard, rootRedirectGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', canActivate: [rootRedirectGuard], children: [] },
  { path: 'login', component: LoginComponent },
  { path: 'hr/employees', component: HrEmployeesComponent, canActivate: [authGuard] },
  { path: 'tasks', component: TasksComponent, canActivate: [authGuard] },
  { path: 'requests', component: RequestsComponent, data: { title: 'Заявки сотрудников', icon: 'file-text' }, canActivate: [authGuard] },
  { path: 'academy', component: AcademyComponent, data: { title: 'Jana Academy', icon: 'graduation-cap' }, canActivate: [authGuard] },
  { path: 'ai', component: AiComponent, data: { title: 'Jana AI Ассистент', icon: 'bot' }, canActivate: [authGuard] },
  { path: 'hr/analytics', component: AnalyticsComponent, data: { title: 'HR Аналитика', icon: 'bar-chart' }, canActivate: [authGuard] },
  { path: 'analytics', component: AnalyticsComponent, data: { title: 'HR Аналитика', icon: 'bar-chart' }, canActivate: [authGuard] },
  { path: 'profile', component: ProfileComponent, data: { title: 'Профиль сотрудника', icon: 'user' }, canActivate: [authGuard] },
  { path: '**', redirectTo: 'login' }
];
