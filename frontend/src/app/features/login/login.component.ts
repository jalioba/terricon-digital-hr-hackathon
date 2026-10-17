import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  i18n = inject(I18nService);

  iin: string = '880101300555';
  password: string = 'JanaMen2026!';
  showPassword = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  fillCredentials(iin: string, pass: string): void {
    this.iin = iin;
    this.password = pass;
    this.errorMessage.set('');
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
