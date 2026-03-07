import { Component, OnDestroy, OnInit, signal, computed, effect } from '@angular/core';
import {
  LevelEditorService,
  type ParsedLevel,
  type LevelProperties,
  type ObjectPos,
  type EditableSpriteAsset,
  type MarkSeg,
} from './level-editor.service';
import { ResourceDatService, type ResourceDatEntry } from './resource-dat.service';

export type AppTab = 'game' | 'editor';
export type EditorSection = 'properties' | 'objects' | 'road' | 'sprites';

const OBJ_PALETTE = [
  '#e53935', '#42a5f5', '#66bb6a', '#ffa726',
  '#ab47bc', '#26c6da', '#d4e157', '#ff7043',
  '#8d6e63', '#78909c', '#ec407a', '#29b6f6',
];

/** Minimum canvas hit radius (px) for object click detection. */
const MIN_HIT_RADIUS = 10;
/** Base world-space hit radius before zoom scaling for object click detection. */
const BASE_HIT_RADIUS = 8;
/** Canvas hit radius (px) for mark segment endpoint dragging. */
const MARK_ENDPOINT_HIT_RADIUS = 10;

/** Euclidean distance between two 2-D points. */
function dist2d(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function scheduleAfterRender(callback: () => void): void {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => callback());
    return;
  }
  setTimeout(callback, 0);
}

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  readonly typePalette = OBJ_PALETTE.map((hex, index) => ({ hex, typeId: index }));

  // ---- Navigation ----
  activeTab = signal<AppTab>('game');
  editorSection = signal<EditorSection>('properties');

  // ---- WASM game ----
  statusText = signal('Loading game data…');
  progressPct = signal(0);
  overlayVisible = signal(true);
  masterVolume = signal(80);

  // ---- Editor global state ----
  resourcesStatus = signal('No resources.dat loaded. Use the buttons below to load one.');
  editorError = signal('');
  hasEditorData = signal(false);

  // ---- Level selector ----
  parsedLevels = signal<ParsedLevel[]>([]);
  selectedLevelId = signal<number | null>(null);

  readonly selectedLevel = computed(() => {
    const id = this.selectedLevelId();
    if (id === null) return null;
    return this.parsedLevels().find((l) => l.resourceId === id) ?? null;
  });

  // ---- Level properties editing ----
  editRoadInfo = signal(0);
  editTime = signal(0);
  editTimeSeconds = signal(0);
  editXStartPos = signal(0);
  editLevelEnd = signal(0);
  propertiesDirty = signal(false);

  // ---- Object placement ----
  objects = signal<ObjectPos[]>([]);
  selectedObjIndex = signal<number | null>(null);
  editObjX = signal(0);
  editObjY = signal(0);
  editObjDir = signal(0);
  editObjTypeRes = signal(128);
  visibleTypeFilter = signal<Set<number>>(new Set(this.typePalette.map((item) => item.typeId)));

  // ---- Canvas interaction state ----
  canvasZoom = signal(1.0);
  canvasPanX = signal(0);
  canvasPanY = signal(0);
  isDragging = signal(false);
  dragObjIndex = signal<number | null>(null);

  private _prevPanMouseX = 0;
  private _prevPanMouseY = 0;
  private _isPanning = false;

  // ---- Mark editor ----
  marks = signal<MarkSeg[]>([]);
  selectedMarkIndex = signal<number | null>(null);
  dragMarkEndpoint = signal<{ markIdx: number; endpoint: 'p1' | 'p2' } | null>(null);

  // ---- Sprite pixel grid ----
  spriteGridZoom = signal(4);

  // ---- Track segment detail ----
  selectedTrackSegIdx = signal<number | null>(null);

  // ---- Sprite editor ----
  spriteAssets = signal<EditableSpriteAsset[]>([]);
  selectedSpriteId = signal<number | null>(null);
  spriteByteOffset = signal(0);
  spriteByteValue = signal(0);
  spriteHexPage = signal(0);

  readonly spriteHexRows = computed(() => {
    const id = this.selectedSpriteId();
    if (id === null) return [];
    const bytes = this.levelEditorService.getSpriteBytes(this.resources, id);
    if (!bytes) return [];
    const page = this.spriteHexPage();
    const pageSize = 256;
    const start = page * pageSize;
    const rows: { addr: string; hex: string[]; ascii: string }[] = [];
    for (let r = 0; r < 16; r++) {
      const rowStart = start + r * 16;
      const hexCells: string[] = [];
      let ascii = '';
      for (let c = 0; c < 16; c++) {
        const idx = rowStart + c;
        const b = idx < bytes.length ? bytes[idx] : undefined;
        hexCells.push(b !== undefined ? b.toString(16).padStart(2, '0') : '  ');
        ascii += b !== undefined && b >= 32 && b < 127 ? String.fromCharCode(b) : '.';
      }
      rows.push({
        addr: rowStart.toString(16).padStart(6, '0'),
        hex: hexCells,
        ascii,
      });
    }
    return rows;
  });

  readonly spriteMaxPage = computed(() => {
    const id = this.selectedSpriteId();
    if (id === null) return 0;
    const bytes = this.levelEditorService.getSpriteBytes(this.resources, id);
    return bytes ? Math.max(0, Math.ceil(bytes.length / 256) - 1) : 0;
  });

  private wasmScript: HTMLScriptElement | null = null;
  private resources: ResourceDatEntry[] = [];

  private readonly resourceDatService = new ResourceDatService();
  private readonly levelEditorService = new LevelEditorService();

  constructor() {
    // Redraw track canvas whenever the selected level or section changes.
    effect(() => {
      const level = this.selectedLevel();
      const section = this.editorSection();
      if (section === 'road' && level) {
        scheduleAfterRender(() => this.drawTrackCanvas(level));
      }
    });

    // Redraw object canvas when objects, selection, zoom or pan changes.
    effect(() => {
      this.objects();
      this.selectedObjIndex();
      this.canvasZoom();
      this.canvasPanX();
      this.canvasPanY();
      this.visibleTypeFilter();
      const section = this.editorSection();
      if (section === 'objects') {
        scheduleAfterRender(() => this.redrawObjectCanvas());
      }
    });

    // Redraw mark canvas when marks or selection changes.
    effect(() => {
      this.marks();
      this.selectedMarkIndex();
      const section = this.editorSection();
      if (section === 'road') {
        scheduleAfterRender(() => this.redrawMarkCanvas());
      }
    });

    // Redraw sprite pixel canvas when sprite selection or page changes.
    effect(() => {
      this.selectedSpriteId();
      this.spriteHexPage();
      const section = this.editorSection();
      if (section === 'sprites') {
        scheduleAfterRender(() => this.redrawSpriteCanvas());
      }
    });
  }

  ngOnInit(): void {
    this.setupEmscriptenModule();
    this.loadWasmScript();
  }

  ngOnDestroy(): void {
    if (this.wasmScript?.parentNode) {
      (this.wasmScript.parentNode as HTMLElement).removeChild(this.wasmScript);
    }
  }

  // ---- Tab / section navigation ----

  setTab(tab: AppTab): void {
    this.activeTab.set(tab);
  }

  setSection(section: EditorSection): void {
    this.editorSection.set(section);
  }

  // ---- Resources loading ----

  async loadDefaultResources(): Promise<void> {
    try {
      this.editorError.set('');
      this.resourcesStatus.set('Loading default resources.dat…');
      const response = await fetch('resources.dat');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      this.loadResourcesBytes(bytes, 'default resources.dat');
    } catch (error) {
      this.editorError.set(error instanceof Error ? error.message : 'Failed to load resources.dat');
      this.resourcesStatus.set('Failed to load resources.');
    }
  }

  async onResourceFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.editorError.set('');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      this.loadResourcesBytes(bytes, file.name);
    } catch (error) {
      this.editorError.set(error instanceof Error ? error.message : 'Failed to load file');
      this.resourcesStatus.set('Failed to load uploaded file.');
    }
  }

  downloadEditedResources(): void {
    if (!this.hasEditorData()) return;
    const output = this.resourceDatService.serialize(this.resources);
    const safeBuffer = new ArrayBuffer(output.byteLength);
    new Uint8Array(safeBuffer).set(output);
    const blob = new Blob([safeBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resources.dat';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.resourcesStatus.set('Downloaded updated resources.dat.');
  }

  // ---- Level selection ----

  selectLevel(id: number): void {
    this.selectedLevelId.set(id);
    const level = this.parsedLevels().find((l) => l.resourceId === id);
    if (level) {
      this.editRoadInfo.set(level.properties.roadInfo);
      this.editTime.set(level.properties.time);
      this.editTimeSeconds.set(Math.round(level.properties.time / 100));
      this.editXStartPos.set(level.properties.xStartPos);
      this.editLevelEnd.set(level.properties.levelEnd);
      this.propertiesDirty.set(false);
      this.objects.set([...level.objects]);
      this.selectedObjIndex.set(null);
      this.visibleTypeFilter.set(new Set(this.typePalette.map((item) => item.typeId)));
      this.marks.set([...level.marks]);
      this.selectedMarkIndex.set(null);
    }
  }

  // ---- Level properties ----

  onPropsInput(field: keyof LevelProperties, event: Event): void {
    const val = Number.parseInt((event.target as HTMLInputElement).value, 10);
    if (Number.isNaN(val)) return;
    switch (field) {
      case 'roadInfo': this.editRoadInfo.set(val); break;
      case 'time': {
        const nextTime = Math.max(0, val);
        this.editTime.set(nextTime);
        this.editTimeSeconds.set(Math.round(nextTime / 100));
        break;
      }
      case 'xStartPos': this.editXStartPos.set(val); break;
      case 'levelEnd': this.editLevelEnd.set(Math.max(0, val)); break;
    }
    this.propertiesDirty.set(true);
  }

  onTimeSecondsInput(event: Event): void {
    const seconds = Number.parseInt((event.target as HTMLInputElement).value, 10);
    if (Number.isNaN(seconds)) return;
    const clampedSeconds = Math.max(0, seconds);
    this.editTimeSeconds.set(clampedSeconds);
    this.editTime.set(Math.min(65535, clampedSeconds * 100));
    this.propertiesDirty.set(true);
  }

  saveLevelProperties(): void {
    const id = this.selectedLevelId();
    if (id === null) return;
    const props: LevelProperties = {
      roadInfo: this.editRoadInfo(),
      time: this.editTime(),
      xStartPos: this.editXStartPos(),
      levelEnd: this.editLevelEnd(),
    };
    this.resources = this.levelEditorService.applyLevelProperties(this.resources, id, props);
    this.propertiesDirty.set(false);
    this.resourcesStatus.set(`Saved properties for level ${id - 139}.`);
    this.refreshParsedLevels();
  }

  // ---- Object placement ----

  selectObject(index: number): void {
    this.selectedObjIndex.set(index);
    const objs = this.objects();
    if (index >= 0 && index < objs.length) {
      const obj = objs[index];
      this.editObjX.set(obj.x);
      this.editObjY.set(obj.y);
      this.editObjDir.set(obj.dir);
      this.editObjTypeRes.set(obj.typeRes);
    }
  }

  onObjFieldInput(field: keyof ObjectPos, event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (Number.isNaN(val)) return;
    switch (field) {
      case 'x': this.editObjX.set(Math.round(val)); break;
      case 'y': this.editObjY.set(Math.round(val)); break;
      case 'dir': this.editObjDir.set(val); break;
      case 'typeRes': this.editObjTypeRes.set(Math.round(val)); break;
    }
  }

  applyObjEdit(): void {
    const idx = this.selectedObjIndex();
    if (idx === null) return;
    const objs = [...this.objects()];
    if (idx < 0 || idx >= objs.length) return;
    objs[idx] = {
      x: this.editObjX(),
      y: this.editObjY(),
      dir: this.editObjDir(),
      typeRes: this.editObjTypeRes(),
    };
    this.objects.set(objs);
  }

  addObject(): void {
    const objs = [...this.objects()];
    objs.push({ x: 0, y: 0, dir: 0, typeRes: 128 });
    this.objects.set(objs);
    this.selectObject(objs.length - 1);
  }

  duplicateSelectedObject(): void {
    const idx = this.selectedObjIndex();
    if (idx === null) return;
    const objs = [...this.objects()];
    if (idx < 0 || idx >= objs.length) return;
    const original = objs[idx];
    objs.push({ ...original, x: original.x + 50 });
    this.objects.set(objs);
    this.selectObject(objs.length - 1);
  }

  toggleTypeVisibility(typeId: number): void {
    const next = new Set(this.visibleTypeFilter());
    if (next.has(typeId)) {
      next.delete(typeId);
    } else {
      next.add(typeId);
    }
    this.visibleTypeFilter.set(next);
  }

  showAllObjectTypes(): void {
    this.visibleTypeFilter.set(new Set(this.typePalette.map((item) => item.typeId)));
  }

  hideAllObjectTypes(): void {
    this.visibleTypeFilter.set(new Set());
  }

  removeSelectedObject(): void {
    const idx = this.selectedObjIndex();
    if (idx === null) return;
    const objs = this.objects().filter((_, i) => i !== idx);
    this.objects.set(objs);
    this.selectedObjIndex.set(objs.length > 0 ? Math.min(idx, objs.length - 1) : null);
  }

  saveLevelObjects(): void {
    const id = this.selectedLevelId();
    if (id === null) return;
    this.resources = this.levelEditorService.applyLevelObjects(this.resources, id, this.objects());
    this.resourcesStatus.set(`Saved objects for level ${id - 139} (${this.objects().length} objects).`);
    this.refreshParsedLevels();
  }

  // ---- Canvas coordinate transforms ----

  worldToCanvas(wx: number, wy: number): [number, number] {
    const canvas = document.getElementById('object-canvas') as HTMLCanvasElement | null;
    const W = canvas?.width ?? 600;
    const H = canvas?.height ?? 500;
    const cx = W / 2 + (wx - this.canvasPanX()) * this.canvasZoom();
    const cy = H / 2 + (wy - this.canvasPanY()) * this.canvasZoom();
    return [cx, cy];
  }

  canvasToWorld(cx: number, cy: number): [number, number] {
    const canvas = document.getElementById('object-canvas') as HTMLCanvasElement | null;
    const W = canvas?.width ?? 600;
    const H = canvas?.height ?? 500;
    const wx = (cx - W / 2) / this.canvasZoom() + this.canvasPanX();
    const wy = (cy - H / 2) / this.canvasZoom() + this.canvasPanY();
    return [wx, wy];
  }

  // ---- Canvas event handlers ----

  onCanvasMouseDown(event: MouseEvent): void {
    event.preventDefault();
    if (event.button === 1 || event.button === 2) {
      // Middle or right click: start panning
      this._isPanning = true;
      this._prevPanMouseX = event.offsetX;
      this._prevPanMouseY = event.offsetY;
      return;
    }
    // Left click: find closest object
    const [wx, wy] = this.canvasToWorld(event.offsetX, event.offsetY);
    const objs = this.objects();
    const hitRadius = Math.max(MIN_HIT_RADIUS, BASE_HIT_RADIUS / this.canvasZoom());
    let closest = -1;
    let closestDist = hitRadius;
    for (let i = 0; i < objs.length; i++) {
      const dist = dist2d(objs[i].x, objs[i].y, wx, wy);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    }
    if (closest >= 0) {
      this.selectObject(closest);
      this.isDragging.set(true);
      this.dragObjIndex.set(closest);
    } else {
      this.selectedObjIndex.set(null);
    }
    const canvas = event.target as HTMLCanvasElement;
    canvas.focus();
  }

  onCanvasMouseMove(event: MouseEvent): void {
    if (this._isPanning) {
      const zoom = this.canvasZoom();
      const dx = event.offsetX - this._prevPanMouseX;
      const dy = event.offsetY - this._prevPanMouseY;
      this._prevPanMouseX = event.offsetX;
      this._prevPanMouseY = event.offsetY;
      this.canvasPanX.set(this.canvasPanX() - dx / zoom);
      this.canvasPanY.set(this.canvasPanY() - dy / zoom);
      return;
    }
    if (!this.isDragging()) return;
    const dragIdx = this.dragObjIndex();
    if (dragIdx === null) return;
    const [wx, wy] = this.canvasToWorld(event.offsetX, event.offsetY);
    const objs = [...this.objects()];
    objs[dragIdx] = { ...objs[dragIdx], x: Math.round(wx), y: Math.round(wy) };
    this.objects.set(objs);
    // Sync edit fields
    this.editObjX.set(Math.round(wx));
    this.editObjY.set(Math.round(wy));
  }

  onCanvasMouseUp(event: MouseEvent): void {
    if (this._isPanning) {
      this._isPanning = false;
      return;
    }
    const wasDragging = this.isDragging();
    this.isDragging.set(false);
    this.dragObjIndex.set(null);
    if (wasDragging) {
      this.applyObjEdit();
    }
  }

  onCanvasDoubleClick(event: MouseEvent): void {
    const [wx, wy] = this.canvasToWorld(event.offsetX, event.offsetY);
    const objs = [...this.objects()];
    objs.push({ x: Math.round(wx), y: Math.round(wy), dir: 0, typeRes: 128 });
    this.objects.set(objs);
    this.selectObject(objs.length - 1);
  }

  onCanvasKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      this.duplicateSelectedObject();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.removeSelectedObject();
    }
  }

  onCanvasWheel(event: WheelEvent): void {
    event.preventDefault();
    const delta = event.deltaY;
    const factor = 1 - delta * 0.001;
    const newZoom = Math.min(10, Math.max(0.1, this.canvasZoom() * factor));
    this.canvasZoom.set(newZoom);
  }

  zoomIn(): void {
    this.canvasZoom.set(Math.min(10, this.canvasZoom() + 0.25));
  }

  zoomOut(): void {
    this.canvasZoom.set(Math.max(0.1, this.canvasZoom() - 0.25));
  }

  resetView(): void {
    this.canvasZoom.set(1.0);
    this.canvasPanX.set(0);
    this.canvasPanY.set(0);
  }

  // ---- Object canvas drawing ----

  redrawObjectCanvas(): void {
    const canvas = document.getElementById('object-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const zoom = this.canvasZoom();
    const panX = this.canvasPanX();
    const panY = this.canvasPanY();
    const objs = this.objects();
    const selIdx = this.selectedObjIndex();
    const visibleTypes = this.visibleTypeFilter();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);

    // Draw grid
    ctx.strokeStyle = '#1e1e1e';
    ctx.lineWidth = 1;
    const gridStep = 100; // world units
    const gridStepPx = gridStep * zoom;
    if (gridStepPx > 8) {
      const startWorldX = panX - W / (2 * zoom);
      const startWorldY = panY - H / (2 * zoom);
      const endWorldX = panX + W / (2 * zoom);
      const endWorldY = panY + H / (2 * zoom);
      const firstX = Math.floor(startWorldX / gridStep) * gridStep;
      const firstY = Math.floor(startWorldY / gridStep) * gridStep;
      for (let gx = firstX; gx <= endWorldX; gx += gridStep) {
        const [cx] = this.worldToCanvas(gx, 0);
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, H);
        ctx.stroke();
      }
      for (let gy = firstY; gy <= endWorldY; gy += gridStep) {
        const [, cy] = this.worldToCanvas(0, gy);
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(W, cy);
        ctx.stroke();
      }
    }

    // Draw axes
    const [ox, oy] = this.worldToCanvas(0, 0);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(W, oy); ctx.stroke();

    // Draw objects
    const baseRadius = Math.min(20, Math.max(5, 8 * zoom));
    const labelFont = `${Math.max(9, 10 * zoom)}px monospace`;
    for (let i = 0; i < objs.length; i++) {
      const obj = objs[i];
      const typeIdx = ((obj.typeRes % OBJ_PALETTE.length) + OBJ_PALETTE.length) % OBJ_PALETTE.length;
      const isFilteredOut = !visibleTypes.has(typeIdx);
      if (isFilteredOut && i !== selIdx) continue;
      const [cx, cy] = this.worldToCanvas(obj.x, obj.y);
      if (cx < -30 || cx > W + 30 || cy < -30 || cy > H + 30) continue;

      ctx.globalAlpha = isFilteredOut ? 0.35 : 1.0;
      const color = OBJ_PALETTE[typeIdx];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      ctx.fill();

      // Direction arrow
      const arrowLen = baseRadius * 1.5;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(obj.dir) * arrowLen, cy + Math.sin(obj.dir) * arrowLen);
      ctx.stroke();

      // Selection ring
      if (i === selIdx) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Label when zoomed in enough
      if (zoom > 0.5) {
        ctx.fillStyle = '#fff';
        ctx.font = labelFont;
        ctx.fillText(`#${i} T${obj.typeRes}`, cx + baseRadius + 2, cy + 4);
      }
      ctx.globalAlpha = 1.0;
    }

    // Origin marker
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ox, oy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Mark segment editor ----

  addMark(): void {
    const ms = [...this.marks()];
    ms.push({ x1: -100, y1: 0, x2: 100, y2: 0 });
    this.marks.set(ms);
    this.selectedMarkIndex.set(ms.length - 1);
  }

  removeSelectedMark(): void {
    const idx = this.selectedMarkIndex();
    if (idx === null) return;
    const ms = this.marks().filter((_, i) => i !== idx);
    this.marks.set(ms);
    this.selectedMarkIndex.set(ms.length > 0 ? Math.min(idx, ms.length - 1) : null);
  }

  onMarkFieldInput(markIdx: number, field: keyof MarkSeg, event: Event): void {
    const val = Number.parseInt((event.target as HTMLInputElement).value, 10);
    if (Number.isNaN(val)) return;
    const ms = [...this.marks()];
    ms[markIdx] = { ...ms[markIdx], [field]: val };
    this.marks.set(ms);
  }

  saveMarks(): void {
    const id = this.selectedLevelId();
    if (id === null) return;
    this.resources = this.levelEditorService.applyLevelMarks(this.resources, id, this.marks());
    this.resourcesStatus.set(`Saved ${this.marks().length} mark segments for level ${id - 139}.`);
    this.refreshParsedLevels();
  }

  // ---- Mark canvas helpers ----

  private markWorldToCanvas(wx: number, wy: number, canvas: HTMLCanvasElement,
    minX: number, minY: number, rangeX: number, rangeY: number): [number, number] {
    const pad = 24;
    const W = canvas.width;
    const H = canvas.height;
    const cx = pad + ((wx - minX) / (rangeX || 1)) * (W - 2 * pad);
    const cy = H - pad - ((wy - minY) / (rangeY || 1)) * (H - 2 * pad);
    return [cx, cy];
  }

  private markBounds(ms: MarkSeg[]): { minX: number; minY: number; maxX: number; maxY: number; rangeX: number; rangeY: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const m of ms) {
      if (m.x1 < minX) minX = m.x1; if (m.x2 < minX) minX = m.x2;
      if (m.y1 < minY) minY = m.y1; if (m.y2 < minY) minY = m.y2;
      if (m.x1 > maxX) maxX = m.x1; if (m.x2 > maxX) maxX = m.x2;
      if (m.y1 > maxY) maxY = m.y1; if (m.y2 > maxY) maxY = m.y2;
    }
    return { minX, minY, maxX, maxY, rangeX: maxX - minX, rangeY: maxY - minY };
  }

  redrawMarkCanvas(): void {
    const canvas = document.getElementById('mark-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const ms = this.marks();
    const selIdx = this.selectedMarkIndex();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    if (ms.length === 0) {
      ctx.fillStyle = '#555';
      ctx.font = '13px monospace';
      ctx.fillText('No mark segments. Click "+ Add Mark" to add one.', 20, H / 2);
      return;
    }

    const { minX, minY, rangeX, rangeY } = this.markBounds(ms);

    const toC = (wx: number, wy: number) =>
      this.markWorldToCanvas(wx, wy, canvas, minX, minY, rangeX, rangeY);

    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      const [ax, ay] = toC(m.x1, m.y1);
      const [bx, by] = toC(m.x2, m.y2);
      const isSel = i === selIdx;

      ctx.strokeStyle = isSel ? '#42a5f5' : '#555';
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();

      // Endpoint dots
      ctx.fillStyle = isSel ? '#42a5f5' : '#888';
      ctx.beginPath(); ctx.arc(ax, ay, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx, by, 6, 0, Math.PI * 2); ctx.fill();

      if (isSel) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.fillText(`P1(${m.x1},${m.y1})`, ax + 8, ay - 4);
        ctx.fillText(`P2(${m.x2},${m.y2})`, bx + 8, by - 4);
      }
    }
  }

  onMarkCanvasMouseDown(event: MouseEvent): void {
    const canvas = event.target as HTMLCanvasElement;
    const ms = this.marks();
    if (ms.length === 0) return;

    const { minX, minY, rangeX, rangeY } = this.markBounds(ms);

    const hitR = MARK_ENDPOINT_HIT_RADIUS;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      const [ax, ay] = this.markWorldToCanvas(m.x1, m.y1, canvas, minX, minY, rangeX, rangeY);
      const [bx, by] = this.markWorldToCanvas(m.x2, m.y2, canvas, minX, minY, rangeX, rangeY);
      if (dist2d(event.offsetX, event.offsetY, ax, ay) < hitR) {
        this.selectedMarkIndex.set(i);
        this.dragMarkEndpoint.set({ markIdx: i, endpoint: 'p1' });
        return;
      }
      if (dist2d(event.offsetX, event.offsetY, bx, by) < hitR) {
        this.selectedMarkIndex.set(i);
        this.dragMarkEndpoint.set({ markIdx: i, endpoint: 'p2' });
        return;
      }
    }
    // Click on a line to select it
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      const [ax, ay] = this.markWorldToCanvas(m.x1, m.y1, canvas, minX, minY, rangeX, rangeY);
      const [bx, by] = this.markWorldToCanvas(m.x2, m.y2, canvas, minX, minY, rangeX, rangeY);
      const dist = this.pointToSegmentDist(event.offsetX, event.offsetY, ax, ay, bx, by);
      if (dist < 8) {
        this.selectedMarkIndex.set(i);
        return;
      }
    }
  }

  onMarkCanvasMouseMove(event: MouseEvent): void {
    const drag = this.dragMarkEndpoint();
    if (!drag) return;
    const canvas = event.target as HTMLCanvasElement;
    const ms = this.marks();
    const { minX, minY, rangeX: rawRangeX, rangeY: rawRangeY } = this.markBounds(ms);
    const rangeX = rawRangeX || 1;
    const rangeY = rawRangeY || 1;
    const pad = 24;
    const W = canvas.width; const H = canvas.height;
    // Invert the canvas-to-world mapping
    const wx = Math.round(minX + ((event.offsetX - pad) / (W - 2 * pad)) * rangeX);
    const wy = Math.round(minY + ((H - pad - event.offsetY) / (H - 2 * pad)) * rangeY);
    const newMs = [...ms];
    if (drag.endpoint === 'p1') {
      newMs[drag.markIdx] = { ...newMs[drag.markIdx], x1: wx, y1: wy };
    } else {
      newMs[drag.markIdx] = { ...newMs[drag.markIdx], x2: wx, y2: wy };
    }
    this.marks.set(newMs);
  }

  onMarkCanvasMouseUp(_event: MouseEvent): void {
    this.dragMarkEndpoint.set(null);
  }

  private pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax; const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
  }

  // ---- Sprite editor ----

  selectSprite(spriteId: number): void {
    this.selectedSpriteId.set(spriteId);
    this.spriteByteOffset.set(0);
    this.spriteHexPage.set(0);
    const bytes = this.levelEditorService.getSpriteBytes(this.resources, spriteId);
    this.spriteByteValue.set(bytes && bytes.length > 0 ? bytes[0] : 0);
  }

  onSpriteOffsetInput(event: Event): void {
    const val = Number.parseInt((event.target as HTMLInputElement).value, 10);
    if (!Number.isNaN(val)) this.spriteByteOffset.set(Math.max(0, val));
  }

  onSpriteValueInput(event: Event): void {
    const val = Number.parseInt((event.target as HTMLInputElement).value, 10);
    if (!Number.isNaN(val)) this.spriteByteValue.set(Math.max(0, Math.min(255, val)));
  }

  applySpriteByteEdit(): void {
    const id = this.selectedSpriteId();
    if (id === null) return;
    this.resources = this.levelEditorService.applySpriteByte(
      this.resources, id, this.spriteByteOffset(), this.spriteByteValue(),
    );
    this.resourcesStatus.set(`Patched PPic #${id} offset ${this.spriteByteOffset()}.`);
    this.refreshSpriteAssets();
  }

  prevSpritePage(): void {
    this.spriteHexPage.set(Math.max(0, this.spriteHexPage() - 1));
  }

  nextSpritePage(): void {
    this.spriteHexPage.set(Math.min(this.spriteMaxPage(), this.spriteHexPage() + 1));
  }

  // ---- Sprite pixel canvas ----

  redrawSpriteCanvas(): void {
    const canvas = document.getElementById('sprite-pixel-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const id = this.selectedSpriteId();
    if (id === null) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const bytes = this.levelEditorService.getSpriteBytes(this.resources, id);
    if (!bytes || bytes.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const cols = 16;
    const rows = Math.ceil(bytes.length / cols);
    const cellW = Math.floor(canvas.width / cols);
    const cellH = Math.max(1, Math.floor(canvas.height / Math.max(rows, 1)));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < bytes.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const v = bytes[i];
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
    }
  }

  // ---- Fullscreen / volume ----

  toggleFullscreen(): void {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      canvas.requestFullscreen().catch((err) => console.warn('Fullscreen error:', err));
    }
  }

  onVolumeChange(event: Event): void {
    const pct = Number.parseInt((event.target as HTMLInputElement).value, 10);
    this.masterVolume.set(pct);
    this.applyVolumeToWasm(pct);
  }

  // ---- Private helpers ----

  private loadResourcesBytes(bytes: Uint8Array, sourceName: string): void {
    this.resources = this.resourceDatService.parse(bytes);
    this.resourcesStatus.set(`Loaded ${this.resources.length} resources from ${sourceName}.`);
    this.editorError.set('');
    this.hasEditorData.set(true);
    this.refreshParsedLevels();
    this.refreshSpriteAssets();
  }

  private refreshParsedLevels(): void {
    const levels = this.levelEditorService.extractParsedLevels(this.resources);
    this.parsedLevels.set(levels);
    const curId = this.selectedLevelId();
    if (curId !== null && levels.some((l) => l.resourceId === curId)) {
      this.selectLevel(curId);
    } else if (levels.length > 0) {
      this.selectLevel(levels[0].resourceId);
    } else {
      this.selectedLevelId.set(null);
    }
  }

  private refreshSpriteAssets(): void {
    const assets = this.levelEditorService.extractSpriteAssets(this.resources);
    this.spriteAssets.set(assets);
    if (assets.length > 0 && this.selectedSpriteId() === null) {
      this.selectedSpriteId.set(assets[0].id);
    }
  }

  private setupEmscriptenModule(): void {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const origOpen = XMLHttpRequest.prototype.open;
    const self = this;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string, ...rest: any[]) {
      if (url && url.indexOf('.data') !== -1) {
        this.addEventListener('progress', (e: ProgressEvent) => {
          if (e.lengthComputable) self.progressPct.set(Math.round((e.loaded / e.total) * 100));
        });
      }
      origOpen.apply(this, [method, url, ...rest] as any);
    } as typeof XMLHttpRequest.prototype.open;

    (window as any)['Module'] = {
      canvas,
      print: (t: string) => console.log('[WASM]', t),
      printErr: (t: string) => console.warn('[WASM ERR]', t),
      setStatus: (t: string) => {
        if (t) {
          this.statusText.set(t);
          const m = t.match(/(\d+(?:\.\d+)?)\/(\d+)/);
          if (m) this.progressPct.set(Math.round((parseFloat(m[1]) / parseFloat(m[2])) * 100));
        } else {
          this.statusText.set('Running');
          this.progressPct.set(100);
          this.overlayVisible.set(false);
        }
      },
      monitorRunDependencies: (left: number) => { if (left === 0) this.progressPct.set(100); },
      onRuntimeInitialized: () => {
        this.statusText.set('Running');
        this.overlayVisible.set(false);
        console.log('[Angular] WASM runtime initialized');
        this.applyVolumeToWasm(this.masterVolume());
      },
      preRun: [],
      postRun: [],
    };
  }

  private loadWasmScript(): void {
    this.wasmScript = document.createElement('script');
    this.wasmScript.src = 'reckless_drivin.js';
    this.wasmScript.async = true;
    this.wasmScript.onerror = () => {
      this.statusText.set('Error: failed to load reckless_drivin.js');
      console.error('[Angular] Failed to load WASM JS module');
    };
    document.body.appendChild(this.wasmScript);
  }

  private applyVolumeToWasm(pct: number): void {
    const mod = (window as any)['Module'];
    if (mod && typeof mod._set_wasm_master_volume === 'function') {
      mod._set_wasm_master_volume(pct / 100.0);
    }
  }

  /** Render trackUp (blue) and trackDown (red) path onto the track canvas. */
  private drawTrackCanvas(level: { trackUp: { x: number; y: number }[]; trackDown: { x: number; y: number }[] } | null): void {
    const canvas = document.getElementById('track-canvas') as HTMLCanvasElement | null;
    if (!canvas || !level) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    const allSegs = [...level.trackUp, ...level.trackDown];
    if (allSegs.length === 0) {
      ctx.fillStyle = '#555';
      ctx.font = '14px monospace';
      ctx.fillText('No track segments', W / 2 - 70, H / 2);
      return;
    }

    const xs = allSegs.map((s) => s.x);
    const ys = allSegs.map((s) => s.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const pad = 20;

    const toCanvas = (x: number, y: number): [number, number] => [
      pad + ((x - minX) / rangeX) * (W - 2 * pad),
      H - pad - ((y - minY) / rangeY) * (H - 2 * pad),
    ];

    const drawPath = (segs: typeof level.trackUp, color: string): void => {
      if (segs.length === 0) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const [sx, sy] = toCanvas(segs[0].x, segs[0].y);
      ctx.moveTo(sx, sy);
      for (let i = 1; i < segs.length; i++) {
        const [px, py] = toCanvas(segs[i].x, segs[i].y);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      // Draw start dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.fill();
    };

    drawPath(level.trackUp, '#42a5f5');   // blue = track up
    drawPath(level.trackDown, '#ef5350'); // red = track down
  }
}
