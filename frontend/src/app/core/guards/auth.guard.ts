import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Protects application routes from unauthenticated access.
 * Redirects unauthenticated users to /login.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};

/**
 * Smart redirect for root URL ('/').
 * - If not logged in -> /login
 * - If logged in as HR -> /hr/employees
 * - If logged in as Employee or Manager -> /tasks
 */
export const rootRedirectGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login']);
  }

  if (auth.isHr()) {
    return router.createUrlTree(['/hr/employees']);
  }

  return router.createUrlTree(['/tasks']);
};
