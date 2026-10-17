import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';

export interface User {
  id: number;
  iin: string;
  full_name: string;
  role: 'employee' | 'manager' | 'hr';
  department_id?: number | null;
  company: string;
  position: string;
  hired_at: string;
  vacation_days_left: number;
  dept_code?: string;
  dept_ru?: string;
  dept_kz?: string;
}

export interface LoginResponse {
  token: string;
  profile: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  currentUser = signal<User | null>(null);
  token = signal<string | null>(null);

  isLoggedIn = computed(() => !!this.currentUser());
  isHr = computed(() => this.currentUser()?.role === 'hr');
  isManager = computed(() => this.currentUser()?.role === 'manager');
  isEmployee = computed(() => this.currentUser()?.role === 'employee');

  constructor() {
    this.restoreSession();
  }

  private restoreSession(): void {
    if (typeof localStorage === 'undefined') return;

    const savedToken = localStorage.getItem('janamen_token');
    const savedUser = localStorage.getItem('janamen_user');

    if (savedToken && savedUser) {
      try {
        this.token.set(savedToken);
        this.currentUser.set(JSON.parse(savedUser));
      } catch {
        this.clearSession();
      }
    }
  }

  login(iin: string, password: string): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('/auth/login', { iin, password }).pipe(
      tap((res) => {
        this.setSession(res.token, res.profile);
      })
    );
  }

  setSession(token: string, user: User): void {
    this.token.set(token);
    this.currentUser.set(user);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('janamen_token', token);
      localStorage.setItem('janamen_user', JSON.stringify(user));
    }
  }

  logout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  private clearSession(): void {
    this.token.set(null);
    this.currentUser.set(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('janamen_token');
      localStorage.removeItem('janamen_user');
    }
  }
}
