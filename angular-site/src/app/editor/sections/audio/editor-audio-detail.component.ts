import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl } from '@angular/forms';
import type { SndInfo } from '../../../snd-codec';
import { formatTime } from '../../../app-runtime';

@Component({
  selector: 'app-editor-audio-detail',
  templateUrl: './editor-audio-detail.component.html',
  host: {
    class: 'flex h-full min-h-0 min-w-0 flex-1 flex-col',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorAudioDetailComponent {
  @Input() selectedAudioId: number | null = null;
  @Input() selectedAudioBytes: Uint8Array | null = null;
  @Input() selectedAudioSndInfo: SndInfo | null = null;
  @Input() audioVolumeControl!: FormControl<number | null>;
  @Input() audioSeekControl!: FormControl<number | null>;
  @Input() audioPlayerVolume = 80;
  @Input() audioDecodeInProgress = false;
  @Input() audioControllable = false;
  @Input() audioPlaying = false;
  @Input() audioCurrentTime = 0;
  @Input() audioDuration = 0;
  @Input() workerBusy = false;
  @Output() togglePlayPause = new EventEmitter<void>();
  @Output() exportAudioWav = new EventEmitter<void>();
  @Output() audioWavUpload = new EventEmitter<Event>();

  readonly formatTime = formatTime;
}
