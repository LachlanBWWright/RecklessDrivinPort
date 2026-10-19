import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { ParsedLevel } from '../../level-editor.service';
import { levelDisplayNum } from '../../app-helpers';

@Component({
  selector: 'app-editor-toolbar-level-buttons',
  templateUrl: './editor-toolbar-level-buttons.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorToolbarLevelButtonsComponent {
  @Input() parsedLevels: ParsedLevel[] = [];
  @Input() selectedLevelId: number | null = null;
  @Output() selectLevel = new EventEmitter<number>();
  readonly levelDisplayNum = levelDisplayNum;
}
