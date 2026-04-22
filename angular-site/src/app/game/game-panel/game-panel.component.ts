import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-game-panel',
  templateUrl: './game-panel.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamePanelComponent {
  @Input() activeTab: 'game' | 'editor' = 'game';
  @Input() statusText = '';
  @Input() progressPct = 0;
  @Input() overlayVisible = true;
  @Input() masterVolume = 80;
  @Input() customResourcesLoaded = false;
  @Input() customResourcesName: string | null = null;
  @Input() gameRestarting = false;

  @Output() toggleFullscreen = new EventEmitter<void>();
  @Output() volumeChange = new EventEmitter<number>();
  @Output() customResourcesFileSelected = new EventEmitter<File | null>();
  @Output() restartGameWithCustomResources = new EventEmitter<void>();
  @Output() clearCustomResources = new EventEmitter<void>();

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.customResourcesFileSelected.emit(input?.files?.[0] ?? null);
  }
}
