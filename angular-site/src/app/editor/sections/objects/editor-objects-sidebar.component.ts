import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { EditorObjectsSectionComponent } from './editor-objects-section.component';

@Component({
  selector: 'app-editor-objects-sidebar',
  templateUrl: './editor-objects-sidebar.component.html',
  host: {
    class: 'flex min-h-0 w-[320px] shrink-0 flex-col max-[1024px]:w-full max-[1024px]:max-h-[42vh] max-[1024px]:flex-[0_0_auto]',
  },
  standalone: false,
  // The owner mutates this state object while its identity stays stable.
  changeDetection: ChangeDetectionStrategy.Default,
})
export class EditorObjectsSidebarComponent {
  @Input({ required: true }) state!: EditorObjectsSectionComponent;

  get host(): EditorObjectsSectionComponent {
    return this.state;
  }
}
