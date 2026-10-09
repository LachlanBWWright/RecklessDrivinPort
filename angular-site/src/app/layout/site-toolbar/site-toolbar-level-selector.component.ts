import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { ParsedLevel } from '../../level-editor.service';
import { levelDisplayNum } from '../../app-helpers';

@Component({
  selector: 'app-site-toolbar-level-selector',
  templateUrl: './site-toolbar-level-selector.component.html',
  host: {
    class: 'block min-w-0 max-w-[180px] flex-[0_1_180px]',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteToolbarLevelSelectorComponent {
  @Input() selectedLevelId: number | null = null;
  @Input() parsedLevels: ParsedLevel[] = [];
  @Input() workerBusy = false;
  @Output() selectLevel = new EventEmitter<number>();
  readonly levelDisplayNum = levelDisplayNum;
}
