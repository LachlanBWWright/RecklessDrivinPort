import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import {
  LevelEditorService,
  type EditableLevel,
  type EditableSpriteAsset,
} from './level-editor.service';
import { ResourceDatService, type ResourceDatEntry } from './resource-dat.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal("Reckless Drivin' – WebAssembly Port");
  statusText = signal('Loading game data…');
  progressPct = signal(0);
  overlayVisible = signal(true);
  masterVolume = signal(80);

  resourcesStatus = signal('No resources loaded for editing.');
  editorError = signal('');
  hasEditorData = signal(false);
  levels = signal<EditableLevel[]>([]);
  selectedLevelId = signal<number | null>(null);
  paletteValue = signal(0);
  spriteAssets = signal<EditableSpriteAsset[]>([]);
  selectedSpriteId = signal<number | null>(null);
  spriteByteOffset = signal(0);
  spriteByteValue = signal(0);

  private wasmScript: HTMLScriptElement | null = null;
  private resources: ResourceDatEntry[] = [];

  private readonly resourceDatService = new ResourceDatService();
  private readonly levelEditorService = new LevelEditorService();

  ngOnInit(): void {
    this.setupEmscriptenModule();
    this.loadWasmScript();
  }

  ngOnDestroy(): void {
    if (this.wasmScript && this.wasmScript.parentNode) {
      this.wasmScript.parentNode.removeChild(this.wasmScript);
    }
  }

  get selectedLevel(): EditableLevel | null {
    const selectedId = this.selectedLevelId();
    if (selectedId === null) {
      return null;
    }

    return this.levels().find((level) => level.resourceId === selectedId) ?? null;
  }

  async loadDefaultResources(): Promise<void> {
    try {
      this.editorError.set('');
      this.resourcesStatus.set('Loading default resources.dat…');
      const response = await fetch('resources.dat');
      if (!response.ok) {
        throw new Error(`Unable to fetch resources.dat (${response.status})`);
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      this.loadResourcesBytes(bytes, 'default resources.dat');
    } catch (error) {
      this.editorError.set(error instanceof Error ? error.message : 'Failed to load default resources.dat');
      this.resourcesStatus.set('Failed to load resources.');
    }
  }

  async onResourceFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.editorError.set('');

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      this.loadResourcesBytes(bytes, file.name);
    } catch (error) {
      this.editorError.set(error instanceof Error ? error.message : 'Failed to load uploaded resources.dat');
      this.resourcesStatus.set('Failed to load uploaded file.');
    }
  }

  selectLevel(levelId: number): void {
    this.selectedLevelId.set(levelId);
  }

  onPaletteDragStart(event: DragEvent, value: number): void {
    this.paletteValue.set(value);
    event.dataTransfer?.setData('text/plain', value.toString(10));
  }

  onGridDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onGridDrop(event: DragEvent, tileIndex: number): void {
    event.preventDefault();
    const dragged = event.dataTransfer?.getData('text/plain');
    if (!dragged) {
      return;
    }

    const value = Number.parseInt(dragged, 10);
    if (Number.isNaN(value)) {
      return;
    }

    this.paintTile(tileIndex, value);
  }

  onGridCellClick(tileIndex: number): void {
    this.paintTile(tileIndex, this.paletteValue());
  }

  onPaletteInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number.parseInt(input.value, 10);
    if (!Number.isNaN(value)) {
      this.paletteValue.set(Math.max(0, Math.min(15, value)));
    }
  }

  selectSprite(spriteId: number): void {
    this.selectedSpriteId.set(spriteId);
    this.spriteByteOffset.set(0);
    const entry = this.resources.find((resource) => resource.type === 'PPic' && resource.id === spriteId);
    this.spriteByteValue.set(entry && entry.data.length > 0 ? entry.data[0] : 0);
  }

  onSpriteOffsetInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const nextOffset = Number.parseInt(input.value, 10);
    if (Number.isNaN(nextOffset)) {
      return;
    }

    this.spriteByteOffset.set(Math.max(0, nextOffset));
  }

  onSpriteValueInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const nextValue = Number.parseInt(input.value, 10);
    if (Number.isNaN(nextValue)) {
      return;
    }

    this.spriteByteValue.set(Math.max(0, Math.min(255, nextValue)));
  }

  applySpriteByteEdit(): void {
    const spriteId = this.selectedSpriteId();
    if (spriteId === null) {
      return;
    }

    this.resources = this.levelEditorService.applySpriteByte(
      this.resources,
      spriteId,
      this.spriteByteOffset(),
      this.spriteByteValue(),
    );
    this.resourcesStatus.set(`Applied sprite edit to PPic #${spriteId}.`);
    this.refreshEditorState();
  }

  downloadEditedResources(): void {
    if (!this.hasEditorData()) {
      return;
    }

    this.resources = this.levelEditorService.applyLevels(this.resources, this.levels());
    const output = this.resourceDatService.serialize(this.resources);

    const safeBuffer = new ArrayBuffer(output.byteLength);
    new Uint8Array(safeBuffer).set(output);
    const blob = new Blob([safeBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'resources.dat';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    this.resourcesStatus.set('Downloaded updated resources.dat.');
  }

  tileColor(value: number): string {
    const clamped = Math.max(0, Math.min(15, value));
    const shade = Math.round((clamped / 15) * 255);
    return `rgb(${shade}, ${60 + Math.round(shade * 0.5)}, ${30 + Math.round(shade * 0.3)})`;
  }

  toggleFullscreen(): void {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      canvas.requestFullscreen().catch((err) => console.warn('Fullscreen error:', err));
    }
  }

  onVolumeChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const pct = parseInt(input.value, 10);
    this.masterVolume.set(pct);
    this.applyVolumeToWasm(pct);
  }

  private paintTile(tileIndex: number, value: number): void {
    const selectedId = this.selectedLevelId();
    if (selectedId === null) {
      return;
    }

    this.levels.update((levels) =>
      levels.map((level) => {
        if (level.resourceId !== selectedId) {
          return level;
        }

        if (tileIndex < 0 || tileIndex >= level.tiles.length) {
          return level;
        }

        const nextTiles = [...level.tiles];
        nextTiles[tileIndex] = Math.max(0, Math.min(15, value));
        return {
          ...level,
          tiles: nextTiles,
        };
      }),
    );
  }

  private loadResourcesBytes(bytes: Uint8Array, sourceName: string): void {
    this.resources = this.resourceDatService.parse(bytes);
    this.resourcesStatus.set(`Loaded ${this.resources.length} resources from ${sourceName}.`);
    this.editorError.set('');
    this.refreshEditorState();
    this.hasEditorData.set(true);
  }

  private refreshEditorState(): void {
    const extractedLevels = this.levelEditorService.extractLevels(this.resources);
    this.levels.set(extractedLevels);
    this.selectedLevelId.set(extractedLevels.length > 0 ? extractedLevels[0].resourceId : null);

    const assets = this.levelEditorService.extractSpriteAssets(this.resources);
    this.spriteAssets.set(assets);
    this.selectedSpriteId.set(assets.length > 0 ? assets[0].id : null);
  }

  private setupEmscriptenModule(): void {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;

    const origOpen = XMLHttpRequest.prototype.open;
    const self = this;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string, ...rest: any[]) {
      if (url && url.indexOf('.data') !== -1) {
        this.addEventListener('progress', (e: ProgressEvent) => {
          if (e.lengthComputable) {
            self.progressPct.set(Math.round((e.loaded / e.total) * 100));
          }
        });
      }
      origOpen.apply(this, [method, url, ...rest] as any);
    } as typeof XMLHttpRequest.prototype.open;

    (window as any)['Module'] = {
      canvas,
      print: (text: string) => console.log('[WASM]', text),
      printErr: (text: string) => console.warn('[WASM ERR]', text),
      setStatus: (text: string) => {
        if (text) {
          this.statusText.set(text);
          const m = text.match(/(\d+(?:\.\d+)?)\/(\d+)/);
          if (m) {
            this.progressPct.set(Math.round((parseFloat(m[1]) / parseFloat(m[2])) * 100));
          }
        } else {
          this.statusText.set('Running');
          this.progressPct.set(100);
          this.overlayVisible.set(false);
        }
      },
      monitorRunDependencies: (left: number) => {
        if (left === 0) this.progressPct.set(100);
      },
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
}
