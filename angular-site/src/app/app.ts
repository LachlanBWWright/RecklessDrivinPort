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
  LevelProperties,
} from './level-editor.service';
import {
  applyLevelsResult,
  onObjGroupInput,
  onPropsInput,
  onRoadInfoChange,
  onRoadInfoInput,
  onRoadTexturePick,
  onTimeLimitChange,
  resetViewToRoad,
  selectLevel,
  selectRoadInfo,
  type RoadTextureField,
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
import { beginFinishLineDrag, beginStartMarkerDrag, handleTrackContextMenuAtWorld } from './app-runtime-track';
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
  confirmMarkCreateMode,
  generateCentreRoadMarks,
  generateSideRoadMarks,
  handleCurveDrawClick,
  hasColocatedNubs,
  joinAdjacentMarkNubs,
  onMarkFieldInput,
  previewCentreRoadMarks,
  previewSideRoadMarks,
  removeSelectedMark,
  saveMarks,
  scheduleMarkAutoSave,
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
  standalone: false,
  styleUrl: './app.scss',
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

  readonly getPackSpriteDataUrl = (frameId: number): string | null => getPackSpriteDataUrl(this, frameId);

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

  readonly getObjFallbackColor = (typeRes: number): string => getObjFallbackColor(typeRes, OBJ_PALETTE);

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

  readonly selectLevel = (id: number, options?: { preserveView?: boolean }): void => selectLevel(this, id, options);

  readonly resetViewToRoad = (level: ParsedLevel): void => resetViewToRoad(this, level);

  readonly onPropsInput = (field: keyof LevelProperties, value: number): void => onPropsInput(this, field, value);

  readonly onRoadInfoChange = (roadInfo: number): void => onRoadInfoChange(this, roadInfo);

  readonly selectRoadInfo = (roadInfo: number): void => selectRoadInfo(this, roadInfo);

  readonly createRoadInfo = (): Promise<void> => createRoadInfo(this);

  deleteRoadInfo(roadInfoId: number | null = this.selectedRoadInfoId()): Promise<void> {
    return deleteRoadInfo(this, roadInfoId);
  }

  readonly onRoadInfoInput = (field: Exclude<keyof RoadInfoData, 'id'>, value: number | boolean): void => onRoadInfoInput(this, field, value);

  readonly onRoadTexturePick = (field: RoadTextureField, value: number): void => onRoadTexturePick(this, field, value);

  readonly onTimeLimitChange = (value: number): void => onTimeLimitChange(this, value);

  readonly onObjGroupInput = (index: number, field: 'resID' | 'numObjs', value: number): void => onObjGroupInput(this, index, field, value);

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

  readonly undo = (): void => undo(this);

  readonly redo = (): void => redo(this);

  readonly getRoadReferenceLevelNums = (roadInfoId: number): number[] =>
    lookupRoadReferenceLevelNums(this, roadInfoId);

  readonly getTileReferenceRoadInfoIds = (texId: number): number[] =>
    lookupTileReferenceRoadInfoIds(this, texId);

  readonly syncSelectedRoadInfoSelection = (preferredId?: number | null): void => syncSelectedRoadInfoSelection(this, preferredId ?? this.selectedRoadInfoId());

  readonly refreshRoadInfoDerivedState = (): void => refreshRoadInfoDerivedState(this);

  readonly queueRoadInfoSync = (syncPromises: Promise<unknown>[]): void => queueRoadInfoSync(this, syncPromises);

  readonly queuePackSync = (syncPromises: Promise<unknown>[]): void => queuePackSync(this, syncPromises);

  readonly markPropertiesDirty = (): void => markPropertiesDirty(this);

  readonly scheduleObjectGroupsAutoSave = (): void => scheduleObjectGroupsAutoSave(this);

  readonly markObjectGroupsDirty = (): void => markObjectGroupsDirty(this);

  readonly saveLevelProperties = (): Promise<void> => saveLevelProperties(this);

  looksLikeHtml(bytes: Uint8Array): boolean {
    return bytes.length > 0 && /<html|<!doctype html/i.test(new TextDecoder().decode(bytes.slice(0, 32)));
  }

  cloneObjectGroupDefinitions(groups = this.objectGroupDefinitions()): ObjectGroupDefinition[] {
    return cloneObjectGroupDefinitions(this, groups);
  }

  nextObjectGroupId(groups = this.objectGroupDefinitions()): number {
    return nextObjectGroupId(this, groups);
  }

  readonly defaultObjectGroupEntry = (): ObjectGroupEntryData => defaultObjectGroupEntry(this);

  readonly selectedObjectGroup = (): ObjectGroupDefinition | null => selectedObjectGroup(this);

  readonly selectObjectGroup = (groupId: number): void => selectObjectGroup(this, groupId);

  readonly addObjectGroup = (duplicateSelected = false): void => addObjectGroup(this, duplicateSelected);

  readonly deleteObjectGroup = (groupId: number): void => deleteObjectGroup(this, groupId);

  readonly addObjectGroupEntry = (groupId: number): void => addObjectGroupEntry(this, groupId);

  readonly deleteObjectGroupEntry = (groupId: number, entryIndex: number): void => deleteObjectGroupEntry(this, groupId, entryIndex);

  onObjectGroupEntryInput(
    groupId: number,
    entryIndex: number,
    field: keyof ObjectGroupEntryData,
    value: number,
  ): void {
    onObjectGroupEntryInput(this, groupId, entryIndex, field, value);
  }

  readonly saveObjectGroups = (): Promise<void> => saveObjectGroups(this);

  cloneObjectTypeDefinitions(defs = this.objectTypeDefinitions()): ObjectTypeDefinition[] {
    return cloneObjectTypeDefinitions(this, defs);
  }

  syncObjectTypeLookup(defs = this.objectTypeDefinitions()): void {
    syncObjectTypeLookup(this, defs);
  }

  nextObjectTypeId(defs = this.objectTypeDefinitions()): number {
    return nextObjectTypeId(this, defs);
  }

  readonly selectedObjectType = (): ObjectTypeDefinition | null => selectedObjectType(this);

  readonly scheduleObjectTypesAutoSave = (): void => scheduleObjectTypesAutoSave(this);

  readonly markObjectTypesDirty = (defs: ObjectTypeDefinition[]): void => markObjectTypesDirty(this, defs);

  readonly defaultObjectTypeDefinition = (typeRes: number, source?: ObjectTypeDefinition | null): ObjectTypeDefinition => defaultObjectTypeDefinition(this, typeRes, source);

  readonly selectObjectType = (typeRes: number): void => selectObjectType(this, typeRes);

  readonly addObjectType = (duplicateSelected = false): void => addObjectType(this, duplicateSelected);

  readonly deleteObjectType = (typeRes: number): void => deleteObjectType(this, typeRes);

  onObjectTypeFieldInput(
    typeRes: number,
    field: Exclude<keyof ObjectTypeDefinition, 'typeRes'>,
    value: number,
  ): void {
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

  readonly onObjectTypeFrameChange = (typeRes: number, frame: number): void => onObjectTypeFrameChange(this, typeRes, frame);

  readonly saveObjectTypes = (): Promise<void> => saveObjectTypes(this);

  readonly selectObject = (index: number, centerCanvas = false): void => selectObject(this, index, centerCanvas);

  readonly onObjDirDegInput = (value: string): void => onObjDirDegInput(this, value);

  readonly onObjTypeResChange = (typeRes: number): void => onObjTypeResChange(this, typeRes);

  readonly applyObjEdit = (): void => applyObjEdit(this);

  readonly addObject = (): void => addObject(this);

  readonly duplicateSelectedObject = (): void => duplicateSelectedObject(this);

  readonly toggleTypeVisibility = (typeId: number): void => toggleTypeVisibility(this, typeId);

  readonly showAllObjectTypes = (): void => showAllObjectTypes(this);

  readonly hideAllObjectTypes = (): void => hideAllObjectTypes(this);

  readonly getObjTypeDimensionLabel = (typeRes: number): string =>
    getObjectTypeDimensionLabel(this, typeRes);

  readonly removeSelectedObject = (): void => removeSelectedObject(this);

  readonly saveLevelObjects = (): Promise<void> => saveLevelObjects(this);

  readonly saveTrack = (): Promise<void> => saveTrack(this);

  readonly worldToCanvas = (wx: number, wy: number): [number, number] => worldToCanvas(this, wx, wy);

  canvasToWorld = (cx: number, cy: number): [number, number] => canvasToWorld(this, cx, cy);

  readonly onCanvasMouseDown = (event: MouseEvent): void => onCanvasMouseDown(this, event);

  readonly onCanvasMouseMove = (event: MouseEvent): void => onCanvasMouseMove(this, event);

  readonly onCanvasMouseUp = (): void => onCanvasMouseUp(this);

  readonly onCanvasDoubleClick = (event: MouseEvent): void => onCanvasDoubleClick(this, event);

  readonly onCanvasContextMenu = (event: MouseEvent): void => onCanvasContextMenu(this, event);

  _insertWaypointAfter(track: 'up' | 'down', segIdx: number): void {
    insertWaypointAfter(this, track, segIdx);
  }

  readonly onCanvasKeyDown = (event: KeyboardEvent): void => onCanvasKeyDown(this, event);

  readonly onCanvasKeyUp = (event: KeyboardEvent): void => onCanvasKeyUp(this, event);

  readonly onCanvasWheel = (event: WheelEvent): void => onCanvasWheel(this, event);

  zoomIn(): void {
    this.canvasZoom.set(Math.min(10, this.canvasZoom() + 0.25));
  }

  zoomOut(): void {
    this.canvasZoom.set(Math.max(0.1, this.canvasZoom() - 0.25));
  }

  readonly resetView = (): void => resetView(this);

  readonly frameAllObjects = (): void => frameAllObjects(this);

  readonly centerOnSelectedObject = (): void => centerOnSelectedObject(this);

  readonly redrawObjectCanvas = (): void => redrawObjectCanvas(this);

  readonly addMark = (): void => addMark(this);

  readonly startMarkCreateMode = (): void => startMarkCreateMode(this);

  readonly confirmMarkCreateMode = (): void => confirmMarkCreateMode(this);

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

  readonly removeSelectedMark = (): void => removeSelectedMark(this);

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

  readonly onMarkFieldInput = (markIdx: number, field: 'x1' | 'y1' | 'x2' | 'y2', value: number): void => onMarkFieldInput(this, markIdx, field, value);

  readonly saveMarks = (): Promise<void> => saveMarks(this);

  readonly scheduleMarkAutoSave = (): void => scheduleMarkAutoSave(this);

  _handleCurveDrawClick(wx: number, wy: number): void {
    handleCurveDrawClick(this, wx, wy);
  }

  _updateCurvePreview(wx: number, wy: number): void {
    updateCurvePreview(this, wx, wy);
  }

  _applyBarrierDrawPath(): void {
    applyBarrierDrawPath(this);
  }

  readonly redrawMarkCanvas = (): void => redrawMarkCanvas(this);

  readonly onMarkCanvasMouseDown = (event: MouseEvent): void => onMarkCanvasMouseDown(this, event);

  readonly onMarkCanvasMouseMove = (event: MouseEvent): void => onMarkCanvasMouseMove(this, event);

  readonly onMarkCanvasMouseUp = (): void => onMarkCanvasMouseUp(this);

  readonly selectSprite = (spriteId: number): Promise<void> => selectSprite(this, spriteId);

  readonly redrawSpriteCanvas = (): void => redrawSpriteCanvas(this);

  readonly exportSpritePng = (): void => exportSpritePng(this);

  readonly getSpriteFormatLabel = getSpriteFormatLabel;

  readonly openSpriteEditor = (frameId: number): void => openSpriteEditor(this, frameId);

  readonly onSpritePngUpload = (file: File | null, frameId: number): Promise<void> => onSpritePngUpload(this, file, frameId);

  readonly addSpriteFrame = (): Promise<void> => addSpriteFrame(this);

  readonly onSpriteEditorSaved = (event: { frameId: number; pixels: Uint8ClampedArray }): Promise<void> => onSpriteEditorSaved(this, event);
}
