import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

@Component({
  selector: 'app-image-preview',
  templateUrl: './image-preview.component.html',
  styleUrls: ['./image-preview.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImagePreviewComponent implements OnChanges {
  @Input() src: string | null = null;
  @Input() alt = 'image preview';
  @Input() pixelated = false;
  @Input() loadingIcon = 'image';

  @ViewChild('viewport') private viewport?: ElementRef<HTMLDivElement>;

  zoom = 1;
  panX = 0;
  panY = 0;

  private imageWidth = 0;
  private imageHeight = 0;
  private dragStart: { pointerId: number; x: number; y: number; panX: number; panY: number } | null = null;

  get imageTransform(): string {
    return `translate(calc(-50% + ${this.panX}px), calc(-50% + ${this.panY}px)) scale(${this.zoom})`;
  }

  get zoomPercent(): number {
    return Math.round(this.zoom * 100);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('src' in changes) {
      this.imageWidth = 0;
      this.imageHeight = 0;
      this.dragStart = null;
      this.resetView();
    }
  }

  onImageLoad(image: HTMLImageElement): void {
    this.imageWidth = image.naturalWidth;
    this.imageHeight = image.naturalHeight;
    this.fitToViewport();
  }

  zoomIn(): void {
    this.setZoom(this.zoom * 1.25);
  }

  zoomOut(): void {
    this.setZoom(this.zoom / 1.25);
  }

  resetView(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  fitToViewport(): void {
    const viewport = this.viewport?.nativeElement;
    if (!viewport || this.imageWidth <= 0 || this.imageHeight <= 0) {
      this.resetView();
      return;
    }

    const horizontalPadding = 40;
    const verticalPadding = 40;
    const usableWidth = Math.max(1, viewport.clientWidth - horizontalPadding);
    const usableHeight = Math.max(1, viewport.clientHeight - verticalPadding);
    const fitZoom = Math.min(usableWidth / this.imageWidth, usableHeight / this.imageHeight);
    this.zoom = this.clampZoom(fitZoom);
    this.panX = 0;
    this.panY = 0;
  }

  onZoomSliderInput(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    this.setZoom(Number(input.value) / 100);
  }

  onWheel(event: WheelEvent): void {
    if (!this.src) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.setZoom(this.zoom * direction);
  }

  onPointerDown(event: PointerEvent): void {
    if (!this.src) return;
    const viewport = this.viewport?.nativeElement;
    if (!viewport) return;
    viewport.setPointerCapture(event.pointerId);
    this.dragStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: this.panX,
      panY: this.panY,
    };
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragStart || this.dragStart.pointerId !== event.pointerId) return;
    this.panX = this.dragStart.panX + event.clientX - this.dragStart.x;
    this.panY = this.dragStart.panY + event.clientY - this.dragStart.y;
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.dragStart || this.dragStart.pointerId !== event.pointerId) return;
    this.dragStart = null;
  }

  private setZoom(value: number): void {
    this.zoom = this.clampZoom(value);
  }

  private clampZoom(value: number): number {
    if (!Number.isFinite(value)) return 1;
    return Math.min(16, Math.max(0.1, value));
  }
}
