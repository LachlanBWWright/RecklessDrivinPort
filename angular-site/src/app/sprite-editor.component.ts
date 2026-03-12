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
} from '@angular/core';
import type { DecodedSpriteFrame } from './level-editor.service';

export type SpriteEditorTool = 'pencil' | 'fill' | 'eyedropper' | 'eraser';

@Component({
  selector: 'app-sprite-editor',
  templateUrl: './sprite-editor.component.html',
  styleUrl: './sprite-editor.component.scss',
  standalone: false,
})
export class SpriteEditorComponent implements OnChanges, AfterViewInit {
  @Input() frame: DecodedSpriteFrame | null = null;
  @Input() open = false;

  @Output() closed = new EventEmitter<void>();
  /** Emits RGBA8888 pixel array when user saves (length = w * h * 4) */
  @Output() saved = new EventEmitter<{ frameId: number; pixels: Uint8ClampedArray }>();

  @ViewChild('editorCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('paletteCanvas') paletteCanvasRef!: ElementRef<HTMLCanvasElement>;

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

  /** Is the mouse button currently down */
  private mouseDown = false;

  /** Undo stack – stores pixel array snapshots */
  private undoStack: Uint8ClampedArray[] = [];
  private readonly MAX_UNDO = 20;

  // ---- Tool icons for display ----
  toolIcons: Record<SpriteEditorTool, string> = {
    pencil: '✏️',
    fill: '🪣',
    eyedropper: '💉',
    eraser: '◻️',
  };

  tools: SpriteEditorTool[] = ['pencil', 'fill', 'eyedropper', 'eraser'];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['frame'] || changes['open']) {
      if (this.open && this.frame) {
        this.loadFrame(this.frame);
      }
    }
  }

  ngAfterViewInit(): void {
    if (this.open && this.frame) {
      this.loadFrame(this.frame);
    }
  }

  private loadFrame(frame: DecodedSpriteFrame): void {
    this.spriteW = frame.width;
    this.spriteH = frame.height;
    this.frameId = frame.frameId;
    this.pixels = frame.pixels.slice() as Uint8ClampedArray;
    this.undoStack = [];
    this.extractPalette();
    this.fitZoom();
    // Draw after a tick so the canvas is in the DOM
    setTimeout(() => this.draw(), 0);
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
    canvas.width  = w * z;
    canvas.height = h * z;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Checkerboard for transparency
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const i = (py * w + px) * 4;
        const a = this.pixels[i + 3];
        if (a === 0) {
          ctx.fillStyle = ((px + py) & 1) ? '#aaa' : '#888';
        } else {
          const r = this.pixels[i];
          const g = this.pixels[i + 1];
          const b = this.pixels[i + 2];
          ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
        }
        ctx.fillRect(px * z, py * z, z, z);
      }
    }

    // Grid lines when zoom >= 4
    if (z >= 4) {
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.5;
      for (let px = 0; px <= w; px++) {
        ctx.beginPath(); ctx.moveTo(px * z, 0); ctx.lineTo(px * z, h * z); ctx.stroke();
      }
      for (let py = 0; py <= h; py++) {
        ctx.beginPath(); ctx.moveTo(0, py * z); ctx.lineTo(w * z, py * z); ctx.stroke();
      }
    }
  }

  // ---- Mouse events ----

  onMouseDown(e: MouseEvent): void {
    this.mouseDown = true;
    this.saveUndo();
    this.applyTool(e);
  }

  onMouseMove(e: MouseEvent): void {
    if (!this.mouseDown) return;
    this.applyTool(e);
  }

  onMouseUp(): void {
    this.mouseDown = false;
  }

  private applyTool(e: MouseEvent): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.pixels) return;
    const rect = canvas.getBoundingClientRect();
    const px = Math.floor((e.clientX - rect.left) / this.zoom);
    const py = Math.floor((e.clientY - rect.top) / this.zoom);
    if (px < 0 || py < 0 || px >= this.spriteW || py >= this.spriteH) return;

    switch (this.tool) {
      case 'pencil': this.drawPixel(px, py); break;
      case 'eraser': this.erasePixel(px, py); break;
      case 'eyedropper': this.pickColor(px, py); break;
      case 'fill': this.floodFill(px, py); break;
    }
    this.draw();
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
      const [x, y] = stack.pop()!;
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
  }

  undo(): void {
    if (this.undoStack.length === 0) return;
    this.pixels = this.undoStack.pop()!;
    this.draw();
  }

  // ---- Zoom ----

  zoomIn(): void  { this.zoom = Math.min(24, this.zoom + 1); this.draw(); }
  zoomOut(): void { this.zoom = Math.max(1,  this.zoom - 1); this.draw(); }

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

  // ---- Save / Close ----

  save(): void {
    if (!this.pixels) return;
    this.saved.emit({ frameId: this.frameId, pixels: this.pixels.slice() as Uint8ClampedArray });
  }

  close(): void {
    this.closed.emit();
  }
}
