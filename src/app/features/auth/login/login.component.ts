import { environment } from '../../../../environments/environment';
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ToastContainerComponent } from '../../../shared/components/toast-container/toast-container.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ToastContainerComponent],
  template: `
    <app-toast-container />
    <div class="auth-page">
      <a routerLink="/catalog" class="back-to-catalog" title="Ir al Catálogo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        <span>Catálogo</span>
      </a>

      <!-- Left Panel: Branding -->
      <div class="auth-brand">
        <div class="brand-content">
          <div class="brand-logo">
            <span class="logo-icon">F</span>
            <span class="logo-text">FashionStore</span>
          </div>
          <h1 class="brand-headline">Tu estilo,<br>tu identidad</h1>
          <p class="brand-sub">
            La plataforma inteligente para gestionar tu tienda de ropa con
            reservas, catálogo digital y pagos integrados.
          </p>
          <div class="brand-features">
            <div class="feature-pill">
              <span class="feature-dot success"></span> Catálogo en tiempo real
            </div>
            <div class="feature-pill">
              <span class="feature-dot primary"></span> Reservas inteligentes
            </div>
            <div class="feature-pill">
              <span class="feature-dot accent"></span> IA & Vestidor Virtual
            </div>
          </div>
        </div>
        <div class="brand-bg-orb orb-1"></div>
        <div class="brand-bg-orb orb-2"></div>
        <div class="brand-bg-orb orb-3"></div>
      </div>

      <!-- Right Panel: Login Form -->
      <div class="auth-form-panel">
        <div class="auth-form-card">
          <div class="form-header">
            <h2>Iniciar Sesión</h2>
            <p class="text-secondary text-sm">Accede a tu panel de gestión</p>
          </div>

          <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" class="form-body">

            <!-- Email -->
            <div class="form-group">
              <label for="email">Correo electrónico</label>
              <div class="input-wrapper">
                <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                <input
                  id="email"
                  type="email"
                  class="form-control"
                  [class.is-invalid]="isInvalid('email')"
                  formControlName="email"
                  placeholder="admin@fashionstore.com"
                  autocomplete="email"
                />
              </div>
              @if (isInvalid('email')) {
                <span class="form-error">Ingresa un correo válido</span>
              }
            </div>

            <!-- Password -->
            <div class="form-group">
              <label for="password">Contraseña</label>
              <div class="input-wrapper">
                <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input
                  id="password"
                  [type]="showPassword() ? 'text' : 'password'"
                  class="form-control"
                  [class.is-invalid]="isInvalid('password')"
                  formControlName="password"
                  placeholder="••••••••"
                  autocomplete="current-password"
                />
                <button type="button" class="input-toggle" (click)="togglePassword()">
                  @if (showPassword()) {
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  } @else {
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  }
                </button>
              </div>
              @if (isInvalid('password')) {
                <span class="form-error">La contraseña es requerida</span>
              }
            </div>

            <!-- Submit -->
            <button
              type="submit"
              class="btn btn-primary btn-full"
              [attr.disabled]="loginForm.invalid || loading() ? true : null"
            >
              @if (loading()) {
                <div class="spinner"></div> Iniciando sesión...
              } @else {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/>
                  <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                Ingresar
              }
            </button>

            <div class="form-divider">
              <span>¿Nuevo aquí?</span>
            </div>

            <a routerLink="/auth/register" class="btn btn-outline btn-full">
              Crear cuenta de cliente
            </a>

          </form>

          <!-- Dev hint -->
          <div class="dev-hint" *ngIf="quickLogin">
            <div class="hint-label">Acceso rápido (dev)</div>
            <button class="hint-btn" (click)="fillAdmin()" [disabled]="loading()">Admin tienda</button>
            <button class="hint-btn" (click)="fillSuperadmin()" [disabled]="loading()">Superadmin SaaS</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .auth-page {
      display: flex;
      min-height: 100vh;
      position: relative;
    }

    .back-to-catalog {
      position: absolute;
      top: 24px;
      left: 24px;
      z-index: 100;
      display: flex;
      align-items: center;
      gap: 8px;
      color: rgba(255, 255, 255, 0.8);
      text-decoration: none;
      font-weight: 500;
      padding: 8px 16px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 20px;
      backdrop-filter: blur(8px);
      transition: all 0.3s ease;
    }
    
    .back-to-catalog:hover {
      color: white;
      background: rgba(0, 0, 0, 0.4);
      transform: translateX(-4px);
    }
    
    .back-to-catalog svg {
      width: 18px;
      height: 18px;
    }

    @media (max-width: 768px) {
      .back-to-catalog {
        color: var(--text-primary);
        background: var(--bg-hover);
      }
      .back-to-catalog:hover {
        color: var(--color-primary);
        background: var(--bg-card);
      }
    }

    /* ── Brand Panel ── */
    .auth-brand {
      flex: 1;
      background: linear-gradient(135deg, #0D0D1A 0%, #13131F 40%, #1A1A2E 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px;
      position: relative;
      overflow: hidden;

      @media (max-width: 768px) { display: none; }
    }

    .brand-content {
      position: relative;
      z-index: 1;
      max-width: 440px;
    }

    .brand-logo {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 48px;
    }

    .logo-icon {
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-size: 1.3rem;
      font-weight: 800;
      color: white;
    }

    .logo-text {
      font-family: var(--font-display);
      font-size: 1.3rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .brand-headline {
      font-size: 3rem;
      font-weight: 800;
      line-height: 1.1;
      background: linear-gradient(135deg, #fff, var(--color-primary-light), var(--color-accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 16px;
    }

    .brand-sub {
      font-size: 1rem;
      color: var(--text-secondary);
      line-height: 1.7;
      margin-bottom: 36px;
    }

    .brand-features {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .feature-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-full);
      font-size: 0.85rem;
      color: var(--text-secondary);
      backdrop-filter: var(--glass-blur);
    }

    .feature-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      &.success { background: var(--color-success); box-shadow: 0 0 8px var(--color-success); }
      &.primary { background: var(--color-primary); box-shadow: 0 0 8px var(--color-primary); }
      &.accent  { background: var(--color-accent);  box-shadow: 0 0 8px var(--color-accent);  }
    }

    /* Background orbs */
    .brand-bg-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      pointer-events: none;
    }
    .orb-1 { width: 400px; height: 400px; background: rgba(108,99,255,0.12); top: -100px; right: -100px; }
    .orb-2 { width: 300px; height: 300px; background: rgba(255,101,132,0.08); bottom: -50px; left: -50px; }
    .orb-3 { width: 200px; height: 200px; background: rgba(45,212,191,0.06); top: 50%; left: 50%; }

    /* ── Form Panel ── */
    .auth-form-panel {
      width: 480px;
      background: var(--bg-surface);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px;

      @media (max-width: 768px) {
        width: 100%;
        background: var(--bg-base);
      }
    }

    .auth-form-card {
      width: 100%;
      max-width: 380px;
      animation: slideUp 400ms ease;
    }

    .form-header {
      text-align: center;
      margin-bottom: 32px;

      h2 {
        font-size: 1.75rem;
        font-weight: 800;
        margin-bottom: 6px;
      }
    }

    .form-body { display: flex; flex-direction: column; gap: 0; }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .input-icon {
      position: absolute;
      left: 14px;
      width: 18px;
      height: 18px;
      color: var(--text-muted);
      pointer-events: none;
    }

    .form-control { padding-left: 44px !important; }

    .input-toggle {
      position: absolute;
      right: 12px;
      width: 20px;
      height: 20px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color var(--transition-fast);
      svg { width: 18px; height: 18px; }
      &:hover { color: var(--text-primary); }
    }

    .form-divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 20px 0;
      &::before, &::after { content: ''; flex: 1; height: 1px; background: var(--border-subtle); }
      span { font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; }
    }

    .dev-hint {
      margin-top: 24px;
      padding: 12px;
      background: var(--bg-card);
      border: 1px dashed var(--border-subtle);
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }

    .hint-label {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .hint-btn {
      padding: 4px 12px;
      border-radius: var(--radius-sm);
      font-size: 0.78rem;
      font-weight: 600;
      background: var(--color-primary-glow);
      color: var(--color-primary-light);
      border: 1px solid rgba(108,99,255,0.3);
      transition: all var(--transition-fast);
      &:hover { background: var(--color-primary); color: white; }
    }
  `]
})
export class LoginComponent {
  readonly quickLogin = environment.quickLogin;
  loginForm: FormGroup;
  loading  = signal(false);
  showPassword = signal(false);

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private toast: ToastService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      email:    ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  isInvalid(field: string): boolean {
    const c = this.loginForm.get(field);
    return !!(c?.invalid && (c.dirty || c.touched));
  }

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  fillAdmin(): void {
    if (!this.quickLogin || this.loading()) return;
    this.loginForm.patchValue(this.quickLogin.admin);
    this.onSubmit();
  }

  fillSuperadmin(): void {
    if (!this.quickLogin || this.loading()) return;
    this.loginForm.patchValue(this.quickLogin.superadmin);
    this.onSubmit();
  }

  onSubmit(): void {
    if (this.loginForm.invalid) { this.loginForm.markAllAsTouched(); return; }
    this.loading.set(true);

    this.auth.login({
      username: this.loginForm.value.email,
      password: this.loginForm.value.password
    }).subscribe({
      next: () => { /* redirect handled in AuthService.fetchMe */ },
      error: (err) => {
        this.loading.set(false);
        this.toast.error(this.toast.extractError(err));
      }
    });
  }
}
