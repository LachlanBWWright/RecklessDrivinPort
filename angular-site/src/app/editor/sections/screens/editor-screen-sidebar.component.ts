import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
@Component({
  selector: 'app-editor-screen-sidebar',
  templateUrl: './editor-screen-sidebar.component.html',
  host: { style: 'display: contents' },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorScreenSidebarComponent {
  @Input() entries: { type: string; id: number; label: string }[] = [];
  @Input() selectedId: number | null = null;
  @Input() selectedType = '';
  @Input() workerBusy = false;
  @Input() getIconThumbDataUrl: (type: string, id: number) => string | null = () => null;
  @Output() addEntry = new EventEmitter<void>();
  @Output() selectedChange = new EventEmitter<{ id: number; type: string }>();
}
