import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter } from '@angular/core';
import type { ResourceMergeOptions } from '../../resource-merge';
@Component({
  selector: 'app-site-toolbar-merge-options',
  templateUrl: './site-toolbar-merge-options.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteToolbarMergeOptionsComponent {
  @Input({ required: true }) options!: ResourceMergeOptions;
  @Output() optionsChange = new EventEmitter<ResourceMergeOptions>();

  setOption(key: keyof ResourceMergeOptions, checked: boolean): void {
    this.optionsChange.emit({ ...this.options, [key]: checked });
  }
}
