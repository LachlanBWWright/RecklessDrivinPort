import {
  Component,
  inject,
  computed,
  OnDestroy,
  OnInit,
  AfterViewInit,
  ChangeDetectionStrategy,
  ViewEncapsulation,
} from '@angular/core';
import { AppStateResources } from './app-state-resources';
import * as actions from './app-actions';
import type { EditorUndoKind, EditorUndoSnapshot } from './app-history';
import type {
  ParsedLevel,
  ObjectGroupEntryData,
  ObjectTypeDefinition,
  RoadInfoData,
  ObjectGroupDefinition,
  ObjectGroupSpawnPreviewObject,
} from './level-editor.service';
import { createMediaActions } from './app-media-actions';
import { createRuntimeActions } from './app-runtime-actions';
import {
  launchSelectedLevelPreview as runSelectedLevelPreview,
  setCustomOptionsPreset as applyCustomOptionsPreset,
  setCustomResourcesPreset as applyCustomResourcesPreset,
  setCustomSettingsPreset as applyCustomSettingsPreset,
} from './app-customisation-actions';
import {
  setLevelNumber,
  setLevelEnabled,
  setUseStartY,
  setStartY,
  setUseObjectGroupStartY,
  setObjectGroupStartY,
  toggleForcedAddon,
  toggleDisabledBonusRoll,
} from './app-test-drive-actions';
import type {
  CustomOptionsPresetId,
  CustomResourcesPresetId,
  CustomSettingsPresetId,
} from './game/game-customisation-presets';
import { exportLuaProject, importLuaProject } from './lua-project';
import { SCRIPT_FORMAT_VERSION } from './script-format';
import { MatDialog } from '@angular/material/dialog';
import type { LuaScriptEditorDialogData, LuaScriptEditorDialogResult, LuaScriptEditorChange } from './editor/lua-script-editor-dialog.component';
import type { LuaProjectInput } from './lua-project';
import { validateLuaWorkspace } from './lua-workspace';

const {
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
  createScriptForObjectType,
  createScriptForLevel,
  saveObjectGroups,
  saveObjectTypes,
  scheduleObjectTypesAutoSave,
  selectObjectGroup,
  selectObjectType,
  selectedObjectGroup,
  selectedObjectType,
  scriptBindingForObjectType,
  levelScriptBindingForLevel,
  setObjectTypeScriptBinding,
  setLevelScriptBinding,
  syncObjectTypeLookup,
  updateScriptName,
  updateScriptSource,
  updateScript,
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
  OBJ_PALETTE,
  beginFinishLineDrag,
  beginStartMarkerDrag,
  handleTrackContextMenuAtWorld,
  getPackSpriteDataUrl,
  getRoadInfoPreviewDataUrl,
  getTileDataUrl,
  lookupTileDimensions,
  getCanvasDataUrl,
  getKeyedCanvasDataUrl,
  getObjFallbackColor,
  applyUndoSnapshot,
  captureUndoSnapshot,
  pushUndo,
  redo,
  resetObjectHistory,
  undo,
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
  onMarkCanvasMouseDown,
  onMarkCanvasMouseMove,
  onMarkCanvasMouseUp,
  redrawMarkCanvas,
  addSpriteFrame,
  exportSpritePng,
  getSpriteFormatLabel,
  openSpriteEditor,
  onSpriteEditorSaved,
  onSpritePngUpload,
  redrawSpriteCanvas,
  selectSprite,
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
} = actions;

function getEditorRoadMaxY(app: App): number {
  const roadCount = app.selectedLevel()?.roadSegs.length ?? 0;
  return roadCount > 0 ? (roadCount - 1) * 2 : 0;
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
    actions.setupAppLifecycle(this);
  }
  readonly media = createMediaActions(this);
  readonly runtime = createRuntimeActions(this);
  exportLuaProject = (): void => {
    const scripts = this.scriptDefinitions() ?? [];
    const bindings = this.scriptBindings() ?? [];
    const levelBindings = this.levelScriptBindings() ?? [];
    const encoder = new TextEncoder();
    const sourceBytes = scripts.map((script) => encoder.encode(script.source).byteLength);
    if (scripts.length > 256 || scripts.some((script, index) => script.id < 0 || script.id > 32767 ||
      encoder.encode(script.name).byteLength > 4096 || (sourceBytes[index] ?? 0) > 2 * 1024 * 1024) ||
      sourceBytes.reduce((total, size) => total + size, 0) > 15 * 1024 * 1024) {
      this.snackBar.open('Lua project exceeds a supported script count, ID, name, or size limit.', 'OK', { duration: 6000 });
      return;
    }
    const bytes = exportLuaProject({
      scripts,
      scriptBindings: bindings,
      levelScriptBindings: levelBindings,
      objectTypeIds: this.objectTypeDefinitions().map((type) => type.typeRes),
      soundIds: this.audioEntries().map((sound) => sound.id),
      selectedLevelResourceId: this.selectedLevelId(),
      resourceSourceName: this.resourcesStatus(),
    });
    if (bytes.byteLength > 16 * 1024 * 1024) {
      this.snackBar.open('Exported Lua project exceeds the 16 MiB project limit.', 'OK', { duration: 6000 });
      return;
    }
    const downloadBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(downloadBuffer).set(bytes);
    const url = URL.createObjectURL(new Blob([downloadBuffer], { type: 'application/zip' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'reckless-drivin-lua-project.zip';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    this.snackBar.open('Lua project exported for external IDE editing.', 'OK', { duration: 3500 });
  };
  importLuaProject = (event: Event): void => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const file = input?.files?.[0];
    if (input) input.value = '';
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      this.snackBar.open('Lua project ZIP exceeds the 16 MiB import limit.', 'OK', { duration: 5000 });
      return;
    }
    void file.arrayBuffer().then((buffer) => {
      const result = importLuaProject(new Uint8Array(buffer), { allowInvalidLua: true });
      result.match(
        (project) => this.openLuaEditor(project),
        (error) => this.snackBar.open(error, 'OK', { duration: 5000 }),
      );
    }).catch(() => this.snackBar.open('Could not read the selected Lua project file.', 'OK', { duration: 5000 }));
  };
  private readonly luaDialog = inject(MatDialog);
  readonly luaLevelResourceIds = computed(() => this.parsedLevels().map((level) => level.resourceId));

  async openLuaEditor(initialProject?: LuaProjectInput): Promise<void> {
    const { LuaScriptEditorDialogComponent } = await import('./editor/lua-script-editor-dialog.component');
    const scripts = this.scriptDefinitions() ?? [];
    const script = scripts[0] ?? { id: 1, version: SCRIPT_FORMAT_VERSION, name: 'New script', source: 'function onLevelTick(ctx, dt)\n  \nend\n' };
    const dialog = this.luaDialog.open<InstanceType<typeof LuaScriptEditorDialogComponent>, LuaScriptEditorDialogData, LuaScriptEditorDialogResult>(LuaScriptEditorDialogComponent, {
      width: 'min(1680px, calc(100vw - 16px))', height: 'min(980px, calc(100vh - 16px))', maxWidth: '100vw', maxHeight: '100vh', disableClose: true,
      data: { script, scripts, scriptBindings: this.scriptBindings() ?? [], levelScriptBindings: this.levelScriptBindings() ?? [],
        levelResourceIds: this.luaLevelResourceIds(), objectTypeId: 0, objectTypes: this.objectTypeDefinitions(),
        spriteFrames: this.packSpriteFrames(), audioEntries: this.audioEntries(), issues: this.scriptValidationIssues() ?? [],
        resourceSourceName: this.resourcesStatus(), selectedLevelResourceId: this.selectedLevelId(), initialProject },
    });
    dialog.afterClosed().subscribe((result) => { if (result) this.applyLuaEditorResult(result); });
  }

  applyLuaEditorResult(result: LuaScriptEditorChange): void {
    if (result.workspace) {
      const workspace = { ...result.workspace, objectTypeIds: this.objectTypeDefinitions().map((type) => type.typeRes), soundIds: this.audioEntries().map((sound) => sound.id) };
      const error = validateLuaWorkspace(workspace).find((issue) => issue.severity === 'error');
      if (error) { this.snackBar.open(`Lua changes could not be applied: ${error.message}`, 'OK', { duration: 6000 }); return; }
      actions.replaceLuaProjectScripts(this, [...workspace.scripts], [...workspace.scriptBindings], [...workspace.levelScriptBindings]);
    } else updateScript(this, result.scriptId, result.name, result.source);
    if (result.testDriveLevelId !== undefined && this.parsedLevels().some((level) => level.resourceId === result.testDriveLevelId)) {
      void runSelectedLevelPreview(this, result.testDriveLevelId, false);
    }
  }

  readonly formatTime = actions.formatTime;
  readonly SECTION_ORDER = actions.SECTION_ORDER;
  ngOnInit(): void {
    actions.onInit(this);
  }

  ngAfterViewInit(): void {
    actions.onAfterViewInit(this);
  }
  initKonvaIfNeeded = (): void => actions.initializeKonvaOverlay(this);
  _beginStartMarkerDrag = (focusTarget: EventTarget | null): void =>
    beginStartMarkerDrag(this, focusTarget);
  _beginFinishLineDrag = (focusTarget: EventTarget | null): void =>
    beginFinishLineDrag(this, focusTarget);
  _handleTrackContextMenuAtWorld = (wx: number, wy: number): void =>
    handleTrackContextMenuAtWorld(this, wx, wy);
  ngOnDestroy(): void {
    actions.destroyApp(this);
  }
  get editorSectionIndex(): number {
    return actions.getEditorSectionIndex(this);
  }
  set editorSectionIndex(idx: number) {
    actions.setEditorSectionIndex(this, idx);
  }
  readonly getPackSpriteDataUrl = (frameId: number): string | null => {
    this.packSpritesVersion();
    return getPackSpriteDataUrl(this, frameId);
  };
  readonly getTileDataUrl = (texId: number): string | null => getTileDataUrl(this, texId);
  readonly getRoadInfoPreviewDataUrl = (roadInfoId: number): string | null =>
    getRoadInfoPreviewDataUrl(this, roadInfoId);
  readonly getTileDimensions = (texId: number): string => lookupTileDimensions(this, texId);
  readonly getIconThumbDataUrl = (type: string, id: number): string | null => {
    this.iconThumbnailsVersion();
    const key = `${type}:${id}`;
    return getKeyedCanvasDataUrl(this._iconDataUrls, this.iconCanvasMap, key);
  };
  readonly getSpritePreviewDataUrl = (typeRes: number): string | null => {
    this.spritePreviewsVersion();
    return getCanvasDataUrl(this._spritePreviewDataUrls, this.objectSpritePreviews, typeRes);
  };
  readonly getObjFallbackColor = (typeRes: number): string =>
    getObjFallbackColor(typeRes, OBJ_PALETTE);
  applyLevelsResult = (
    levels: ParsedLevel[],
    options?: { preserveCanvasView?: boolean; refreshSelectedLevelState?: boolean },
  ): void => applyLevelsResult(this, levels, options);
  getObjectSpritePreview = (typeRes: number): HTMLCanvasElement | null =>
    this.objectSpritePreviews.get(typeRes) ?? null;
  editorRoadMaxY = (): number => getEditorRoadMaxY(this);
  selectedObjectSpriteUrl = (): string | null => {
    const index = this.selectedObjIndex();
    const object = index === null ? undefined : this.objects()[index];
    return object ? this.getSpritePreviewDataUrl(object.typeRes) : null;
  };
  selectLevel(id: number, options?: { preserveView?: boolean }): void {
    selectLevel(this, id, options);
  }
  resetViewToRoad(level: ParsedLevel): void {
    resetViewToRoad(this, level);
  }
  onLevelScriptBindingChange(event: { levelResourceId: number; scriptId: number | null }): void {
    this.setLevelScriptBinding(event.levelResourceId, event.scriptId);
  }
  onObjectGroupEntryChange(event: {
    groupId: number;
    entryIndex: number;
    field: keyof ObjectGroupEntryData;
    value: number;
  }): void {
    this.onObjectGroupEntryInput(event.groupId, event.entryIndex, event.field, event.value);
  }
  onObjectTypeReferenceChangeEvent(event: {
    typeRes: number;
    field: 'deathObj' | 'creationSound' | 'otherSound' | 'weaponObj';
    value: number;
  }): void {
    this.onObjectTypeReferenceChange(event.typeRes, event.field, event.value);
  }
  onObjectTypeFlagToggleEvent(event: {
    typeRes: number;
    field: 'flags' | 'flags2';
    bit: number;
    checked: boolean;
  }): void {
    this.onObjectTypeFlagToggle(event.typeRes, event.field, event.bit, event.checked);
  }
  setEditorTestDriveLevelNumber(rawValue: string): void {
    setLevelNumber(this, rawValue);
  }
  setEditorTestDriveLevelEnabled(enabled: boolean): void {
    setLevelEnabled(this, enabled);
  }
  setEditorTestDriveUseStartY(enabled: boolean): void {
    setUseStartY(this, enabled);
  }
  setEditorTestDriveStartY(rawValue: string): void {
    setStartY(this, rawValue);
  }
  setEditorTestDriveUseObjectGroupStartY(enabled: boolean): void {
    setUseObjectGroupStartY(this, enabled);
  }
  launchSelectedLevelPreview(levelResourceId: number, stripScripts = false): Promise<void> {
    return runSelectedLevelPreview(this, levelResourceId, stripScripts);
  }
  setEditorTestDriveObjectGroupStartY(rawValue: string): void {
    setObjectGroupStartY(this, rawValue);
  }
  toggleEditorTestDriveForcedAddon(mask: number, checked: boolean): void {
    toggleForcedAddon(this, mask, checked);
  }
  toggleEditorTestDriveDisabledBonusRoll(mask: number, checked: boolean): void {
    toggleDisabledBonusRoll(this, mask, checked);
  }

  async setCustomOptionsPreset(preset: CustomOptionsPresetId): Promise<void> {
    return applyCustomOptionsPreset(this, preset);
  }
  async setCustomResourcesPreset(
    preset: CustomResourcesPresetId,
    updateOptionsPreset = true,
  ): Promise<void> {
    return applyCustomResourcesPreset(this, preset, updateOptionsPreset);
  }
  setCustomSettingsPreset(preset: CustomSettingsPresetId, updateOptionsPreset = true): void {
    applyCustomSettingsPreset(this, preset, updateOptionsPreset);
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
  selectTileImage = (tileId: number | null): void => {
    this.selectedTileId.set(tileId);
    if (tileId !== null) {
      this.selectedRoadInfoId.set(null);
      this.selectedRoadInfoData.set(null);
    }
  };
  createRoadInfo = (): Promise<void> => createRoadInfo(this);
  deleteRoadInfo = (roadInfoId: number | null = this.selectedRoadInfoId()): Promise<void> =>
    deleteRoadInfo(this, roadInfoId);
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
  _captureUndoSnapshot = (kind: EditorUndoKind): EditorUndoSnapshot =>
    captureUndoSnapshot(this, kind);
  _applyUndoSnapshot = (snapshot: EditorUndoSnapshot): void => applyUndoSnapshot(this, snapshot);
  _pushUndo = (kind: EditorUndoKind): void => pushUndo(this, kind);
  _resetObjectHistory = (): void => resetObjectHistory(this);
  undo = (): void => undo(this);
  redo = (): void => redo(this);
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
  selectedObjectGroup = (): ObjectGroupDefinition | null => selectedObjectGroup(this);
  selectObjectGroup = (groupId: number): void => selectObjectGroup(this, groupId);
  addObjectGroup = (duplicateSelected = false): void => addObjectGroup(this, duplicateSelected);
  deleteObjectGroup = (groupId: number): void => deleteObjectGroup(this, groupId);
  addObjectGroupEntry = (groupId: number): void => addObjectGroupEntry(this, groupId);
  deleteObjectGroupEntry = (groupId: number, entryIndex: number): void =>
    deleteObjectGroupEntry(this, groupId, entryIndex);
  onObjectGroupEntryInput(
    groupId: number,
    entryIndex: number,
    field: keyof ObjectGroupEntryData,
    value: number,
  ): void {
    onObjectGroupEntryInput(this, groupId, entryIndex, field, value);
  }
  saveObjectGroups = (): Promise<void> => saveObjectGroups(this);
  cloneObjectTypeDefinitions(defs = this.objectTypeDefinitions()): ObjectTypeDefinition[] {
    return cloneObjectTypeDefinitions(this, defs);
  }
  syncObjectTypeLookup = (defs = this.objectTypeDefinitions()): void =>
    syncObjectTypeLookup(this, defs);
  nextObjectTypeId = (defs = this.objectTypeDefinitions()): number => nextObjectTypeId(this, defs);
  selectedObjectType = (): ObjectTypeDefinition | null => selectedObjectType(this);
  scheduleObjectTypesAutoSave = (): void => scheduleObjectTypesAutoSave(this);
  markObjectTypesDirty = (defs: ObjectTypeDefinition[]): void => markObjectTypesDirty(this, defs);
  defaultObjectTypeDefinition(
    typeRes: number,
    source?: ObjectTypeDefinition | null,
  ): ObjectTypeDefinition {
    return defaultObjectTypeDefinition(this, typeRes, source);
  }
  selectObjectType = (typeRes: number): void => selectObjectType(this, typeRes);
  addObjectType = (duplicateSelected = false): void => addObjectType(this, duplicateSelected);
  deleteObjectType = (typeRes: number): void => deleteObjectType(this, typeRes);
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
  onObjectTypeReferenceChange = (
    typeRes: number,
    field: 'deathObj' | 'creationSound' | 'otherSound' | 'weaponObj',
    value: number,
  ): void => onObjectTypeReferenceChange(this, typeRes, field, value);
  onObjectTypeFlagToggle = (
    typeRes: number,
    field: 'flags' | 'flags2',
    bit: number,
    checked: boolean,
  ): void => onObjectTypeFlagToggle(this, typeRes, field, bit, checked);
  onObjectTypeFrameChange = (typeRes: number, frame: number): void =>
    onObjectTypeFrameChange(this, typeRes, frame);
  scriptBindingForObjectType = (typeRes: number) => scriptBindingForObjectType(this, typeRes);
  setObjectTypeScriptBinding = (typeRes: number, scriptId: number | null): void =>
    setObjectTypeScriptBinding(this, typeRes, scriptId);
  createScriptForObjectType = (typeRes: number): void => createScriptForObjectType(this, typeRes);
  levelScriptBindingForLevel = (levelResourceId: number) =>
    levelScriptBindingForLevel(this, levelResourceId);
  setLevelScriptBinding = (levelResourceId: number, scriptId: number | null): void =>
    setLevelScriptBinding(this, levelResourceId, scriptId);
  createScriptForLevel = (levelResourceId: number): void =>
    createScriptForLevel(this, levelResourceId);
  updateScriptName = (scriptId: number, name: string): void =>
    updateScriptName(this, scriptId, name);
  updateScriptSource = (scriptId: number, source: string): void =>
    updateScriptSource(this, scriptId, source);
  updateScript = (scriptId: number, name: string, source: string): void =>
    updateScript(this, scriptId, name, source);
  saveObjectTypes = (): Promise<void> => saveObjectTypes(this);
  selectObject = (index: number, centerCanvas = false): void =>
    selectObject(this, index, centerCanvas);
  onObjDirDegInput = (value: string): void => onObjDirDegInput(this, value);
  onObjTypeResChange = (typeRes: number): void => onObjTypeResChange(this, typeRes);
  applyObjEdit = (): void => applyObjEdit(this);
  addObject = (): void => addObject(this);
  duplicateSelectedObject = (): void => duplicateSelectedObject(this);
  toggleTypeVisibility = (typeId: number): void => toggleTypeVisibility(this, typeId);
  showAllObjectTypes = (): void => showAllObjectTypes(this);
  hideAllObjectTypes = (): void => hideAllObjectTypes(this);
  readonly getObjTypeDimensionLabel = (typeRes: number): string =>
    getObjectTypeDimensionLabel(this, typeRes);
  removeSelectedObject = (): void => removeSelectedObject(this);
  saveLevelObjects = (): Promise<void> => saveLevelObjects(this);
  saveTrack = (): Promise<void> => saveTrack(this);
  worldToCanvas = (wx: number, wy: number): [number, number] => worldToCanvas(this, wx, wy);
  canvasToWorld = (cx: number, cy: number): [number, number] => canvasToWorld(this, cx, cy);
  onCanvasMouseDown = (event: MouseEvent): void => onCanvasMouseDown(this, event);
  onCanvasMouseMove = (event: MouseEvent): void => onCanvasMouseMove(this, event);
  onCanvasMouseUp = (): void => onCanvasMouseUp(this);
  onCanvasDoubleClick = (event: MouseEvent): void => onCanvasDoubleClick(this, event);
  onCanvasContextMenu = (event: MouseEvent): void => onCanvasContextMenu(this, event);
  _insertWaypointAfter = (track: 'up' | 'down', segIdx: number): void =>
    insertWaypointAfter(this, track, segIdx);
  onCanvasKeyDown = (event: KeyboardEvent): void => onCanvasKeyDown(this, event);
  onCanvasKeyUp = (event: KeyboardEvent): void => onCanvasKeyUp(this, event);
  onCanvasWheel = (event: WheelEvent): void => onCanvasWheel(this, event);
  zoomIn(): void {
    this.canvasZoom.set(Math.min(10, this.canvasZoom() + 0.25));
  }
  zoomOut(): void {
    this.canvasZoom.set(Math.max(0.1, this.canvasZoom() - 0.25));
  }
  resetView = (): void => resetView(this);
  frameAllObjects = (): void => frameAllObjects(this);
  centerOnSelectedObject = (): void => centerOnSelectedObject(this);
  redrawObjectCanvas = (): void => redrawObjectCanvas(this);
  addMark = (): void => addMark(this);
  startMarkCreateMode = (): void => startMarkCreateMode(this);
  confirmMarkCreateMode = (): void => confirmMarkCreateMode(this);
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
  onGenerateSideRoadMarks(event: {
    roadSelection: import('./road-marking-utils').MarkingRoadSelection;
    yStart: number;
    yEnd: number;
    inset: number;
    yFrequency: number;
  }): void {
    this.generateSideRoadMarks(
      event.roadSelection,
      event.yStart,
      event.yEnd,
      event.inset,
      event.yFrequency,
    );
  }
  onGenerateCentreRoadMarks(event: {
    roadSelection: import('./road-marking-utils').MarkingRoadSelection;
    yStart: number;
    yEnd: number;
    dashLength: number;
    gapLength: number;
  }): void {
    this.generateCentreRoadMarks(
      event.roadSelection,
      event.yStart,
      event.yEnd,
      event.dashLength,
      event.gapLength,
    );
  }
  onPreviewSideRoadMarks(event: {
    roadSelection: import('./road-marking-utils').MarkingRoadSelection;
    yStart: number;
    yEnd: number;
    inset: number;
    yFrequency: number;
  }): void {
    this.previewSideRoadMarks(
      event.roadSelection,
      event.yStart,
      event.yEnd,
      event.inset,
      event.yFrequency,
    );
  }
  onPreviewCentreRoadMarks(event: {
    roadSelection: import('./road-marking-utils').MarkingRoadSelection;
    yStart: number;
    yEnd: number;
    dashLength: number;
    gapLength: number;
  }): void {
    this.previewCentreRoadMarks(
      event.roadSelection,
      event.yStart,
      event.yEnd,
      event.dashLength,
      event.gapLength,
    );
  }
  setMarkingRangePreview = (yStart: number, yEnd: number): void =>
    setMarkingRangePreview(this, yStart, yEnd);
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
  setObjectGroupSpawnPreview = (objects: ObjectGroupSpawnPreviewObject[]): void =>
    this.objectGroupSpawnPreviewObjects.set(objects);
  clearMarkingPreviews = (): void => clearMarkingPreviews(this);
  removeMarksByYRange = (yStart: number, yEnd: number): void =>
    removeMarksByYRange(this, yStart, yEnd);
  removeSelectedMark = (): void => removeSelectedMark(this);
  _addMarkCreatePoint = (x: number, y: number): void => addMarkCreatePoint(this, x, y);
  _hasColocatedNubs = (): boolean => hasColocatedNubs(this);
  _splitCollocatedMarkNubs = (): void => splitCollocatedMarkNubs(this);
  _joinAdjacentMarkNubs = (): void => joinAdjacentMarkNubs(this);
  onMarkFieldInput = (markIdx: number, field: 'x1' | 'y1' | 'x2' | 'y2', value: number): void =>
    onMarkFieldInput(this, markIdx, field, value);
  saveMarks = (): Promise<void> => saveMarks(this);
  scheduleMarkAutoSave = (): void => scheduleMarkAutoSave(this);
  _handleCurveDrawClick = (wx: number, wy: number): void => handleCurveDrawClick(this, wx, wy);
  _updateCurvePreview = (wx: number, wy: number): void => updateCurvePreview(this, wx, wy);
  _applyBarrierDrawPath = (): void => applyBarrierDrawPath(this);
  redrawMarkCanvas = (): void => redrawMarkCanvas(this);
  onMarkCanvasMouseDown = (event: MouseEvent): void => onMarkCanvasMouseDown(this, event);
  onMarkCanvasMouseMove = (event: MouseEvent): void => onMarkCanvasMouseMove(this, event);
  onMarkCanvasMouseUp = (): void => onMarkCanvasMouseUp(this);
  selectSprite = (spriteId: number): Promise<void> => selectSprite(this, spriteId);
  redrawSpriteCanvas = (): void => redrawSpriteCanvas(this);
  exportSpritePng = (): void => exportSpritePng(this);
  readonly getSpriteFormatLabel = getSpriteFormatLabel;
  openSpriteEditor = (frameId: number): void => openSpriteEditor(this, frameId);
  onSpritePngUpload = (event: Event, frameId: number): Promise<void> =>
    onSpritePngUpload(this, event, frameId);
  addSpriteFrame = (): Promise<void> => addSpriteFrame(this);
  onSpriteEditorSaved(event: { frameId: number; pixels: Uint8ClampedArray }): Promise<void> {
    if (this._editingIconResource) {
      return this.media.onIconImageEditorSaved(event);
    }
    return onSpriteEditorSaved(this, event);
  }
}
