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
import type { DecodedSpriteFrame } from '../level-editor.service';

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
  brushSize = 1;
  /** Current drawing colour as [r,g,b,a] */
  color: [number, number, number, number] = [255, 255, 255, 255];
  zoom = 8;

  /** Working copy of pixels */
  private pixels: Uint8ClampedArray | null = null;
  private spriteW = 0;
  private spriteH = 0;
  private frameId = 0;

  /** Palette colours extracted from the sprite */
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

  /** Is the mouse button currently down */
  private mouseDown = false;
  /** Last painted pixel coordinates for Bresenham interpolation */
  private _lastPx: number | null = null;
  private _lastPy: number | null = null;

  /** Undo stack – stores pixel array snapshots */
  private undoStack: Uint8ClampedArray[] = [];
  private redoStack: Uint8ClampedArray[] = [];
  private readonly MAX_UNDO = 40;
  private rawCanvas: HTMLCanvasElement | null = null;
  private checkerCanvas: HTMLCanvasElement | null = null;
  /** Cached checker pattern – recreated only when checkerCanvas changes. */
  private _checkerPattern: CanvasPattern | null = null;
  private _pendingDrawRaf: number | null = null;

  // ---- Tool icons for display (Material icon names) ----
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
        // Focus the overlay for keyboard events
        setTimeout(() => this.overlayElRef?.nativeElement?.focus(), 0);
      }
    }
  }

  ngAfterViewInit(): void {
    if (this.open && this.frame) {
      this.loadFrame(this.frame);
      // Ensure overlay gets focus for keyboard events (Escape to close)
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
    this.extractPalette();
    this.fitZoom();
    // Draw after a tick so the canvas is in the DOM
    setTimeout(() => this.queueDraw(), 0);
  }

  private fitZoom(): void {
    // Fit to roughly 512px
    const maxDim = Math.max(this.spriteW, this.spriteH);
    if (maxDim <= 0) { this.zoom = 8; return; }
    this.zoom = Math.max(1, Math.min(16, Math.floor(512 / maxDim)));
  }

  private extractPalette(): void {
    if (!this.pixels) { this.palette = []; return; }
    const seen = new Set<number>();
    const cols: { r: number; g: number; b: number; a: number }[] = [];
    for (let i = 0; i < this.pixels.length; i += 4) {
      const r = this.pixels[i];
      const g = this.pixels[i + 1];
      const b = this.pixels[i + 2];
      const a = this.pixels[i + 3];
      if (a === 0) continue;
      const key = (r << 24) | (g << 16) | (b << 8) | a;
      if (!seen.has(key)) {
        seen.add(key);
        cols.push({ r, g, b, a });
        if (cols.length >= 64) break;
      }
    }
    // sort by luminance
    cols.sort((a, b) => (a.r + a.g + a.b) - (b.r + b.g + b.b));
    this.palette = cols;
  }

  // ---- Canvas drawing ----

  draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.pixels) return;
    const w = this.spriteW;
    const h = this.spriteH;
    const z = this.zoom;
    // Only resize the canvas buffer when dimensions actually change.
    // Unconditionally setting canvas.width/height forces the browser to
    // reallocate the backing store on every frame, which is very expensive.
    const newW = w * z;
    const newH = h * z;
    if (canvas.width !== newW || canvas.height !== newH) {
      canvas.width  = newW;
      canvas.height = newH;
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
      // Invalidate cached pattern whenever checkerCanvas is recreated
      this._checkerPattern = null;
    }
    if (this.checkerCanvas) {
      // Cache the pattern – createPattern is expensive and the source never changes
      if (!this._checkerPattern) {
        this._checkerPattern = ctx.createPattern(this.checkerCanvas, 'repeat');
      }
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

    // Grid lines when zoom >= 4 – all lines in a single path for performance
    if (z >= 4) {
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let px = 0; px <= w; px++) {
        ctx.moveTo(px * z, 0); ctx.lineTo(px * z, h * z);
      }
      for (let py = 0; py <= h; py++) {
        ctx.moveTo(0, py * z); ctx.lineTo(w * z, py * z);
      }
      ctx.stroke();
    }
  }

  // ---- Mouse events ----

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
      // Interpolate using Bresenham's line algorithm between last and current position
      if (this._lastPx !== null && this._lastPy !== null) {
        this._bresenhamLine(this._lastPx, this._lastPy, px, py, this.tool);
      } else {
        if (this.tool === 'pencil') this.drawPixel(px, py);
        else this.erasePixel(px, py);
      }
      this._lastPx = px;
      this._lastPy = py;
    } else {
      switch (this.tool) {
        case 'eyedropper': this.pickColor(px, py); break;
        case 'fill': this.floodFill(px, py); break;
      }
    }
    this.queueDraw();
  }

  /** Draw (or erase) all pixels along a Bresenham line from (x0,y0) to (x1,y1). */
  private _bresenhamLine(x0: number, y0: number, x1: number, y1: number, tool: 'pencil' | 'eraser'): void {
    const apply = tool === 'pencil'
      ? (x: number, y: number) => this.drawPixel(x, y)
      : (x: number, y: number) => this.erasePixel(x, y);

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      apply(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx)  { err += dx; y0 += sy; }
    }
  }

  private drawPixel(cx: number, cy: number): void {
    const half = Math.floor(this.brushSize / 2);
    for (let dy = -half; dy < this.brushSize - half; dy++) {
      for (let dx = -half; dx < this.brushSize - half; dx++) {
        this.setPixel(cx + dx, cy + dy, this.color[0], this.color[1], this.color[2], this.color[3]);
      }
    }
  }

  private erasePixel(cx: number, cy: number): void {
    const half = Math.floor(this.brushSize / 2);
    for (let dy = -half; dy < this.brushSize - half; dy++) {
      for (let dx = -half; dx < this.brushSize - half; dx++) {
        this.setPixel(cx + dx, cy + dy, 0, 0, 0, 0);
      }
    }
  }

  private setPixel(x: number, y: number, r: number, g: number, b: number, a: number): void {
    if (!this.pixels) return;
    if (x < 0 || y < 0 || x >= this.spriteW || y >= this.spriteH) return;
    const i = (y * this.spriteW + x) * 4;
    this.pixels[i]     = r;
    this.pixels[i + 1] = g;
    this.pixels[i + 2] = b;
    this.pixels[i + 3] = a;
  }

  private pickColor(x: number, y: number): void {
    if (!this.pixels) return;
    const i = (y * this.spriteW + x) * 4;
    this.color = [this.pixels[i], this.pixels[i + 1], this.pixels[i + 2], this.pixels[i + 3]];
    this.tool = 'pencil';
  }

  private floodFill(sx: number, sy: number): void {
    if (!this.pixels) return;
    const w = this.spriteW;
    const h = this.spriteH;
    const i0 = (sy * w + sx) * 4;
    const targetR = this.pixels[i0];
    const targetG = this.pixels[i0 + 1];
    const targetB = this.pixels[i0 + 2];
    const targetA = this.pixels[i0 + 3];
    const [fillR, fillG, fillB, fillA] = this.color;

    // Abort if target == fill colour
    if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) return;

    const stack: [number, number][] = [[sx, sy]];
    const visited = new Uint8Array(w * h);
    while (stack.length > 0) {
      const top = stack.pop();
      if (!top) break;
      const [x, y] = top;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const idx = y * w + x;
      if (visited[idx]) continue;
      visited[idx] = 1;
      const i = idx * 4;
      if (this.pixels[i] !== targetR || this.pixels[i + 1] !== targetG ||
          this.pixels[i + 2] !== targetB || this.pixels[i + 3] !== targetA) continue;
      this.pixels[i]     = fillR;
      this.pixels[i + 1] = fillG;
      this.pixels[i + 2] = fillB;
      this.pixels[i + 3] = fillA;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }

  // ---- Undo ----

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

  // ---- Zoom ----

  zoomIn(): void  { this.zoom = Math.min(24, this.zoom + 1); this.queueDraw(); }
  zoomOut(): void { this.zoom = Math.max(1,  this.zoom - 1); this.queueDraw(); }

  // ---- Color input ----

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
    if (typeof window === 'undefined') {
      this.draw();
      return;
    }
    if (this._pendingDrawRaf !== null) return;
    this._pendingDrawRaf = window.requestAnimationFrame(() => {
      this._pendingDrawRaf = null;
      this.draw();
    });
  }

  // ---- Save / Close ----

  save(): void {
    if (!this.pixels) return;
    this.saved.emit({ frameId: this.frameId, pixels: this.pixels.slice() as Uint8ClampedArray });
  }

  close(): void {
    this.closed.emit();
  }
}
