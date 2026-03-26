import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import type { ParsedLevel } from '../../level-editor.service';

export type SiteTab = 'game' | 'editor';
export type EditorSection = 'properties' | 'objects' | 'sprites' | 'tiles' | 'audio' | 'screens';

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
  @Output() resourceFileSelected = new EventEmitter<Event>();
  @Output() downloadEditedResources = new EventEmitter<void>();
  @Output() clearEditorFile = new EventEmitter<void>();
  @Output() selectLevel = new EventEmitter<number>();

  readonly editorSections: { id: EditorSection; label: string; icon: string }[] = [
    { id: 'properties', label: 'Properties', icon: 'tune' },
    { id: 'objects', label: 'Objects & Tracks', icon: 'route' },
    { id: 'sprites', label: 'Sprites', icon: 'photo_library' },
    { id: 'tiles', label: 'Tiles', icon: 'grid_on' },
    { id: 'audio', label: 'Audio', icon: 'audiotrack' },
    { id: 'screens', label: 'Screens', icon: 'tv' },
  ];

  levelDisplayNum(resourceId: number): number {
    return resourceId - 139;
  }
}
