import {
  Component,
  OnDestroy,
  OnInit,
  AfterViewInit,
  ChangeDetectionStrategy,
  ViewEncapsulation,
} from '@angular/core';
import { AppStateResources } from './app-state-resources';
import type {
  ParsedLevel,
  ObjectGroupEntryData,
  ObjectTypeDefinition,
  RoadInfoData,
  ObjectGroupDefinition,
  ObjectGroupSpawnPreviewObject,
} from './level-editor.service';
import {
  applyLevelsResult,
  onObjGroupInput,
  onPropsInput,
  onPropertiesTabInput,
  onRoadInfoChange,
  onRoadInfoInput,
  onRoadTexturePick,
  onTimeLimitChange,
  resetViewToRoad,
  selectLevel,
  selectRoadInfo,
} from './app-level';
import {
  addObjectGroup,
  addObjectGroupEntry,
  addObjectType,
  cloneObjectGroupDefinitions,
  cloneObjectTypeDefinitions,
  defaultObjectGroupEntry,
  defaultObjectTypeDefinition,
  deleteObjectGroup,
  deleteObjectGroupEntry,
  deleteObjectType,
  markObjectTypesDirty,
  nextObjectGroupId,
  nextObjectTypeId,
  onObjectGroupEntryInput,
  onObjectTypeFieldInput,
  onObjectTypeFlagToggle,
  onObjectTypeFrameChange,
  onObjectTypeReferenceChange,
  saveObjectGroups,
  saveObjectTypes,
  scheduleObjectTypesAutoSave,
  selectObjectGroup,
  selectObjectType,
  selectedObjectGroup,
  selectedObjectType,
  syncObjectTypeLookup,
} from './app-pack-editing';
import {
  addObject,
  applyObjEdit,
  canvasToWorld,
  centerOnSelectedObject,
  duplicateSelectedObject,
  frameAllObjects,
  getObjectTypeDimensionLabel,
  hideAllObjectTypes,
  onCanvasContextMenu,
  onCanvasDoubleClick,
  onCanvasKeyDown,
  onCanvasKeyUp,
  onCanvasMouseDown,
  onCanvasMouseMove,
  onCanvasMouseUp,
  onCanvasWheel,
  onObjDirDegInput,
  onObjTypeResChange,
  redrawObjectCanvas,
  removeSelectedObject,
  resetView,
  insertWaypointAfter,
  saveLevelObjects,
  saveTrack,
  selectObject,
  showAllObjectTypes,
  toggleTypeVisibility,
  worldToCanvas,
} from './object-canvas';
import { OBJ_PALETTE } from './object-canvas';
import {
  destroyApp,
  formatTime,
  initializeKonvaOverlay,
  getEditorSectionIndex as getEditorSectionIndexHelper,
  onAfterViewInit as onAfterViewInitHelper,
  onInit as onInitHelper,
  setupAppLifecycle,
  setEditorSectionIndex as setEditorSectionIndexHelper,
  SECTION_ORDER as APP_SECTION_ORDER,
} from './app-runtime';
import {
  beginFinishLineDrag,
  beginStartMarkerDrag,
  handleTrackContextMenuAtWorld,
} from './app-runtime-track';
import {
  getPackSpriteDataUrl,
  getRoadInfoPreviewDataUrl,
  getTileDataUrl,
  lookupTileDimensions,
} from './app-loaders';
import { getCanvasDataUrl, getKeyedCanvasDataUrl, getObjFallbackColor } from './app-helpers';
import {
  applyUndoSnapshot,
  captureUndoSnapshot,
  pushUndo,
  redo,
  resetObjectHistory,
  undo,
  type EditorUndoKind,
  type EditorUndoSnapshot,
} from './app-history';
import {
  addMark,
  addMarkCreatePoint,
  applyBarrierDrawPath,
  clearMarkingPreviews,
  confirmMarkCreateMode,
  generateCentreRoadMarks,
  generateSideRoadMarks,
  handleCurveDrawClick,
  hasColocatedNubs,
  joinAdjacentMarkNubs,
  onMarkFieldInput,
  previewCentreRoadMarks,
  previewSideRoadMarks,
  removeMarksByYRange,
  removeSelectedMark,
  saveMarks,
  scheduleMarkAutoSave,
  setMarkingRangePreview,
  splitCollocatedMarkNubs,
  startMarkCreateMode,
  updateCurvePreview,
} from './app-mark-editor';
import {
  onMarkCanvasMouseDown,
  onMarkCanvasMouseMove,
  onMarkCanvasMouseUp,
  redrawMarkCanvas,
} from './app-mark-canvas';
import {
  addSpriteFrame,
  exportSpritePng,
  getSpriteFormatLabel,
  openSpriteEditor,
  onSpriteEditorSaved,
  onSpritePngUpload,
  redrawSpriteCanvas,
  selectSprite,
} from './sprite-editor';
import {
  lookupRoadReferenceLevelNums,
  lookupTileReferenceRoadInfoIds,
  markObjectGroupsDirty,
  markPropertiesDirty,
  createRoadInfo,
  deleteRoadInfo,
  queuePackSync,
  queueRoadInfoSync,
  refreshRoadInfoDerivedState,
  saveLevelProperties,
  scheduleObjectGroupsAutoSave,
  syncSelectedRoadInfoSelection,
} from './app-road-editing';
import { createMediaActions } from './app-media-actions';
import { createRuntimeActions } from './app-runtime-actions';
import {
  BONUS_ROLL_COP,
  type CustomOptionsPresetId,
  type CustomResourcesPresetId,
  type CustomSettingsPresetId,
} from './game/game-customisation-presets';

/** Worker response envelope sent from pack.worker.ts */
/**
 * Subset of the Emscripten runtime module attached to window.Module.
 * Allows typed access without `window as any`.
 */
interface EmscriptenModuleInterface {
  canvas: HTMLCanvasElement;
  /** Emscripten hook to resolve file paths (e.g. .wasm, .data) relative to base href. */
  locateFile?: (path: string, scriptDirectory?: string) => string;
  print: (text: string) => void;
  printErr: (text: string) => void;
  setStatus: (status: string) => void;
  monitorRunDependencies: (left: number) => void;
  onRuntimeInitialized: () => void;
  preRun: (() => void)[];
  postRun: (() => void)[];
  _set_wasm_master_volume?: (vol: number) => void;
  _rd_set_editor_launch_options?: (
    enabled: number,
    autoStart: number,
    levelID: number,
    hasStartY: number,
    startY: number,
    hasObjectGroupStartY: number,
    objectGroupStartY: number,
    forcedAddOns: number,
    disabledBonusRollMask: number,
  ) => void;
  _rd_start_editor_test_drive?: () => void;
  /** Pause the Emscripten main loop before a restart. */
  pauseMainLoop?: () => void;
  /** Resume the Emscripten main loop after a pause. */
  resumeMainLoop?: () => void;
  /** Re-run C main() with new argv — restarts the game in-place. */
  callMain?: (args: string[]) => void;
  /** Direct C _main(argc, argv) — fallback if callMain not present. */
  _main?: (argc: number, argv: number) => void;
  /** Add an async startup dependency so main() waits until it is removed. */
  addRunDependency?: (id: string) => void;
  /** Remove a startup dependency previously added with addRunDependency. */
  removeRunDependency?: (id: string) => void;
}

declare global {
  interface Window {
    /** Emscripten-compiled WASM module. Attached by the generated .js loader. */
    Module?: EmscriptenModuleInterface;
  }
}

export type AppTab = 'game' | 'editor';

export type { EditorUndoKind, EditorUndoSnapshot } from './app-history';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  host: {
    class: 'flex min-h-0 flex-1 flex-col overflow-hidden',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class App extends AppStateResources implements OnInit, AfterViewInit, OnDestroy {
  constructor() {
    super();
    setupAppLifecycle(this);
  }

  readonly media = createMediaActions(this);
  readonly runtime = createRuntimeActions(this);

  readonly formatTime = formatTime;

  readonly SECTION_ORDER = APP_SECTION_ORDER;

  ngOnInit(): void {
    onInitHelper(this);
  }

  ngAfterViewInit(): void {
    onAfterViewInitHelper(this);
  }

  initKonvaIfNeeded(): void {
    initializeKonvaOverlay(this);
  }

  _beginStartMarkerDrag(focusTarget: EventTarget | null): void {
    beginStartMarkerDrag(this, focusTarget);
  }

  _beginFinishLineDrag(focusTarget: EventTarget | null): void {
    beginFinishLineDrag(this, focusTarget);
  }

  _handleTrackContextMenuAtWorld(wx: number, wy: number): void {
    handleTrackContextMenuAtWorld(this, wx, wy);
  }

  ngOnDestroy(): void {
    destroyApp(this);
  }

  get editorSectionIndex(): number {
    return getEditorSectionIndexHelper(this);
  }

  set editorSectionIndex(idx: number) {
    setEditorSectionIndexHelper(this, idx);
  }

  readonly getPackSpriteDataUrl = (frameId: number): string | null =>
    getPackSpriteDataUrl(this, frameId);

  readonly getTileDataUrl = (texId: number): string | null => getTileDataUrl(this, texId);

  readonly getRoadInfoPreviewDataUrl = (roadInfoId: number): string | null =>
    getRoadInfoPreviewDataUrl(this, roadInfoId);

  readonly getTileDimensions = (texId: number): string => lookupTileDimensions(this, texId);

  readonly getIconThumbDataUrl = (type: string, id: number): string | null => {
    const key = `${type}:${id}`;
    return getKeyedCanvasDataUrl(this._iconDataUrls, this.iconCanvasMap, key);
  };

  readonly getSpritePreviewDataUrl = (typeRes: number): string | null =>
    getCanvasDataUrl(this._spritePreviewDataUrls, this.objectSpritePreviews, typeRes);

  readonly getObjFallbackColor = (typeRes: number): string =>
    getObjFallbackColor(typeRes, OBJ_PALETTE);

  /** Apply fresh level list received from the worker after a save operation. */
  applyLevelsResult(
    levels: ParsedLevel[],
    options?: { preserveCanvasView?: boolean; refreshSelectedLevelState?: boolean },
  ): void {
    applyLevelsResult(this, levels, options);
  }

  getObjectSpritePreview(typeRes: number): HTMLCanvasElement | null {
    return this.objectSpritePreviews.get(typeRes) ?? null;
  }

  selectLevel(id: number, options?: { preserveView?: boolean }): void {
    selectLevel(this, id, options);
  }

  resetViewToRoad(level: ParsedLevel): void {
    resetViewToRoad(this, level);
  }

  private clampEditorTestDriveLevelNumber(levelNumber: number): number {
    const maxLevel = Math.max(1, this.parsedLevels().length || 10);
    return Math.max(1, Math.min(maxLevel, Math.round(levelNumber)));
  }

  private clampEditorTestDriveStartY(startY: number): number {
    return Math.max(0, Math.round(startY));
  }

  setEditorTestDriveLevelNumber(rawValue: string): void {
    const trimmed = rawValue.trim();
    if (trimmed === '') {
      this.editorTestDriveLevelNumberOverride.set(null);
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) {
      return;
    }
    this.editorTestDriveLevelNumberOverride.set(this.clampEditorTestDriveLevelNumber(parsed));
  }

  setEditorTestDriveLevelEnabled(enabled: boolean): void {
    this.editorTestDriveLevelEnabled.set(enabled);
  }

  setEditorTestDriveUseStartY(enabled: boolean): void {
    this.editorTestDriveUseStartY.set(enabled);
  }

  setEditorTestDriveStartY(rawValue: string): void {
    const trimmed = rawValue.trim();
    const parsed = trimmed === '' ? 500 : Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) {
      return;
    }
    this.editorTestDriveStartY.set(this.clampEditorTestDriveStartY(parsed));
  }

  setEditorTestDriveUseObjectGroupStartY(enabled: boolean): void {
    this.editorTestDriveUseObjectGroupStartY.set(enabled);
  }

  setEditorTestDriveObjectGroupStartY(rawValue: string): void {
    const trimmed = rawValue.trim();
    const parsed = trimmed === '' ? 500 : Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) {
      return;
    }
    this.editorTestDriveObjectGroupStartY.set(this.clampEditorTestDriveStartY(parsed));
  }

  toggleEditorTestDriveForcedAddon(mask: number, checked: boolean): void {
    this.editorTestDriveForcedAddOns.set(
      checked
        ? this.editorTestDriveForcedAddOns() | mask
        : this.editorTestDriveForcedAddOns() & ~mask,
    );
  }

  toggleEditorTestDriveDisabledBonusRoll(mask: number, checked: boolean): void {
    this.editorTestDriveDisabledBonusRollMask.set(
      checked
        ? this.editorTestDriveDisabledBonusRollMask() | mask
        : this.editorTestDriveDisabledBonusRollMask() & ~mask,
    );
  }

  async setCustomOptionsPreset(preset: CustomOptionsPresetId): Promise<void> {
    this.customOptionsPreset.set(preset);
    if (preset === 'manual') return;
    await this.setCustomResourcesPreset(preset === 'default' ? 'default' : 'terminator', false);
    this.setCustomSettingsPreset(preset === 'default' ? 'default' : 'terminator', false);
    this.customOptionsPreset.set(preset);
  }

  async setCustomResourcesPreset(
    preset: CustomResourcesPresetId,
    updateOptionsPreset = true,
  ): Promise<void> {
    const load = this.runtime.applyCustomResourcesPreset(preset);
    this.customResourcesPresetLoad = load;
    try {
      await load;
      if (updateOptionsPreset) {
        this.syncCustomOptionsPreset();
      }
    } finally {
      if (this.customResourcesPresetLoad === load) {
        this.customResourcesPresetLoad = null;
      }
    }
  }

  setCustomSettingsPreset(
    preset: CustomSettingsPresetId,
    updateOptionsPreset = true,
  ): void {
    this.customSettingsPreset.set(preset);
    switch (preset) {
      case 'default':
        this.editorTestDriveUseStartY.set(false);
        this.editorTestDriveStartY.set(500);
        this.editorTestDriveUseObjectGroupStartY.set(false);
        this.editorTestDriveObjectGroupStartY.set(500);
        this.editorTestDriveForcedAddOns.set(0);
        this.editorTestDriveDisabledBonusRollMask.set(0);
        break;
      case 'terminator':
        this.editorTestDriveUseStartY.set(false);
        this.editorTestDriveStartY.set(500);
        this.editorTestDriveUseObjectGroupStartY.set(false);
        this.editorTestDriveObjectGroupStartY.set(500);
        this.editorTestDriveForcedAddOns.set(0);
        this.editorTestDriveDisabledBonusRollMask.set(BONUS_ROLL_COP);
        break;
      case 'manual':
        break;
    }
    if (updateOptionsPreset) {
      this.syncCustomOptionsPreset();
    }
  }

  private syncCustomOptionsPreset(): void {
    if (
      this.customResourcesPreset() === 'default' &&
      this.customSettingsPreset() === 'default'
    ) {
      this.customOptionsPreset.set('default');
      return;
    }
    if (
      this.customResourcesPreset() === 'terminator' &&
      this.customSettingsPreset() === 'terminator'
    ) {
      this.customOptionsPreset.set('terminator');
      return;
    }
    this.customOptionsPreset.set('manual');
  }

  onPropsInput(field: keyof import('./level-editor.service').LevelProperties, event: Event): void {
    onPropsInput(this, field, event);
  }

  onRoadInfoChange(roadInfo: number): void {
    onRoadInfoChange(this, roadInfo);
  }

  selectRoadInfo(roadInfo: number): void {
    selectRoadInfo(this, roadInfo);
  }

  createRoadInfo(): Promise<void> {
    return createRoadInfo(this);
  }

  deleteRoadInfo(roadInfoId: number | null = this.selectedRoadInfoId()): Promise<void> {
    return deleteRoadInfo(this, roadInfoId);
  }

  onRoadInfoInput(field: Exclude<keyof RoadInfoData, 'id'>, value: number | boolean): void {
    onRoadInfoInput(this, field, value);
  }

  onRoadTexturePick(field: import('./app-level').RoadTextureField, value: number): void {
    onRoadTexturePick(this, field, value);
  }

  onTimeLimitChange(value: number): void {
    onTimeLimitChange(this, value);
  }

  onPropertiesTabInput(e: {
    field: keyof import('./level-editor.service').LevelProperties;
    event: Event;
  }): void {
    onPropertiesTabInput(this, e);
  }

  onObjGroupInput(index: number, field: 'resID' | 'numObjs', value: number): void {
    onObjGroupInput(this, index, field, value);
  }

  _captureUndoSnapshot(kind: EditorUndoKind): EditorUndoSnapshot {
    return captureUndoSnapshot(this, kind);
  }

  _applyUndoSnapshot(snapshot: EditorUndoSnapshot): void {
    applyUndoSnapshot(this, snapshot);
  }

  _pushUndo(kind: EditorUndoKind): void {
    pushUndo(this, kind);
  }

  _resetObjectHistory(): void {
    resetObjectHistory(this);
  }

  undo(): void {
    undo(this);
  }

  redo(): void {
    redo(this);
  }

  readonly getRoadReferenceLevelNums = (roadInfoId: number): number[] =>
    lookupRoadReferenceLevelNums(this, roadInfoId);

  readonly getTileReferenceRoadInfoIds = (texId: number): number[] =>
    lookupTileReferenceRoadInfoIds(this, texId);

  syncSelectedRoadInfoSelection(preferredId?: number | null): void {
    syncSelectedRoadInfoSelection(this, preferredId ?? this.selectedRoadInfoId());
  }

  refreshRoadInfoDerivedState(): void {
    refreshRoadInfoDerivedState(this);
  }

  queueRoadInfoSync(syncPromises: Promise<unknown>[]): void {
    queueRoadInfoSync(this, syncPromises);
  }

  queuePackSync(syncPromises: Promise<unknown>[]): void {
    queuePackSync(this, syncPromises);
  }

  markPropertiesDirty(): void {
    markPropertiesDirty(this);
  }

  scheduleObjectGroupsAutoSave(): void {
    scheduleObjectGroupsAutoSave(this);
  }

  markObjectGroupsDirty(): void {
    markObjectGroupsDirty(this);
  }

  saveLevelProperties(): Promise<void> {
    return saveLevelProperties(this);
  }

  looksLikeHtml(bytes: Uint8Array): boolean {
    return (
      bytes.length > 0 && /<html|<!doctype html/i.test(new TextDecoder().decode(bytes.slice(0, 32)))
    );
  }

  cloneObjectGroupDefinitions(groups = this.objectGroupDefinitions()): ObjectGroupDefinition[] {
    return cloneObjectGroupDefinitions(this, groups);
  }

  nextObjectGroupId(groups = this.objectGroupDefinitions()): number {
    return nextObjectGroupId(this, groups);
  }

  defaultObjectGroupEntry(): ObjectGroupEntryData {
    return defaultObjectGroupEntry(this);
  }

  selectedObjectGroup(): ObjectGroupDefinition | null {
    return selectedObjectGroup(this);
  }

  selectObjectGroup(groupId: number): void {
    selectObjectGroup(this, groupId);
  }

  addObjectGroup(duplicateSelected = false): void {
    addObjectGroup(this, duplicateSelected);
  }

  deleteObjectGroup(groupId: number): void {
    deleteObjectGroup(this, groupId);
  }

  addObjectGroupEntry(groupId: number): void {
    addObjectGroupEntry(this, groupId);
  }

  deleteObjectGroupEntry(groupId: number, entryIndex: number): void {
    deleteObjectGroupEntry(this, groupId, entryIndex);
  }

  onObjectGroupEntryInput(
    groupId: number,
    entryIndex: number,
    field: keyof ObjectGroupEntryData,
    value: number,
  ): void {
    onObjectGroupEntryInput(this, groupId, entryIndex, field, value);
  }

  saveObjectGroups(): Promise<void> {
    return saveObjectGroups(this);
  }

  cloneObjectTypeDefinitions(defs = this.objectTypeDefinitions()): ObjectTypeDefinition[] {
    return cloneObjectTypeDefinitions(this, defs);
  }

  syncObjectTypeLookup(defs = this.objectTypeDefinitions()): void {
    syncObjectTypeLookup(this, defs);
  }

  nextObjectTypeId(defs = this.objectTypeDefinitions()): number {
    return nextObjectTypeId(this, defs);
  }

  selectedObjectType(): ObjectTypeDefinition | null {
    return selectedObjectType(this);
  }

  scheduleObjectTypesAutoSave(): void {
    scheduleObjectTypesAutoSave(this);
  }

  markObjectTypesDirty(defs: ObjectTypeDefinition[]): void {
    markObjectTypesDirty(this, defs);
  }

  defaultObjectTypeDefinition(
    typeRes: number,
    source?: ObjectTypeDefinition | null,
  ): ObjectTypeDefinition {
    return defaultObjectTypeDefinition(this, typeRes, source);
  }

  selectObjectType(typeRes: number): void {
    selectObjectType(this, typeRes);
  }

  addObjectType(duplicateSelected = false): void {
    addObjectType(this, duplicateSelected);
  }

  deleteObjectType(typeRes: number): void {
    deleteObjectType(this, typeRes);
  }

  onObjectTypeFieldInput(
    typeRes: number,
    field: Exclude<keyof ObjectTypeDefinition, 'typeRes'>,
    value: number,
  ): void {
    if (field === 'numFrames') {
      console.log('[Frame Count] app.onObjectTypeFieldInput', { typeRes, field, value });
    }
    onObjectTypeFieldInput(this, typeRes, field, value);
  }

  onObjectTypeReferenceChange(
    typeRes: number,
    field: 'deathObj' | 'creationSound' | 'otherSound' | 'weaponObj',
    value: number,
  ): void {
    onObjectTypeReferenceChange(this, typeRes, field, value);
  }

  onObjectTypeFlagToggle(
    typeRes: number,
    field: 'flags' | 'flags2',
    bit: number,
    checked: boolean,
  ): void {
    onObjectTypeFlagToggle(this, typeRes, field, bit, checked);
  }

  onObjectTypeFrameChange(typeRes: number, frame: number): void {
    onObjectTypeFrameChange(this, typeRes, frame);
  }

  saveObjectTypes(): Promise<void> {
    return saveObjectTypes(this);
  }

  selectObject(index: number, centerCanvas = false): void {
    selectObject(this, index, centerCanvas);
  }

  onObjDirDegInput(value: string): void {
    onObjDirDegInput(this, value);
  }

  onObjTypeResChange(typeRes: number): void {
    onObjTypeResChange(this, typeRes);
  }

  applyObjEdit(): void {
    applyObjEdit(this);
  }

  addObject(): void {
    addObject(this);
  }

  duplicateSelectedObject(): void {
    duplicateSelectedObject(this);
  }

  toggleTypeVisibility(typeId: number): void {
    toggleTypeVisibility(this, typeId);
  }

  showAllObjectTypes(): void {
    showAllObjectTypes(this);
  }

  hideAllObjectTypes(): void {
    hideAllObjectTypes(this);
  }

  readonly getObjTypeDimensionLabel = (typeRes: number): string =>
    getObjectTypeDimensionLabel(this, typeRes);

  removeSelectedObject(): void {
    removeSelectedObject(this);
  }

  saveLevelObjects(): Promise<void> {
    return saveLevelObjects(this);
  }

  saveTrack(): Promise<void> {
    return saveTrack(this);
  }

  worldToCanvas(wx: number, wy: number): [number, number] {
    return worldToCanvas(this, wx, wy);
  }

  canvasToWorld(cx: number, cy: number): [number, number] {
    return canvasToWorld(this, cx, cy);
  }

  onCanvasMouseDown(event: MouseEvent): void {
    onCanvasMouseDown(this, event);
  }

  onCanvasMouseMove(event: MouseEvent): void {
    onCanvasMouseMove(this, event);
  }

  onCanvasMouseUp(): void {
    onCanvasMouseUp(this);
  }

  onCanvasDoubleClick(event: MouseEvent): void {
    onCanvasDoubleClick(this, event);
  }

  onCanvasContextMenu(event: MouseEvent): void {
    onCanvasContextMenu(this, event);
  }

  _insertWaypointAfter(track: 'up' | 'down', segIdx: number): void {
    insertWaypointAfter(this, track, segIdx);
  }

  onCanvasKeyDown(event: KeyboardEvent): void {
    onCanvasKeyDown(this, event);
  }

  onCanvasKeyUp(event: KeyboardEvent): void {
    onCanvasKeyUp(this, event);
  }

  onCanvasWheel(event: WheelEvent): void {
    onCanvasWheel(this, event);
  }

  zoomIn(): void {
    this.canvasZoom.set(Math.min(10, this.canvasZoom() + 0.25));
  }

  zoomOut(): void {
    this.canvasZoom.set(Math.max(0.1, this.canvasZoom() - 0.25));
  }

  resetView(): void {
    resetView(this);
  }

  frameAllObjects(): void {
    frameAllObjects(this);
  }

  centerOnSelectedObject(): void {
    centerOnSelectedObject(this);
  }

  redrawObjectCanvas(): void {
    redrawObjectCanvas(this);
  }

  addMark(): void {
    addMark(this);
  }

  startMarkCreateMode(): void {
    startMarkCreateMode(this);
  }

  confirmMarkCreateMode(): void {
    confirmMarkCreateMode(this);
  }

  generateSideRoadMarks(
    roadSelection: import('./road-marking-utils').MarkingRoadSelection,
    yStart: number,
    yEnd: number,
    inset: number,
    yFrequency: number,
  ): void {
    generateSideRoadMarks(this, roadSelection, yStart, yEnd, inset, yFrequency);
  }

  generateCentreRoadMarks(
    roadSelection: import('./road-marking-utils').MarkingRoadSelection,
    yStart: number,
    yEnd: number,
    dashLength: number,
    gapLength: number,
  ): void {
    generateCentreRoadMarks(this, roadSelection, yStart, yEnd, dashLength, gapLength);
  }

  previewSideRoadMarks(
    roadSelection: import('./road-marking-utils').MarkingRoadSelection,
    yStart: number,
    yEnd: number,
    inset: number,
    yFrequency: number,
  ): void {
    previewSideRoadMarks(this, roadSelection, yStart, yEnd, inset, yFrequency);
  }

  previewCentreRoadMarks(
    roadSelection: import('./road-marking-utils').MarkingRoadSelection,
    yStart: number,
    yEnd: number,
    dashLength: number,
    gapLength: number,
  ): void {
    previewCentreRoadMarks(this, roadSelection, yStart, yEnd, dashLength, gapLength);
  }

  setMarkingRangePreview(yStart: number, yEnd: number): void {
    setMarkingRangePreview(this, yStart, yEnd);
  }

  setObjectGroupRangePreview(range: { yStart: number; yEnd: number } | null): void {
    if (range === null) {
      this.objectGroupRangePreview.set(null);
      return;
    }
    const { yStart, yEnd } = range;
    this.objectGroupRangePreview.set(
      yStart <= yEnd ? { yStart, yEnd } : { yStart: yEnd, yEnd: yStart },
    );
  }

  setObjectGroupSpawnPreview(objects: ObjectGroupSpawnPreviewObject[]): void {
    this.objectGroupSpawnPreviewObjects.set(objects);
  }

  clearMarkingPreviews(): void {
    clearMarkingPreviews(this);
  }

  removeMarksByYRange(yStart: number, yEnd: number): void {
    removeMarksByYRange(this, yStart, yEnd);
  }

  removeSelectedMark(): void {
    removeSelectedMark(this);
  }

  _addMarkCreatePoint(x: number, y: number): void {
    addMarkCreatePoint(this, x, y);
  }

  _hasColocatedNubs(): boolean {
    return hasColocatedNubs(this);
  }

  _splitCollocatedMarkNubs(): void {
    splitCollocatedMarkNubs(this);
  }

  _joinAdjacentMarkNubs(): void {
    joinAdjacentMarkNubs(this);
  }

  onMarkFieldInput(markIdx: number, field: 'x1' | 'y1' | 'x2' | 'y2', value: number): void {
    onMarkFieldInput(this, markIdx, field, value);
  }

  saveMarks(): Promise<void> {
    return saveMarks(this);
  }

  scheduleMarkAutoSave(): void {
    scheduleMarkAutoSave(this);
  }

  _handleCurveDrawClick(wx: number, wy: number): void {
    handleCurveDrawClick(this, wx, wy);
  }

  _updateCurvePreview(wx: number, wy: number): void {
    updateCurvePreview(this, wx, wy);
  }

  _applyBarrierDrawPath(): void {
    applyBarrierDrawPath(this);
  }

  redrawMarkCanvas(): void {
    redrawMarkCanvas(this);
  }

  onMarkCanvasMouseDown(event: MouseEvent): void {
    onMarkCanvasMouseDown(this, event);
  }

  onMarkCanvasMouseMove(event: MouseEvent): void {
    onMarkCanvasMouseMove(this, event);
  }

  onMarkCanvasMouseUp(): void {
    onMarkCanvasMouseUp(this);
  }

  selectSprite(spriteId: number): Promise<void> {
    return selectSprite(this, spriteId);
  }

  redrawSpriteCanvas(): void {
    redrawSpriteCanvas(this);
  }

  exportSpritePng(): void {
    exportSpritePng(this);
  }

  readonly getSpriteFormatLabel = getSpriteFormatLabel;

  openSpriteEditor(frameId: number): void {
    openSpriteEditor(this, frameId);
  }

  onSpritePngUpload(event: Event, frameId: number): Promise<void> {
    return onSpritePngUpload(this, event, frameId);
  }

  addSpriteFrame(): Promise<void> {
    return addSpriteFrame(this);
  }

  onSpriteEditorSaved(event: { frameId: number; pixels: Uint8ClampedArray }): Promise<void> {
    return onSpriteEditorSaved(this, event);
  }
}
