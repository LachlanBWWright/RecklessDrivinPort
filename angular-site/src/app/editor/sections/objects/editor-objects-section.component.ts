import {
  Component,
  ChangeDetectionStrategy,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import type {
  MarkSeg,
  ObjectGroupDefinition,
  ObjectGroupEntryData,
  ObjectGroupSpawnPreviewObject,
  ObjectPos,
  ParsedLevel,
  RoadInfoOption,
  TrackWaypointRef,
} from '../../../level-editor.service';
import type { DrawMode } from '../../../editor/editor-canvas.component';
import type { MarkingRoadSelection } from '../../../road-marking-utils';
import {
  DEFAULT_OBJECT_GROUP_PREVIEW_START_Y,
  generateObjectGroupSpawnPreview,
} from '../../../object-group-spawn-preview';

interface VisibleObjectGroupSlot {
  slotIndex: number;
  resID: number;
  numObjs: number;
  group: ObjectGroupDefinition | null;
}

@Component({
  selector: 'app-editor-objects-section',
  templateUrl: './editor-objects-section.component.html',
  host: {
    class: 'flex min-h-0 flex-1 flex-col w-full',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectsSectionComponent implements OnChanges, OnDestroy {
  @Input() selectedLevel: ParsedLevel | null = null;
  @Input() levelNum = 0;
  @Input() objects: ObjectPos[] = [];
  @Input() selectedObjIndex: number | null = null;
  @Input() marks: MarkSeg[] = [];
  @Input() selectedMarkIndex: number | null = null;
  @Input() showTrackOverlay = false;
  @Input() showMarks = true;
  @Input() barrierDrawSide: 'v0' | 'v1' | 'i' | 'v2' | 'v3' = 'v0';
  @Input() drawMode: DrawMode = 'none';
  @Input() roadInfoOptions: RoadInfoOption[] = [];
  @Input() editRoadInfo = 0;
  @Input() editTime = 0;
  @Input() canUndo = false;
  @Input() canRedo = false;
  @Input() trackUpCount = 0;
  @Input() trackDownCount = 0;
  @Input() roadSegCount = 0;
  @Input() zoom = 1;
  @Input() panX = 0;
  @Input() panY = 0;
  @Input() scrollYMax = 5000;
  @Input() scrollXMin = -600;
  @Input() scrollXMax = 600;
  @Input() workerBusy = false;
  @Input() isDragging = false;
  @Input() dragTrackWaypoint: TrackWaypointRef | null = null;
  @Input() hoverTrackWaypoint: TrackWaypointRef | null = null;
  @Input() spaceDown = false;
  @Input() roadMaxY = 0;
  @Input() objectCount = 0;
  @Input() hasMarkingPreview = false;
  @Input() markCreateMode = false;
  @Input() pendingMarkPointCount = 0;
  @Input() editObjectGroups: { resID: number; numObjs: number }[] = [];
  @Input() objectGroupDefinitions: ObjectGroupDefinition[] = [];
  @Input() levelEnd = 0;
  @Input() editObjDirDeg = 0;
  @Input() editObjTypeRes = 128;
  @Input() availableTypeIds: number[] = [];
  @Input() spriteUrl: string | null = null;
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
  @Input() getFallbackColor: (typeRes: number) => string = () => '#888';
  @Input() getObjTypeDimensionLabel: (typeRes: number) => string = () => '';
  @Input() typePalette: { hex: string; typeId: number }[] = [];
  @Input() visibleTypeFilter: Set<number> = new Set();
  @Input() typeDimLabel = '';
  @Input() filteredIndices: number[] = [];
  @Input() searchTerm = '';

  @Output() canvasMouseDown = new EventEmitter<MouseEvent>();
  @Output() canvasMouseMove = new EventEmitter<MouseEvent>();
  @Output() canvasMouseUp = new EventEmitter<MouseEvent>();
  @Output() canvasDblClick = new EventEmitter<MouseEvent>();
  @Output() canvasContextMenu = new EventEmitter<MouseEvent>();
  @Output() canvasKeyDown = new EventEmitter<KeyboardEvent>();
  @Output() canvasKeyUp = new EventEmitter<KeyboardEvent>();
  @Output() canvasWheel = new EventEmitter<WheelEvent>();
  @Output() addObject = new EventEmitter<void>();
  @Output() removeObject = new EventEmitter<void>();
  @Output() duplicateObject = new EventEmitter<void>();
  @Output() frameAll = new EventEmitter<void>();
  @Output() centerSelected = new EventEmitter<void>();
  @Output() toggleTracks = new EventEmitter<void>();
  @Output() zoomIn = new EventEmitter<void>();
  @Output() zoomOut = new EventEmitter<void>();
  @Output() resetView = new EventEmitter<void>();
  @Output() undo = new EventEmitter<void>();
  @Output() redo = new EventEmitter<void>();
  @Output() roadInfoChange = new EventEmitter<number>();
  @Output() timeChange = new EventEmitter<number>();
  @Output() toggleMarks = new EventEmitter<void>();
  @Output() barrierDrawSideChange = new EventEmitter<'v0' | 'v1' | 'i' | 'v2' | 'v3'>();
  @Output() drawModeChange = new EventEmitter<DrawMode>();
  @Output() addMark = new EventEmitter<void>();
  @Output() removeMark = new EventEmitter<void>();
  @Output() startMarkCreate = new EventEmitter<void>();
  @Output() confirmMarkCreate = new EventEmitter<void>();
  @Output() generateSideMarks = new EventEmitter<{
    roadSelection: MarkingRoadSelection;
    yStart: number;
    yEnd: number;
    inset: number;
    yFrequency: number;
  }>();
  @Output() generateCentreMarks = new EventEmitter<{
    roadSelection: MarkingRoadSelection;
    yStart: number;
    yEnd: number;
    dashLength: number;
    gapLength: number;
  }>();
  @Output() previewSideMarks = new EventEmitter<{
    roadSelection: MarkingRoadSelection;
    yStart: number;
    yEnd: number;
    inset: number;
    yFrequency: number;
  }>();
  @Output() previewCentreMarks = new EventEmitter<{
    roadSelection: MarkingRoadSelection;
    yStart: number;
    yEnd: number;
    dashLength: number;
    gapLength: number;
  }>();
  @Output() previewRange = new EventEmitter<{ yStart: number; yEnd: number }>();
  @Output() removeMarks = new EventEmitter<{ yStart: number; yEnd: number }>();
  @Output() clearMarkingPreview = new EventEmitter<void>();
  @Output() objectGroupPreviewChange = new EventEmitter<{ yStart: number; yEnd: number } | null>();
  @Output() objectGroupSpawnPreviewChange = new EventEmitter<ObjectGroupSpawnPreviewObject[]>();
  @Output() panXChange = new EventEmitter<number>();
  @Output() panYChange = new EventEmitter<number>();
  @Output() objectSelected = new EventEmitter<number>();
  @Output() searchTermChange = new EventEmitter<string>();
  @Output() dirDegInput = new EventEmitter<string>();
  @Output() typeResChange = new EventEmitter<number>();
  @Output() typeVisibilityToggle = new EventEmitter<number>();
  @Output() showAll = new EventEmitter<void>();
  @Output() hideAll = new EventEmitter<void>();
  @Output() removeSelected = new EventEmitter<void>();
  @Output() deselect = new EventEmitter<void>();

  sidebarTab: 'objects' | 'groups' = 'objects';
  selectedObjectGroupSlotIndex: number | null = null;
  showGeneratedObjectGroupPreviews = true;
  previewStartY = DEFAULT_OBJECT_GROUP_PREVIEW_START_Y;
  private enabledGeneratedPreviewSlotIndices = new Set<number>();
  private generatedPreviewSeeds = new Map<number, number>();
  private generatedObjectGroupPreviewObjects: ObjectGroupSpawnPreviewObject[] = [];

  get enabledGeneratedObjectGroupPreviewCount(): number {
    return this.enabledGeneratedPreviewSlotIndices.size;
  }

  get visibleObjectGroupSlots(): VisibleObjectGroupSlot[] {
    return this.editObjectGroups
      .map((slot, slotIndex) => ({
        slotIndex,
        resID: slot.resID,
        numObjs: slot.numObjs,
        group: slot.resID !== 0 ? this.getObjectGroupDefinition(slot.resID) : null,
      }))
      .filter((slot) => slot.resID !== 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['levelEnd']) {
      this.previewStartY = this.normalizePreviewStartY(this.previewStartY);
    }
    if (changes['editObjectGroups'] || changes['objectGroupDefinitions'] || changes['levelEnd']) {
      this.syncSelectedObjectGroupSlot();
    }
    if (
      changes['editObjectGroups'] ||
      changes['objectGroupDefinitions'] ||
      changes['levelEnd'] ||
      changes['objects'] ||
      changes['selectedLevel']
    ) {
      this.syncGeneratedPreviewState();
      this.recomputeGeneratedObjectGroupPreview();
    }
  }

  ngOnDestroy(): void {
    this.objectGroupPreviewChange.emit(null);
    this.objectGroupSpawnPreviewChange.emit([]);
  }

  setSidebarTab(tab: 'objects' | 'groups'): void {
    if (this.sidebarTab === tab) return;
    this.sidebarTab = tab;
    this.syncSelectedObjectGroupSlot();
    this.pushGeneratedObjectGroupPreview();
  }

  selectObjectGroupSlot(index: number): void {
    this.selectedObjectGroupSlotIndex = index;
    this.emitCurrentObjectGroupPreview();
  }

  trackVisibleObjectGroupSlot(_index: number, slot: VisibleObjectGroupSlot): number {
    return slot.slotIndex;
  }

  trackGroupEntry(index: number, entry: ObjectGroupEntryData): string {
    return `${index}:${entry.typeRes}:${entry.minOffs}:${entry.maxOffs}:${entry.probility}:${entry.dir}`;
  }

  trackPreviewEntry(index: number, entry: ObjectGroupEntryData): string {
    return `${index}:${entry.typeRes}:${entry.probility}:${entry.dir}`;
  }

  getPreviewRotationDegrees(dir: number): number {
    return Number.isFinite(dir) && dir >= 0 ? (dir * 180) / Math.PI : 0;
  }

  getPreviewEntries(group: ObjectGroupDefinition | null, limit = 3): ObjectGroupEntryData[] {
    if (!group) return [];
    return [...group.entries]
      .map((entry, index) => ({ entry, index }))
      .sort(
        (left, right) => right.entry.probility - left.entry.probility || left.index - right.index,
      )
      .slice(0, limit)
      .map(({ entry }) => entry);
  }

  getPreviewOverflowCount(group: ObjectGroupDefinition | null, limit = 3): number {
    if (!group) return 0;
    return Math.max(0, group.entries.length - limit);
  }

  isGeneratedObjectGroupPreviewEnabled(slotIndex: number): boolean {
    return this.enabledGeneratedPreviewSlotIndices.has(slotIndex);
  }

  getGeneratedObjectGroupPreviewCount(slotIndex: number): number {
    return this.generatedObjectGroupPreviewObjects.filter((item) => item.slotIndex === slotIndex)
      .length;
  }

  getObjectGroupDefinition(resId: number): ObjectGroupDefinition | null {
    return this.objectGroupDefinitions.find((group) => group.id === resId) ?? null;
  }

  getObjectGroupLabel(resId: number): string {
    if (resId === 0) return '0 · empty slot';
    const group = this.getObjectGroupDefinition(resId);
    return group ? `#${group.id}` : `#${resId} (custom)`;
  }

  getTypeLabel(typeRes: number): string {
    const dims = this.getObjTypeDimensionLabel(typeRes);
    return dims ? `#${typeRes} · ${dims}` : `#${typeRes}`;
  }

  getRelativeOddsLabel(
    entries: readonly ObjectGroupEntryData[],
    entry: ObjectGroupEntryData,
  ): string {
    const total = entries.reduce((sum, item) => sum + Math.max(0, item.probility), 0);
    const weight = Math.max(0, entry.probility);
    if (total <= 0) return '0%';
    const percent = (weight / total) * 100;
    return `${percent >= 10 || Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1)}%`;
  }

  getOffsetSummary(entry: ObjectGroupEntryData): string {
    if (entry.dir === -1) {
      return `Stored offs ${entry.minOffs} -> ${entry.maxOffs} (ignored by native auto-track spawn)`;
    }
    return `Signed X offs ${entry.minOffs} -> ${entry.maxOffs} from the chosen road border (+ inward, - outward relative to that border)`;
  }

  setShowGeneratedObjectGroupPreviews(show: boolean): void {
    if (this.showGeneratedObjectGroupPreviews === show) {
      return;
    }
    this.showGeneratedObjectGroupPreviews = show;
    this.pushGeneratedObjectGroupPreview();
  }

  onPreviewStartYInput(rawValue: string): void {
    const trimmed = rawValue.trim();
    const nextValue = trimmed === '' ? this.defaultPreviewStartY() : Number.parseInt(trimmed, 10);
    if (Number.isNaN(nextValue)) {
      return;
    }
    const normalized = this.normalizePreviewStartY(nextValue);
    if (normalized === this.previewStartY) {
      return;
    }
    this.previewStartY = normalized;
    this.emitCurrentObjectGroupPreview();
    this.recomputeGeneratedObjectGroupPreview();
  }

  toggleGeneratedPreviewForSlot(slotIndex: number, enabled: boolean): void {
    if (enabled) {
      if (!this.canPreviewObjectGroupSlot(slotIndex)) {
        return;
      }
      this.enabledGeneratedPreviewSlotIndices.add(slotIndex);
      this.ensureGeneratedPreviewSeed(slotIndex);
    } else {
      this.enabledGeneratedPreviewSlotIndices.delete(slotIndex);
    }
    this.recomputeGeneratedObjectGroupPreview();
    if (enabled) {
      this.focusGeneratedPreview(slotIndex);
    }
  }

  regeneratePreviewForSlot(slotIndex: number): void {
    if (!this.canPreviewObjectGroupSlot(slotIndex)) {
      return;
    }
    this.showGeneratedObjectGroupPreviews = true;
    this.enabledGeneratedPreviewSlotIndices.add(slotIndex);
    this.generatedPreviewSeeds.set(slotIndex, this.createPreviewSeed(slotIndex));
    this.recomputeGeneratedObjectGroupPreview();
    this.focusGeneratedPreview(slotIndex);
  }

  regenerateEnabledGeneratedPreviews(): void {
    if (this.enabledGeneratedPreviewSlotIndices.size === 0) {
      return;
    }
    for (const slotIndex of this.enabledGeneratedPreviewSlotIndices) {
      if (this.canPreviewObjectGroupSlot(slotIndex)) {
        this.generatedPreviewSeeds.set(slotIndex, this.createPreviewSeed(slotIndex));
      }
    }
    this.recomputeGeneratedObjectGroupPreview();
    this.focusGeneratedPreview();
  }

  canPreviewObjectGroupSlot(index: number): boolean {
    const slot = this.editObjectGroups[index];
    return (
      !!slot &&
      slot.resID !== 0 &&
      this.getObjectGroupDefinition(slot.resID) !== null &&
      this.selectedLevel !== null &&
      this.levelEnd > 0
    );
  }

  private syncSelectedObjectGroupSlot(): void {
    if (this.sidebarTab !== 'groups') {
      this.objectGroupPreviewChange.emit(null);
      return;
    }
    const currentIndex = this.selectedObjectGroupSlotIndex;
    const currentIsValid =
      currentIndex !== null &&
      currentIndex >= 0 &&
      currentIndex < this.editObjectGroups.length &&
      this.editObjectGroups[currentIndex].resID !== 0;
    if (!currentIsValid) {
      const nextIndex = this.editObjectGroups.findIndex((slot) => slot.resID !== 0);
      this.selectedObjectGroupSlotIndex = nextIndex >= 0 ? nextIndex : null;
    }
    this.emitCurrentObjectGroupPreview();
  }

  private emitCurrentObjectGroupPreview(): void {
    if (
      this.sidebarTab !== 'groups' ||
      this.selectedObjectGroupSlotIndex === null ||
      !this.canPreviewObjectGroupSlot(this.selectedObjectGroupSlotIndex)
    ) {
      this.objectGroupPreviewChange.emit(null);
      return;
    }
    this.objectGroupPreviewChange.emit({
      yStart: this.previewStartY,
      yEnd: this.levelEnd,
    });
  }

  private defaultPreviewStartY(): number {
    if (this.levelEnd <= 0) {
      return DEFAULT_OBJECT_GROUP_PREVIEW_START_Y;
    }
    return Math.min(DEFAULT_OBJECT_GROUP_PREVIEW_START_Y, this.levelEnd);
  }

  private normalizePreviewStartY(value: number): number {
    if (!Number.isFinite(value)) {
      return this.defaultPreviewStartY();
    }
    if (this.levelEnd <= 0) {
      return Math.max(0, Math.round(value));
    }
    return Math.max(0, Math.min(Math.round(value), this.levelEnd));
  }

  private syncGeneratedPreviewState(): void {
    const validSlotIndices = new Set(
      this.visibleObjectGroupSlots
        .filter((slot) => this.canPreviewObjectGroupSlot(slot.slotIndex))
        .map((slot) => slot.slotIndex),
    );

    this.enabledGeneratedPreviewSlotIndices = new Set(
      Array.from(this.enabledGeneratedPreviewSlotIndices).filter((slotIndex) =>
        validSlotIndices.has(slotIndex),
      ),
    );

    for (const slotIndex of Array.from(this.generatedPreviewSeeds.keys())) {
      if (!validSlotIndices.has(slotIndex)) {
        this.generatedPreviewSeeds.delete(slotIndex);
      }
    }
  }

  private recomputeGeneratedObjectGroupPreview(): void {
    const level = this.selectedLevel;
    if (
      level === null ||
      this.enabledGeneratedPreviewSlotIndices.size === 0 ||
      this.levelEnd <= 0
    ) {
      this.generatedObjectGroupPreviewObjects = [];
      this.pushGeneratedObjectGroupPreview();
      return;
    }

    const previewSlots = this.visibleObjectGroupSlots.reduce<
      {
        slotIndex: number;
        numObjs: number;
        seed: number;
        group: ObjectGroupDefinition;
      }[]
    >((slots, slot) => {
      if (
        slot.group === null ||
        !this.enabledGeneratedPreviewSlotIndices.has(slot.slotIndex) ||
        !this.canPreviewObjectGroupSlot(slot.slotIndex)
      ) {
        return slots;
      }
      slots.push({
        slotIndex: slot.slotIndex,
        numObjs: slot.numObjs,
        seed: this.ensureGeneratedPreviewSeed(slot.slotIndex),
        group: slot.group,
      });
      return slots;
    }, []);

    this.generatedObjectGroupPreviewObjects = generateObjectGroupSpawnPreview({
      previewStartY: this.previewStartY,
      levelEnd: this.levelEnd,
      roadSegs: level.roadSegs,
      trackUp: level.trackUp,
      trackDown: level.trackDown,
      occupiedObjects: this.objects,
      slots: previewSlots,
    });
    this.pushGeneratedObjectGroupPreview();
  }

  private pushGeneratedObjectGroupPreview(): void {
    this.objectGroupSpawnPreviewChange.emit(
      this.sidebarTab === 'groups' && this.showGeneratedObjectGroupPreviews
        ? this.generatedObjectGroupPreviewObjects
        : [],
    );
  }

  private focusGeneratedPreview(slotIndex?: number): void {
    const relevantObjects =
      slotIndex === undefined
        ? this.generatedObjectGroupPreviewObjects
        : this.generatedObjectGroupPreviewObjects.filter((item) => item.slotIndex === slotIndex);
    if (relevantObjects.length === 0) {
      return;
    }

    const sortedY = relevantObjects.map((item) => item.y).sort((left, right) => left - right);
    const medianY = sortedY[Math.floor(sortedY.length / 2)];
    this.panYChange.emit(Math.round(medianY));
  }

  private ensureGeneratedPreviewSeed(slotIndex: number): number {
    const existing = this.generatedPreviewSeeds.get(slotIndex);
    if (existing !== undefined) {
      return existing;
    }
    const created = this.createPreviewSeed(slotIndex);
    this.generatedPreviewSeeds.set(slotIndex, created);
    return created;
  }

  private createPreviewSeed(slotIndex: number): number {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi?.getRandomValues) {
      const values = new Uint32Array(1);
      cryptoApi.getRandomValues(values);
      return values[0] === 0 ? slotIndex + 1 : values[0];
    }
    return ((Date.now() + 1) * (slotIndex + 17)) >>> 0 || slotIndex + 1;
  }
}
