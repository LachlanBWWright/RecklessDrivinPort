import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-editor-sidebar',
  template: '<aside><ng-content /></aside>',
  styles: [
    `
      :host {
        display: flex;
        min-width: 0;
        min-height: 0;
        flex: 0 0 356px;
        align-self: stretch;
      }

      aside {
        display: flex;
        min-width: 0;
        min-height: 0;
        flex: 0 0 340px;
        flex-direction: column;
        gap: 0.75rem;
        height: auto;
        margin: 1rem 0 1rem 1rem;
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: 0.75rem;
        background: var(--bg);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
      }

      @media (max-width: 1100px) {
        :host {
          flex-basis: auto;
          width: 100%;
        }

        aside {
          flex-basis: auto;
          width: auto;
          height: auto;
          margin-right: 1rem;
        }
      }
    `,
  ],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorSidebarComponent {}
