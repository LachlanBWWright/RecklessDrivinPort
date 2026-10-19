import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { FormGroup } from '@angular/forms';

type AudioEntry = { id: number; sizeBytes: number; durationMs?: number };

@Component({
  selector: 'app-editor-road-skid-sound',
  templateUrl: './editor-road-skid-sound.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorRoadSkidSoundComponent {
  @Input({ required: true }) form!: FormGroup;
  @Input() audioEntries: AudioEntry[] = [];
  @Input() workerBusy = false;
  @Output() play = new EventEmitter<number>();

  get value(): number {
    return Number(this.form.get('skidSound')?.value ?? 0);
  }

  getAudioEntry(id: number): AudioEntry | null {
    return this.audioEntries.find((entry) => entry.id === id) ?? null;
  }

  getLabel(id: number): string {
    const entry = this.getAudioEntry(id);
    if (!entry) return '#' + id;
    return entry.durationMs === undefined
      ? '#' + entry.id + ' · ' + entry.sizeBytes.toLocaleString() + ' B'
      : '#' + entry.id + ' · ' + (entry.durationMs / 1000).toFixed(1) + 's';
  }
}
