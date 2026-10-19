import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { RoadInfoOption } from '../../../level-editor.service';

@Component({
  selector: 'app-editor-road-info-row',
  templateUrl: './editor-road-info-row.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorRoadInfoRowComponent {
  @Input({ required: true }) option!: RoadInfoOption;
  @Input() selectedRoadInfoId: number | null = null;
  @Input() getRoadDeleteTooltip!: (id: number) => string;
  @Input() canDeleteRoadInfo!: (id: number) => boolean;
  @Output() selected = new EventEmitter<number>();
  @Output() deleted = new EventEmitter<number>();
}
