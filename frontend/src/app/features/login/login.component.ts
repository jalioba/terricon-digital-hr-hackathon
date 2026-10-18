import { Component, inject, signal, computed, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { JURY_ACCOUNTS, JuryAccount } from './jury-accounts';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit, AfterViewInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  i18n = inject(I18nService);

  iin: string = '';
  password: string = '';
  showPassword = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');

  // Mobile segmented tab: 'form' (manual login) | 'jury' (quick selector)
  mobileTab = signal<'form' | 'jury'>('form');

  // Jury Quick-Select state
  allJuryAccounts = JURY_ACCOUNTS;
  searchQuery = signal<string>('');
  selectedDept = signal<string>('all');
  selectedRole = signal<string>('all');
  showJuryPanel = signal<boolean>(true);

  // Filtered accounts computed signal
  filteredAccounts = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const dept = this.selectedDept();
    const role = this.selectedRole();

    return this.allJuryAccounts.filter((acc) => {
      // Dept filter
      if (dept !== 'all') {
        if (dept === 'supply' && !acc.dept.includes('поставок')) return false;
        if (dept === 'logistics' && !acc.dept.includes('логистики')) return false;
      }

      // Role filter
      if (role !== 'all') {
        if (role === 'manager' && acc.role !== 'manager') return false;
        if (role === 'employee' && acc.role !== 'employee') return false;
      }

      // Search query
      if (q) {
        const matchName = acc.name.toLowerCase().includes(q);
        const matchIin = acc.iin.includes(q);
        const matchPos = acc.position.toLowerCase().includes(q);
        const matchDept = acc.dept.toLowerCase().includes(q);
        if (!matchName && !matchIin && !matchPos && !matchDept) return false;
      }

      return true;
    });
  });

  // Department counts
  countSupply = computed(() => this.allJuryAccounts.filter(a => a.dept.includes('поставок')).length);
  countLogistics = computed(() => this.allJuryAccounts.filter(a => a.dept.includes('логистики')).length);
  countManagers = computed(() => this.allJuryAccounts.filter(a => a.role === 'manager').length);
  countEmployees = computed(() => this.allJuryAccounts.filter(a => a.role === 'employee').length);

  ngOnInit(): void {
    // Ensure inputs are strictly blank on page load
    this.iin = '';
    this.password = '';
    if (this.authService.isLoggedIn()) {
      this.authService.logout();
    }
  }

  ngAfterViewInit(): void {
    // Clear any cached credentials that the browser might attempt to auto-fill
    setTimeout(() => {
      if (!this.iin && !this.password) {
        this.iin = '';
        this.password = '';
      }
    }, 150);
  }

  setMobileTab(tab: 'form' | 'jury'): void {
    this.mobileTab.set(tab);
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  toggleJuryPanel(): void {
    this.showJuryPanel.update((v) => !v);
  }

  setDept(dept: string): void {
    this.selectedDept.set(dept);
  }

  setRole(role: string): void {
    this.selectedRole.set(role);
  }

  getInitials(name: string): string {
    if (!name) return '??';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  fillCredentials(iin: string, pass: string): void {
    this.iin = iin;
    this.password = pass;
    this.errorMessage.set('');
  }

  loginAs(account: JuryAccount): void {
    this.fillCredentials(account.iin, account.password);
    this.onSubmit();
  }

  onSubmit(): void {
    const cleanIin = this.iin.trim();
    const cleanPass = this.password.trim();

    if (!cleanIin || cleanIin.length !== 12) {
      this.errorMessage.set('ИИН должен состоять ровно из 12 цифр');
      return;
    }

    if (!cleanPass) {
      this.errorMessage.set('Введите пароль');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.authService.login(cleanIin, cleanPass).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.profile.role === 'hr') {
          this.router.navigate(['/hr/employees']);
        } else {
          this.router.navigate(['/tasks']);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        const serverMsg = err?.error?.error || 'Неверный ИИН или пароль. Проверьте введенные данные.';
        this.errorMessage.set(serverMsg);
      }
    });
  }
}
