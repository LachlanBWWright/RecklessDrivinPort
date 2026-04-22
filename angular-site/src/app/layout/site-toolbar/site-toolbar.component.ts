import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import type { ParsedLevel } from '../../level-editor.service';
import { levelDisplayNum } from '../../app-helpers';

export type SiteTab = 'game' | 'editor';
export type EditorSection = 'properties' | 'object-groups' | 'object-types' | 'objects' | 'sprites' | 'tiles' | 'audio' | 'screens';

@Component({
  selector: 'app-site-toolbar',
  templateUrl: './site-toolbar.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteToolbarComponent {
  @Input() activeTab: SiteTab = 'game';
  @Input() activeEditorSection: EditorSection = 'properties';
  @Input() parsedLevels: ParsedLevel[] = [];
  @Input() selectedLevelId: number | null = null;
  @Input() hasEditorData = false;
  @Input() workerBusy = false;
  @Input() editorError = '';
  @Output() tabChange = new EventEmitter<SiteTab>();
  @Output() editorSectionChange = new EventEmitter<EditorSection>();
  @Output() loadDefaultResources = new EventEmitter<void>();
  @Output() resourceFileSelected = new EventEmitter<File | null>();
  @Output() downloadEditedResources = new EventEmitter<void>();
  @Output() clearEditorFile = new EventEmitter<void>();
  @Output() selectLevel = new EventEmitter<number>();

  readonly editorSections: { id: EditorSection; label: string; icon: string }[] = [
    { id: 'properties', label: 'Properties', icon: 'tune' },
    { id: 'object-groups', label: 'Object Groups', icon: 'inventory_2' },
    { id: 'object-types', label: 'Object Types', icon: 'category' },
    { id: 'objects', label: 'Objects & Tracks', icon: 'route' },
    { id: 'sprites', label: 'Sprites', icon: 'photo_library' },
    { id: 'tiles', label: 'Tiles', icon: 'grid_on' },
    { id: 'audio', label: 'Audio', icon: 'audiotrack' },
    { id: 'screens', label: 'Screens', icon: 'tv' },
  ];

  readonly levelDisplayNum = levelDisplayNum;

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.resourceFileSelected.emit(input?.files?.[0] ?? null);
  }
}
