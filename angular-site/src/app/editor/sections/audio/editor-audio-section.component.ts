import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import type { SndInfo } from '../../../snd-codec';

@Component({
  selector: 'app-editor-audio-section',
  templateUrl: './editor-audio-section.component.html',
  styleUrls: ['./editor-audio-section.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorAudioSectionComponent {
  @Input() audioEntries: { id: number; sizeBytes: number; durationMs?: number }[] = [];
  @Input() selectedAudioId: number | null = null;
  @Input() selectedAudioBytes: Uint8Array | null = null;
  @Input() selectedAudioSndInfo: SndInfo | null = null;
  @Input() audioPlayerVolume = 80;
  @Input() audioDecodeInProgress = false;
  @Input() audioControllable = false;
  @Input() audioPlaying = false;
  @Input() audioCurrentTime = 0;
  @Input() audioDuration = 0;
  @Input() workerBusy = false;

  @Output() selectAudioEntry = new EventEmitter<number>();
  @Output() setAudioPlayerVolume = new EventEmitter<number>();
  @Output() togglePlayPause = new EventEmitter<void>();
  @Output() seekAudio = new EventEmitter<number>();
  @Output() exportAudioWav = new EventEmitter<void>();
  @Output() audioWavUpload = new EventEmitter<Event>();
  @Output() addAudioEntry = new EventEmitter<void>();

  formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
    const s = Math.floor(seconds);
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${mm}:${ss.toString().padStart(2, '0')}`;
  }
}
