import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import type { ParsedLevel } from '../../level-editor.service';
import { levelDisplayNum } from '../../app-helpers';
import type { ResourceMergeOptions } from '../../resource-merge';

export type SiteTab = 'game' | 'editor';
export type EditorSection =
  | 'properties'
  | 'object-groups'
  | 'object-types'
  | 'objects'
  | 'sprites'
  | 'tiles'
  | 'audio'
  | 'screens'
  | 'strings';

@Component({
  selector: 'app-site-toolbar',
  templateUrl: './site-toolbar.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteToolbarComponent {
  readonly levelPackIds = [140, 141, 142, 143, 144, 145, 146, 147, 148, 149];

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
  @Output() resourceMergeSelected = new EventEmitter<{
    file: File;
    options: ResourceMergeOptions;
  }>();
  @Output() downloadEditedResources = new EventEmitter<void>();
  @Output() clearEditorFile = new EventEmitter<void>();
  @Output() selectLevel = new EventEmitter<number>();
  @Output() previewSelectedLevel = new EventEmitter<number>();

  pendingMergeFile: File | null = null;
  mergeDialogOpen = false;
  previewDialogOpen = false;
  readonly mergeOptions: ResourceMergeOptions = {
    levels: true,
    levelResourceIds: [...this.levelPackIds],
    objectTypes: true,
    objectGroups: true,
    roadInfo: true,
    sprites: false,
    tiles: false,
    audio: false,
    screens: false,
    strings: false,
    other: false,
  };

  readonly editorSections: { id: EditorSection; label: string; icon: string }[] = [
    { id: 'properties', label: 'Properties', icon: 'tune' },
    { id: 'object-groups', label: 'Object Groups', icon: 'inventory_2' },
    { id: 'object-types', label: 'Object Types', icon: 'category' },
    { id: 'objects', label: 'Objects & Tracks', icon: 'route' },
    { id: 'sprites', label: 'Sprites', icon: 'photo_library' },
    { id: 'tiles', label: 'Tiles', icon: 'grid_on' },
    { id: 'audio', label: 'Audio', icon: 'audiotrack' },
    { id: 'screens', label: 'Screens', icon: 'tv' },
    { id: 'strings', label: 'Strings', icon: 'text_fields' },
  ];

  readonly levelDisplayNum = levelDisplayNum;

  onResourceUploadSelected(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const file = input?.files?.[0] ?? null;
    if (!file) {
      return;
    }

    if (!this.hasEditorData) {
      this.resourceFileSelected.emit(event);
      if (input) {
        input.value = '';
      }
      return;
    }

    this.pendingMergeFile = file;
    this.mergeDialogOpen = true;
    if (input) {
      input.value = '';
    }
  }

  closeMergeDialog(): void {
    this.mergeDialogOpen = false;
    this.pendingMergeFile = null;
    this.mergeOptions.levelResourceIds = [...this.levelPackIds];
  }

  confirmMergeDialog(): void {
    if (!this.pendingMergeFile) {
      return;
    }
    this.resourceMergeSelected.emit({
      file: this.pendingMergeFile,
      options: { ...this.mergeOptions },
    });
    this.closeMergeDialog();
  }

  launchSelectedLevelPreview(): void {
    if (this.selectedLevelId === null) {
      return;
    }
    this.previewDialogOpen = true;
  }

  closePreviewDialog(): void {
    this.previewDialogOpen = false;
  }

  confirmPreviewDialog(): void {
    const levelId = this.selectedLevelId;
    if (levelId === null) {
      this.previewDialogOpen = false;
      return;
    }
    this.previewSelectedLevel.emit(levelId);
    this.previewDialogOpen = false;
  }

  levelCheckboxChecked(levelResId: number): boolean {
    return (this.mergeOptions.levelResourceIds ?? []).includes(levelResId);
  }

  onLevelCheckboxChange(levelResId: number, checked: boolean): void {
    const selected = new Set(this.mergeOptions.levelResourceIds ?? []);
    if (checked) {
      selected.add(levelResId);
    } else {
      selected.delete(levelResId);
    }
    this.mergeOptions.levelResourceIds = [...selected].sort((a, b) => a - b);
  }
}
