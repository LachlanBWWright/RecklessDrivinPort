import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { EditorObjectsSectionComponent } from './editor-objects-section.component';

@Component({
  selector: 'app-editor-objects-canvas-panel',
  templateUrl: './editor-objects-canvas-panel.component.html',
  host: {
    class: 'flex h-full min-h-0 min-w-0 flex-1 flex-col max-[1024px]:h-[360px] max-[1024px]:min-h-[360px] max-[1024px]:flex-[0_0_360px]',
  },
  standalone: false,
  // The owner mutates this state object while its identity stays stable.
  changeDetection: ChangeDetectionStrategy.Default,
})
export class EditorObjectsCanvasPanelComponent {
  @Input({ required: true }) state!: EditorObjectsSectionComponent;

  get host(): EditorObjectsSectionComponent {
    return this.state;
  }
}
