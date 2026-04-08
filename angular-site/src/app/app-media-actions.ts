import type { App } from './app';
import {
  addAudioEntry as addAudioEntryHelper,
  addIconEntry as addIconEntryHelper,
  exportAudioWav as exportAudioWavHelper,
  exportIconPng as exportIconPngHelper,
  exportIconRaw as exportIconRawHelper,
  iconLabel as iconLabelHelper,
  loadAllIconThumbnails as loadAllIconThumbnailsHelper,
  loadAudioEntries as loadAudioEntriesHelper,
  loadIconEntries as loadIconEntriesHelper,
  loadSelectedAudioBytes as loadSelectedAudioBytesHelper,
  onIconPngUpload as onIconPngUploadHelper,
  onAudioWavUpload as onAudioWavUploadHelper,
  selectIconEntry as selectIconEntryHelper,
  selectAudioEntry as selectAudioEntryHelper,
  playAudioEntry as playAudioEntryHelper,
} from './app-media';
import {
  addResString as addResStringHelper,
  addTileImage as addTileImageHelper,
  deleteTileImage as deleteTileImageHelper,
  downloadSelectedPackEntry as downloadSelectedPackEntryHelper,
  downloadSelectedResource as downloadSelectedResourceHelper,
  exportTilePng as exportTilePngHelper,
  getResHexDump as getResHexDumpHelper,
  loadResourceList as loadResourceListHelper,
  onTileEditorSaved as onTileEditorSavedHelper,
  onTilePngUpload as onTilePngUploadHelper,
  openTileEditor as openTileEditorHelper,
  removeResString as removeResStringHelper,
  savePackEntryFields as savePackEntryFieldsHelper,
  saveResText as saveResTextHelper,
  saveStrList as saveStrListHelper,
  selectPackEntry as selectPackEntryHelper,
  selectResource as selectResourceHelper,
  triggerUploadPackEntry as triggerUploadPackEntryHelper,
  triggerUploadResource as triggerUploadResourceHelper,
  updateResString as updateResStringHelper,
} from './resource-browser';
import {
  seekAudio as seekAudioHelper,
  setAudioPlayerVolume as setAudioPlayerVolumeHelper,
  stopAudio as stopAudioHelper,
  togglePlayPause as togglePlayPauseHelper,
} from './app-audio';

export function createMediaActions(app: App): {
  loadResourceList(): Promise<void>;
  selectResource(type: string, id: number): Promise<void>;
  selectPackEntry(packId: number, entryId: number): Promise<void>;
  loadIconEntries(): Promise<void>;
  loadAudioEntries(): Promise<void>;
  selectAudioEntry(id: number): Promise<void>;
  loadSelectedAudioBytes(id: number): Promise<void>;
  selectIconEntry(type: string, id: number): Promise<void>;
  exportIconPng(): void;
  exportIconRaw(): void;
  onIconPngUpload(event: Event): Promise<void>;
  addIconEntry(): Promise<void>;
  exportAudioWav(): void;
  onAudioWavUpload(event: Event): Promise<void>;
  addAudioEntry(): Promise<void>;
  loadAllIconThumbnails(): Promise<void>;
  downloadSelectedResource(): void;
  downloadSelectedPackEntry(): void;
  triggerUploadResource(): void;
  triggerUploadPackEntry(): void;
  saveStrList(): Promise<void>;
  updateResString(index: number, value: string): void;
  addResString(): void;
  removeResString(index: number): void;
  saveResText(): Promise<void>;
  savePackEntryFields(): Promise<void>;
  openTileEditor(texId: number): void;
  exportTilePng(texId: number): void;
  onTilePngUpload(event: Event, texId: number): Promise<void>;
  onTileEditorSaved(event: { frameId: number; pixels: Uint8ClampedArray }): Promise<void>;
  addTileImage(): Promise<void>;
  deleteTileImage(texId: number): Promise<void>;
  togglePlayPause(): Promise<void>;
  setAudioPlayerVolume(pct: number): void;
  stopAudio(): void;
  seekAudio(seconds: number): void;
  playSndResource(): Promise<void>;
  getResHexDump(bytes: Uint8Array): string;
  iconLabel(type: string, id: number): string;
} {
  return {
    loadResourceList: () => loadResourceListHelper(app),
    selectResource: (type, id) => selectResourceHelper(app, type, id),
    selectPackEntry: (packId, entryId) => selectPackEntryHelper(app, packId, entryId),
    loadIconEntries: () => loadIconEntriesHelper(app),
    loadAudioEntries: () => loadAudioEntriesHelper(app),
    selectAudioEntry: (id) => selectAudioEntryHelper(app, id),
    loadSelectedAudioBytes: (id) => loadSelectedAudioBytesHelper(app, id),
    selectIconEntry: (type, id) => selectIconEntryHelper(app, type, id),
    exportIconPng: () => exportIconPngHelper(app),
    exportIconRaw: () => exportIconRawHelper(app),
    onIconPngUpload: (event) => onIconPngUploadHelper(app, event),
    addIconEntry: () => addIconEntryHelper(app),
    exportAudioWav: () => exportAudioWavHelper(app),
    onAudioWavUpload: (event) => onAudioWavUploadHelper(app, event),
    addAudioEntry: () => addAudioEntryHelper(app),
    loadAllIconThumbnails: () => loadAllIconThumbnailsHelper(app),
    downloadSelectedResource: () => downloadSelectedResourceHelper(app),
    downloadSelectedPackEntry: () => downloadSelectedPackEntryHelper(app),
    triggerUploadResource: () => triggerUploadResourceHelper(app),
    triggerUploadPackEntry: () => triggerUploadPackEntryHelper(app),
    saveStrList: () => saveStrListHelper(app),
    updateResString: (index, value) => updateResStringHelper(app, index, value),
    addResString: () => addResStringHelper(app),
    removeResString: (index) => removeResStringHelper(app, index),
    saveResText: () => saveResTextHelper(app),
    savePackEntryFields: () => savePackEntryFieldsHelper(app),
    openTileEditor: (texId) => openTileEditorHelper(app, texId),
    exportTilePng: (texId) => exportTilePngHelper(app, texId),
    onTilePngUpload: (event, texId) => onTilePngUploadHelper(app, event, texId),
    onTileEditorSaved: (event) => onTileEditorSavedHelper(app, event),
    addTileImage: () => addTileImageHelper(app),
    deleteTileImage: (texId) => deleteTileImageHelper(app, texId),
    togglePlayPause: () => togglePlayPauseHelper(app),
    setAudioPlayerVolume: (pct) => setAudioPlayerVolumeHelper(app, pct),
    stopAudio: () => stopAudioHelper(app),
    seekAudio: (seconds) => seekAudioHelper(app, seconds),
    playSndResource: () => playAudioEntryHelper(app),
    getResHexDump: (bytes) => getResHexDumpHelper(bytes),
    iconLabel: (type, id) => iconLabelHelper(type, id),
  };
}
