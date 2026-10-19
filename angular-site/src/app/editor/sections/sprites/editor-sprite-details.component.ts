import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { getSpriteFormatLabel } from '../../../sprite-editor';

type SpriteFrame = { id: number; bitDepth: 8 | 16; width: number; height: number };

@Component({
  selector: 'app-editor-sprite-details',
  template: `
    @if (getSpriteDataUrl(frame.id); as url) {
      <app-image-preview
        [src]="url"
        alt="sprite preview"
        [pixelated]="true"
        loadingIcon="image"
      ></app-image-preview>
    } @else {
      <app-image-preview
        [src]="null"
        alt="sprite preview"
        [pixelated]="true"
        loadingIcon="image"
      ></app-image-preview>
    }
    <mat-card class="w-full shrink-0 !border !border-[var(--border)] !bg-[var(--surface3)]">
      <mat-card-content class="!px-3.5 !py-2.5">
        <p
          class="m-0 text-[0.82rem] leading-[1.7] text-[var(--on-surface)] [&_strong]:font-semibold [&_strong]:text-[var(--muted)]"
        >
          <strong>Frame</strong> #{{ frame.id }}<br />
          <strong>Depth</strong> {{ frame.bitDepth }}-bit ({{
            getSpriteFormatLabel(frame.bitDepth)
          }})<br />
          <strong>Size</strong> {{ frame.width }}×{{ frame.height }} px
        </p>
      </mat-card-content>
    </mat-card>
    <div class="flex shrink-0 flex-wrap justify-center gap-2">
      @if (frame.bitDepth === 16) {
        <button
          mat-raised-button
          color="primary"
          class="inline-flex items-center gap-1"
          (click)="openEditor.emit(frame.id)"
          [disabled]="workerBusy"
        >
          <mat-icon>brush</mat-icon> Edit Pixels
        </button>
        <input
          #spritePngInput
          type="file"
          accept="image/png,image/*"
          style="display:none"
          (change)="pngUpload.emit({ event: $event, spriteId: frame.id })"
        />
        <button
          mat-stroked-button
          class="inline-flex items-center gap-1"
          (click)="spritePngInput.click()"
          [disabled]="workerBusy"
          matTooltip="Upload a PNG to replace this sprite (scaled to match dimensions)"
        >
          <mat-icon>upload</mat-icon> Upload PNG
        </button>
      }
      <button mat-stroked-button class="inline-flex items-center gap-1" (click)="exportPng.emit()">
        <mat-icon>download</mat-icon> Export PNG
      </button>
    </div>
  `,
  host: {
    class: 'flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorSpriteDetailsComponent {
  @Input() frame!: SpriteFrame;
  @Input() workerBusy = false;
  @Input() getSpriteDataUrl: (frameId: number) => string | null = () => null;
  @Output() openEditor = new EventEmitter<number>();
  @Output() pngUpload = new EventEmitter<{ event: Event; spriteId: number }>();
  @Output() exportPng = new EventEmitter<void>();
  readonly getSpriteFormatLabel = getSpriteFormatLabel;
}
