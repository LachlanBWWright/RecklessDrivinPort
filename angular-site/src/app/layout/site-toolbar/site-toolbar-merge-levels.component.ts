import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { levelDisplayNum } from '../../app-helpers';

const LEVEL_PACK_IDS = [140, 141, 142, 143, 144, 145, 146, 147, 148, 149];
@Component({
  selector: 'app-site-toolbar-merge-levels',
  templateUrl: './site-toolbar-merge-levels.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteToolbarMergeLevelsComponent {
  @Input() selectedLevelIds: readonly number[] = [];
  @Output() selectedLevelIdsChange = new EventEmitter<readonly number[]>();
  readonly levelPackIds = LEVEL_PACK_IDS;
  readonly levelDisplayNum = levelDisplayNum;

  isChecked(id: number): boolean {
    return this.selectedLevelIds.includes(id);
  }

  toggle(id: number, checked: boolean): void {
    const selected = new Set(this.selectedLevelIds);
    if (checked) selected.add(id);
    else selected.delete(id);
    this.selectedLevelIdsChange.emit([...selected]);
  }
}
