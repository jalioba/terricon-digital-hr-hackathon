import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { ProfileComponent } from './features/profile/profile.component';
import { RequestsComponent } from './features/requests/requests.component';
import { ApprovalsComponent } from './features/approvals/approvals.component';
import { AcademyComponent } from './features/academy/academy.component';
import { AiAssistantComponent } from './features/ai-assistant/ai-assistant.component';
import { AdminComponent } from './features/admin/admin.component';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'profile', component: ProfileComponent },
  { path: 'requests', component: RequestsComponent },
  { path: 'approvals', component: ApprovalsComponent },
  { path: 'academy', component: AcademyComponent },
  { path: 'academy/:id', component: AcademyComponent },
  { path: 'ai', component: AiAssistantComponent },
  { path: 'admin', component: AdminComponent },
  { path: '**', redirectTo: 'dashboard' }
];
