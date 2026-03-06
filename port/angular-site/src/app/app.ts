import { Component, OnDestroy, OnInit, signal, computed, effect, afterNextRender } from '@angular/core';
import {
  LevelEditorService,
  type ParsedLevel,
  type LevelProperties,
  type ObjectPos,
  type EditableSpriteAsset,
} from './level-editor.service';
import { ResourceDatService, type ResourceDatEntry } from './resource-dat.service';

export type AppTab = 'game' | 'editor';
export type EditorSection = 'properties' | 'objects' | 'road' | 'sprites';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
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
        afterNextRender(() => this.drawTrackCanvas(level));
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
      this.editXStartPos.set(level.properties.xStartPos);
      this.editLevelEnd.set(level.properties.levelEnd);
      this.propertiesDirty.set(false);
      this.objects.set([...level.objects]);
      this.selectedObjIndex.set(null);
    }
  }

  // ---- Level properties ----

  onPropsInput(field: keyof LevelProperties, event: Event): void {
    const val = Number.parseInt((event.target as HTMLInputElement).value, 10);
    if (Number.isNaN(val)) return;
    switch (field) {
      case 'roadInfo': this.editRoadInfo.set(val); break;
      case 'time': this.editTime.set(Math.max(0, val)); break;
      case 'xStartPos': this.editXStartPos.set(val); break;
      case 'levelEnd': this.editLevelEnd.set(Math.max(0, val)); break;
    }
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
