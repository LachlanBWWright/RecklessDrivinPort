import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-editor-screen-details',
  template: `
    @if (previewDataUrl; as url) {
      <app-image-preview
        [src]="url"
        alt="icon preview"
        [pixelated]="!isPictureResourceType(type)"
        [loadingIcon]="isPictureResourceType(type) ? 'wallpaper' : 'image'"
      ></app-image-preview>
    } @else {
      <app-image-preview
        [src]="null"
        alt="icon preview"
        [pixelated]="!isPictureResourceType(type)"
        [loadingIcon]="isPictureResourceType(type) ? 'wallpaper' : 'image'"
      ></app-image-preview>
    }
    @if (!isPictureResourceType(type)) {
      <div class="flex shrink-0 flex-wrap gap-2">
        <button
          mat-raised-button
          color="primary"
          (click)="openImageEditor.emit()"
          [disabled]="workerBusy"
          matTooltip="Open in-browser pixel editor for this icon resource"
        >
          <mat-icon>brush</mat-icon> Edit Image
        </button>
        <button mat-stroked-button (click)="exportPng.emit()">
          <mat-icon>download</mat-icon> Export PNG
        </button>
        <input
          #iconPngInput
          type="file"
          accept="image/png,image/*"
          style="display:none"
          (change)="pngUpload.emit($event)"
        />
        <button
          mat-stroked-button
          (click)="iconPngInput.click()"
          [disabled]="workerBusy"
          [matTooltip]="uploadTooltip"
        >
          <mat-icon>upload</mat-icon> Replace PNG
        </button>
      </div>
      <p class="mt-3 shrink-0 text-[0.85em] text-[var(--muted)]">
        @if (type === 'ICN#' || type === 'ics#') {
          ICN# / ics# resources are 32×32 1-bit black-and-white bitmaps.
        } @else if (type === 'icl8') {
          icl8 resources are 32×32 8-bit colour-palette icons (Mac system palette).
        } @else if (type === 'ics8') {
          ics8 resources are 16×16 8-bit colour-palette icons (Mac system palette).
        }
      </p>
    } @else {
      <div class="flex shrink-0 flex-wrap gap-2">
        <button
          mat-raised-button
          color="primary"
          (click)="openImageEditor.emit()"
          [disabled]="workerBusy"
          matTooltip="Open in-browser pixel editor for this picture resource"
        >
          <mat-icon>brush</mat-icon> Edit Image
        </button>
        <input
          #iconPictureInput
          type="file"
          accept="image/png,image/jpeg,image/webp,image/*"
          style="display:none"
          (change)="pngUpload.emit($event)"
        />
        <button
          mat-stroked-button
          (click)="iconPictureInput.click()"
          [disabled]="workerBusy"
          matTooltip="Replace this picture resource using a conventional image file"
        >
          <mat-icon>image</mat-icon> Replace Image
        </button>
        <button mat-stroked-button (click)="exportRaw.emit()">
          <mat-icon>download</mat-icon> Export Raw
        </button>
        <input
          #iconRawInput
          type="file"
          accept=".bin,.raw,.pict,.ppic,application/octet-stream"
          style="display:none"
          (change)="rawUpload.emit($event)"
        />
        <button
          mat-stroked-button
          (click)="iconRawInput.click()"
          [disabled]="workerBusy"
          matTooltip="Replace this picture resource with a raw PICT/PPIC binary blob"
        >
          <mat-icon>upload</mat-icon> Replace Raw
        </button>
      </div>
    }
  `,
  host: {
    class: 'flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorScreenDetailsComponent {
  @Input() previewDataUrl: string | null = null;
  @Input() type = 'ICN#';
  @Input() workerBusy = false;
  @Output() openImageEditor = new EventEmitter<void>();
  @Output() exportPng = new EventEmitter<void>();
  @Output() exportRaw = new EventEmitter<void>();
  @Output() pngUpload = new EventEmitter<Event>();
  @Output() rawUpload = new EventEmitter<Event>();

  isPictureResourceType(type: string): boolean {
    const normalized = type.trim().toUpperCase();
    return normalized === 'PICT' || normalized === 'PPIC';
  }

  get uploadTooltip(): string {
    if (this.type === 'icl8') return 'Upload PNG (32×32), converted to 8-bit Mac palette';
    if (this.type === 'ics8') return 'Upload PNG (16×16), converted to 8-bit Mac palette';
    if (this.type === 'ics#') return 'Upload PNG (16×16), converted to 1-bit';
    return 'Upload PNG (32×32), converted to 1-bit';
  }
}
