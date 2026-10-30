import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  ElementRef,
  ViewChild,
  type OnChanges,
} from '@angular/core';
import type { ObjectPos } from '../level-editor.service';

@Component({
  selector: 'app-editor-object-list-row',
  templateUrl: './editor-object-list-row.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectListRowComponent implements OnChanges {
  @ViewChild('rowButton') private rowButton?: ElementRef<HTMLButtonElement>;

  ngOnChanges(): void {
    if (this.selected) this.rowButton?.nativeElement.scrollIntoView?.({ block: 'nearest' });
  }
  @Input({ required: true }) object!: ObjectPos;
  @Input({ required: true }) index = 0;
  @Input() selected = false;
  @Input() tabStop = false;
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
  @Input() getFallbackColor: (typeRes: number) => string = () => '#888';
  @Output() selectedChange = new EventEmitter<void>();
}
