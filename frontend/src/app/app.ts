import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { HeaderComponent } from './shared/components/header/header.component';
import { SpotlightTourComponent } from './shared/components/spotlight-tour/spotlight-tour.component';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HeaderComponent, SpotlightTourComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  authService = inject(AuthService);
  private router = inject(Router);

  currentUrl = signal<string>(this.router.url);

  constructor() {
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd)
    ).subscribe((event) => {
      this.currentUrl.set(event.urlAfterRedirects || event.url);
    });
  }

  showAppHeader = computed(() => {
    const url = this.currentUrl();
    const isLogin = url === '/login' || url.startsWith('/login?') || url.startsWith('/login#');
    return this.authService.isLoggedIn() && !isLogin;
  });
}
