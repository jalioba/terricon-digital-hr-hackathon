import { Routes } from '@angular/router';
import { LoginComponent } from './features/login/login.component';
import { HrEmployeesComponent } from './features/hr-employees/hr-employees.component';
import { TasksComponent } from './features/tasks/tasks.component';
import { RequestsComponent } from './features/requests/requests.component';
import { AcademyComponent } from './features/academy/academy.component';
import { PlaceholderComponent } from './features/placeholder/placeholder.component';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'hr/employees', component: HrEmployeesComponent },
  { path: 'tasks', component: TasksComponent },
  { path: 'requests', component: RequestsComponent, data: { title: 'Заявки сотрудников', icon: 'file-text' } },
  { path: 'academy', component: AcademyComponent, data: { title: 'Jana Academy', icon: 'graduation-cap' } },
  { path: 'ai', component: PlaceholderComponent, data: { title: 'Jana AI Ассистент', icon: 'bot' } },
  { path: 'hr/analytics', component: PlaceholderComponent, data: { title: 'HR Аналитика', icon: 'bar-chart' } },
  { path: 'profile', component: PlaceholderComponent, data: { title: 'Профиль сотрудника', icon: 'user' } },
  { path: '**', redirectTo: 'login' }
];
