import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-editor-sidebar-scroll',
  template: '<ng-content />',
  styles: [
    `
      :host {
        scrollbar-width: thin;
        scrollbar-color: var(--surface4) var(--bg);
      }

      :host::-webkit-scrollbar {
        width: 0.5rem;
        height: 0.5rem;
      }

      :host::-webkit-scrollbar-track {
        background: var(--bg);
      }

      :host::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: var(--surface4);
      }

      :host::-webkit-scrollbar-thumb:hover {
        background: var(--muted);
      }
    `,
  ],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorSidebarScrollComponent {}
