import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { EditorObjectsSectionComponent } from './editor-objects-section.component';

@Component({
  selector: 'app-editor-objects-canvas-panel',
  templateUrl: './editor-objects-canvas-panel.component.html',
  host: {
    class: 'flex h-full min-h-0 min-w-0 flex-1 flex-col',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectsCanvasPanelComponent {
  @Input({ required: true }) state!: EditorObjectsSectionComponent;

  get host(): EditorObjectsSectionComponent {
    return this.state;
  }
}
