import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { ObjectGroupDefinition, ObjectGroupRef } from '../level-editor.service';

@Component({
  selector: 'app-properties-object-group-selector',
  templateUrl: './properties-object-group-selector.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertiesObjectGroupSelectorComponent {
  @Input({ required: true }) group!: ObjectGroupRef;
  @Input() definitions: ObjectGroupDefinition[] = [];
  @Input() disabled = false;
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
  @Output() valueChange = new EventEmitter<number>();

  getSprites(resId: number): number[] {
    return (
      this.definitions.find((group) => group.id === resId)?.entries.map((entry) => entry.typeRes) ??
      []
    );
  }

  get label(): string {
    if (this.group.resID === 0) return '0 · empty slot';
    return this.definitions.some((item) => item.id === this.group.resID)
      ? '#' + this.group.resID
      : '#' + this.group.resID + ' (custom)';
  }

  get hasCustomValue(): boolean {
    return this.group.resID !== 0 && !this.definitions.some((item) => item.id === this.group.resID);
  }
}
