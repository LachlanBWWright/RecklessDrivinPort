import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { EditorObjectsSectionComponent } from './editor-objects-section.component';

@Component({
  selector: 'app-editor-objects-sidebar',
  templateUrl: './editor-objects-sidebar.component.html',
  host: {
    class: 'flex min-h-0 w-[320px] shrink-0 flex-col max-[1024px]:w-full',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectsSidebarComponent {
  @Input({ required: true }) state!: EditorObjectsSectionComponent;

  get host(): EditorObjectsSectionComponent {
    return this.state;
  }
}
