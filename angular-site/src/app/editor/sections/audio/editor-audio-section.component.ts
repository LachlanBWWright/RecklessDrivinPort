import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { SndInfo } from '../../../snd-codec';
import { formatTime } from '../../../app-runtime';

@Component({
  selector: 'app-editor-audio-section',
  templateUrl: './editor-audio-section.component.html',
  host: {
    class: 'flex min-h-0 w-full flex-1 flex-col',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorAudioSectionComponent implements OnChanges {
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

  readonly formatTime = formatTime;
  readonly audioVolumeControl = new FormControl<number | null>(null);
  readonly audioSeekControl = new FormControl<number | null>(null);

  constructor() {
    this.audioVolumeControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      const next = Number(value);
      if (!Number.isNaN(next)) {
        this.setAudioPlayerVolume.emit(next);
      }
    });
    this.audioSeekControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      const next = Number(value);
      if (!Number.isNaN(next)) {
        this.seekAudio.emit(next);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['audioPlayerVolume']) {
      this.audioVolumeControl.setValue(this.audioPlayerVolume, { emitEvent: false });
    }
    if (changes['audioCurrentTime']) {
      this.audioSeekControl.setValue(this.audioCurrentTime, { emitEvent: false });
    }
    if (changes['audioControllable']) {
      if (this.audioControllable) {
        this.audioSeekControl.enable({ emitEvent: false });
      } else {
        this.audioSeekControl.disable({ emitEvent: false });
      }
    }
  }
}
