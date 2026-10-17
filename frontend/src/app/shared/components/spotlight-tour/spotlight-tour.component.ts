import {
  Component,
  inject,
  HostListener,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { OnboardingTourService } from '../../../core/services/onboarding-tour.service';
import { I18nService } from '../../../core/services/i18n.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-spotlight-tour',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './spotlight-tour.component.html',
  styleUrl: './spotlight-tour.component.scss',
})
export class SpotlightTourComponent {
  readonly tourService = inject(OnboardingTourService);
  readonly i18n = inject(I18nService);

  private readonly PADDING = 8;
  private readonly CARD_WIDTH = 380;
  private readonly CARD_HEIGHT_ESTIMATE = 220;

  // Window bounds
  private get winWidth(): number {
    return typeof window !== 'undefined' ? window.innerWidth : 1200;
  }
  private get winHeight(): number {
    return typeof window !== 'undefined' ? window.innerHeight : 800;
  }

  // Calculated cutout coordinates
  readonly cutout = computed(() => {
    const rect = this.tourService.targetRect();
    if (!rect) return null;

    const x = Math.max(0, rect.left - this.PADDING);
    const y = Math.max(0, rect.top - this.PADDING);
    const width = Math.min(this.winWidth - x, rect.width + this.PADDING * 2);
    const height = Math.min(this.winHeight - y, rect.height + this.PADDING * 2);

    return { x, y, width, height };
  });

  // Calculated tooltip card placement
  readonly cardStyle = computed(() => {
    const cut = this.cutout();
    const step = this.tourService.currentStep();
    const preferredPlacement = step?.placement || 'bottom';

    if (!cut) {
      // Center in screen if no target rect
      return {
        top: `${Math.max(40, (this.winHeight - this.CARD_HEIGHT_ESTIMATE) / 2)}px`,
        left: `${Math.max(20, (this.winWidth - this.CARD_WIDTH) / 2)}px`,
        transform: 'none',
      };
    }

    let top = 0;
    let left = 0;

    // Center horizontally aligned with target
    const targetCenterX = cut.x + cut.width / 2;
    left = targetCenterX - this.CARD_WIDTH / 2;

    // Prevent offscreen horizontally
    if (left < 16) left = 16;
    if (left + this.CARD_WIDTH > this.winWidth - 16) {
      left = this.winWidth - this.CARD_WIDTH - 16;
    }

    // Determine vertical placement
    const spaceBelow = this.winHeight - (cut.y + cut.height);
    const spaceAbove = cut.y;

    if (preferredPlacement === 'bottom') {
      if (spaceBelow >= this.CARD_HEIGHT_ESTIMATE + 16 || spaceBelow >= spaceAbove) {
        top = cut.y + cut.height + 14;
      } else {
        top = Math.max(16, cut.y - this.CARD_HEIGHT_ESTIMATE - 14);
      }
    } else {
      // 'top'
      if (spaceAbove >= this.CARD_HEIGHT_ESTIMATE + 16 || spaceAbove >= spaceBelow) {
        top = Math.max(16, cut.y - this.CARD_HEIGHT_ESTIMATE - 14);
      } else {
        top = cut.y + cut.height + 14;
      }
    }

    // Safety bounds
    if (top < 16) top = 16;
    if (top + this.CARD_HEIGHT_ESTIMATE > this.winHeight - 16) {
      top = Math.max(16, this.winHeight - this.CARD_HEIGHT_ESTIMATE - 16);
    }

    return {
      top: `${top}px`,
      left: `${left}px`,
      transform: 'none',
    };
  });

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.tourService.isActive()) return;

    if (event.key === 'Escape') {
      this.tourService.skipTour();
    } else if (event.key === 'ArrowRight') {
      this.tourService.nextStep();
    } else if (event.key === 'ArrowLeft') {
      this.tourService.prevStep();
    }
  }
}
