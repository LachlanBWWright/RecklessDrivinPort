import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { moduleMetadata } from '@storybook/angular-vite';
import { APP_DECLARATIONS, MATERIAL_MODULES } from '../app-module';

export const appStoryModule = moduleMetadata({
  declarations: APP_DECLARATIONS,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_MODULES],
});

export const pageShellStyles = `
  :host {
    display: block;
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
  }
`;
