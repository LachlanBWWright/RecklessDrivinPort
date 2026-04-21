import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ElementRef,
  ViewChild,
  AfterViewInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormControl } from '@angular/forms';
import type { DecodedSpriteFrame } from '../level-editor.service';
import {
  applyBrush,
  applyBresenhamLine,
  pickPixelColor,
  floodFillPixels,
  extractSpriteFramePalette,
  fitSpriteZoom,
} from '../sprite-pixel-ops';

export type SpriteEditorTool = 'pencil' | 'fill' | 'eyedropper' | 'eraser';

@Component({
  selector: 'app-sprite-editor',
  templateUrl: './sprite-editor.component.html',
  styleUrl: './sprite-editor.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpriteEditorComponent implements OnChanges, AfterViewInit {
  @Input() frame: DecodedSpriteFrame | null = null;
  @Input() open = false;

  @Output() closed = new EventEmitter<void>();
  /** Emits RGBA8888 pixel array when user saves (length = w * h * 4) */
  @Output() saved = new EventEmitter<{ frameId: number; pixels: Uint8ClampedArray }>();

  @ViewChild('editorCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('paletteCanvas') paletteCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayEl') overlayElRef?: ElementRef<HTMLDivElement>;

  tool: SpriteEditorTool = 'pencil';
  readonly brushSize = new FormControl(1, { nonNullable: true });
  color: [number, number, number, number] = [255, 255, 255, 255];
  zoom = 8;

  private pixels: Uint8ClampedArray | null = null;
  private spriteW = 0;
  private spriteH = 0;
  private frameId = 0;

  palette: { r: number; g: number; b: number; a: number }[] = [];
  readonly presetPalette: { r: number; g: number; b: number; a: number }[] = [
    { r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }, { r: 224, g: 64, b: 64, a: 255 },
    { r: 255, g: 167, b: 38, a: 255 }, { r: 255, g: 235, b: 59, a: 255 }, { r: 102, g: 187, b: 106, a: 255 },
    { r: 38, g: 198, b: 218, a: 255 }, { r: 66, g: 165, b: 245, a: 255 }, { r: 126, g: 87, b: 194, a: 255 },
    { r: 236, g: 64, b: 122, a: 255 }, { r: 121, g: 85, b: 72, a: 255 }, { r: 158, g: 158, b: 158, a: 255 },
    { r: 76, g: 175, b: 80, a: 255 }, { r: 0, g: 121, b: 107, a: 255 }, { r: 30, g: 136, b: 229, a: 255 },
    { r: 57, g: 73, b: 171, a: 255 }, { r: 216, g: 27, b: 96, a: 255 }, { r: 255, g: 112, b: 67, a: 255 },
    { r: 141, g: 110, b: 99, a: 255 }, { r: 84, g: 110, b: 122, a: 255 }, { r: 255, g: 179, b: 0, a: 255 },
    { r: 124, g: 179, b: 66, a: 255 }, { r: 41, g: 182, b: 246, a: 255 }, { r: 171, g: 71, b: 188, a: 255 },
  ];

  private mouseDown = false;
  private _lastPx: number | null = null;
  private _lastPy: number | null = null;

  private undoStack: Uint8ClampedArray[] = [];
  private redoStack: Uint8ClampedArray[] = [];
  private readonly MAX_UNDO = 40;
  private rawCanvas: HTMLCanvasElement | null = null;
  private checkerCanvas: HTMLCanvasElement | null = null;
  private _checkerPattern: CanvasPattern | null = null;
  private _pendingDrawRaf: number | null = null;

  toolIcons: Record<SpriteEditorTool, string> = {
    pencil: 'edit',
    fill: 'format_color_fill',
    eyedropper: 'colorize',
    eraser: 'auto_fix_normal',
  };

  tools: SpriteEditorTool[] = ['pencil', 'fill', 'eyedropper', 'eraser'];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['frame'] || changes['open']) {
      if (this.open && this.frame) {
        this.loadFrame(this.frame);
        setTimeout(() => this.overlayElRef?.nativeElement?.focus(), 0);
      }
    }
  }

  ngAfterViewInit(): void {
    if (this.open && this.frame) {
      this.loadFrame(this.frame);
      setTimeout(() => this.overlayElRef?.nativeElement?.focus(), 0);
    }
  }

  private loadFrame(frame: DecodedSpriteFrame): void {
    this.spriteW = frame.width;
    this.spriteH = frame.height;
    this.frameId = frame.frameId;
    this.pixels = frame.pixels.slice() as Uint8ClampedArray;
    this.undoStack = [];
    this.redoStack = [];
    this.palette = extractSpriteFramePalette(this.pixels);
    this.zoom = fitSpriteZoom(this.spriteW, this.spriteH);
    setTimeout(() => this.queueDraw(), 0);
  }

  draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.pixels) return;
    const w = this.spriteW;
    const h = this.spriteH;
    const z = this.zoom;
    const newW = w * z;
    const newH = h * z;
    if (canvas.width !== newW || canvas.height !== newH) {
      canvas.width = newW;
      canvas.height = newH;
      this._checkerPattern = null;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!this.checkerCanvas) {
      this.checkerCanvas = document.createElement('canvas');
      this.checkerCanvas.width = 8;
      this.checkerCanvas.height = 8;
      const checkerCtx = this.checkerCanvas.getContext('2d');
      if (checkerCtx) {
        checkerCtx.fillStyle = '#888';
        checkerCtx.fillRect(0, 0, 8, 8);
        checkerCtx.fillStyle = '#aaa';
        checkerCtx.fillRect(0, 0, 4, 4);
        checkerCtx.fillRect(4, 4, 4, 4);
      }
      this._checkerPattern = null;
    }
    if (this.checkerCanvas) {
      if (!this._checkerPattern) this._checkerPattern = ctx.createPattern(this.checkerCanvas, 'repeat');
      if (this._checkerPattern) {
        ctx.fillStyle = this._checkerPattern;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    if (!this.rawCanvas || this.rawCanvas.width !== w || this.rawCanvas.height !== h) {
      this.rawCanvas = document.createElement('canvas');
      this.rawCanvas.width = w;
      this.rawCanvas.height = h;
    }
    const rawCtx = this.rawCanvas.getContext('2d');
    if (rawCtx) {
      rawCtx.putImageData(new ImageData(new Uint8ClampedArray(this.pixels), w, h), 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.rawCanvas, 0, 0, w * z, h * z);
    }

    if (z >= 4) {
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let px = 0; px <= w; px++) { ctx.moveTo(px * z, 0); ctx.lineTo(px * z, h * z); }
      for (let py = 0; py <= h; py++) { ctx.moveTo(0, py * z); ctx.lineTo(w * z, py * z); }
      ctx.stroke();
    }
  }

  onMouseDown(e: MouseEvent): void {
    this.mouseDown = true;
    this._lastPx = null;
    this._lastPy = null;
    this.saveUndo();
    this.applyTool(e);
  }

  onMouseMove(e: MouseEvent): void {
    if (!this.mouseDown) return;
    this.applyTool(e);
  }

  onMouseUp(): void {
    this.mouseDown = false;
    this._lastPx = null;
    this._lastPy = null;
  }

  private applyTool(e: MouseEvent): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.pixels) return;
    const rect = canvas.getBoundingClientRect();
    const px = Math.floor((e.clientX - rect.left) / this.zoom);
    const py = Math.floor((e.clientY - rect.top) / this.zoom);
    if (px < 0 || py < 0 || px >= this.spriteW || py >= this.spriteH) return;

    if (this.tool === 'pencil' || this.tool === 'eraser') {
      const [r, g, b, a] = this.tool === 'pencil' ? this.color : [0, 0, 0, 0];
      if (this._lastPx !== null && this._lastPy !== null) {
        applyBresenhamLine(this.pixels, this.spriteW, this.spriteH, this._lastPx, this._lastPy, px, py, this.brushSize.value, r, g, b, a);
      } else {
        applyBrush(this.pixels, this.spriteW, this.spriteH, px, py, this.brushSize.value, r, g, b, a);
      }
      this._lastPx = px;
      this._lastPy = py;
    } else if (this.tool === 'eyedropper') {
      this.color = pickPixelColor(this.pixels, this.spriteW, px, py);
      this.tool = 'pencil';
    } else if (this.tool === 'fill') {
      floodFillPixels(this.pixels, this.spriteW, this.spriteH, px, py, this.color[0], this.color[1], this.color[2], this.color[3]);
    }
    this.queueDraw();
  }

  private saveUndo(): void {
    if (!this.pixels) return;
    this.undoStack.push(this.pixels.slice() as Uint8ClampedArray);
    if (this.undoStack.length > this.MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): void {
    if (this.undoStack.length === 0) return;
    if (this.pixels) this.redoStack.push(this.pixels.slice() as Uint8ClampedArray);
    const prev = this.undoStack.pop();
    if (prev) this.pixels = prev;
    this.queueDraw();
  }

  redo(): void {
    if (this.redoStack.length === 0) return;
    if (this.pixels) this.undoStack.push(this.pixels.slice() as Uint8ClampedArray);
    const next = this.redoStack.pop();
    if (next) this.pixels = next;
    this.queueDraw();
  }

  zoomIn(): void  { this.zoom = Math.min(24, this.zoom + 1); this.queueDraw(); }
  zoomOut(): void { this.zoom = Math.max(1,  this.zoom - 1); this.queueDraw(); }

  get colorHex(): string {
    const [r, g, b] = this.color;
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  setColorFromHex(hex: string): void {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (!isNaN(r + g + b)) this.color = [r, g, b, 255];
  }

  selectPaletteColor(c: { r: number; g: number; b: number; a: number }): void {
    this.color = [c.r, c.g, c.b, c.a];
    this.tool = 'pencil';
  }

  queueDraw(): void {
    if (typeof window === 'undefined') { this.draw(); return; }
    if (this._pendingDrawRaf !== null) return;
    this._pendingDrawRaf = window.requestAnimationFrame(() => {
      this._pendingDrawRaf = null;
      this.draw();
    });
  }

  save(): void {
    if (!this.pixels) return;
    this.saved.emit({ frameId: this.frameId, pixels: this.pixels.slice() as Uint8ClampedArray });
  }

  close(): void {
    this.closed.emit();
  }
}
