import type { App } from './app';
import { bindAppAction } from './bind-app-action';
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
  onIconPngUpload(file: File | null): Promise<void>;
  addIconEntry(): Promise<void>;
  exportAudioWav(): void;
  onAudioWavUpload(file: File | null): Promise<void>;
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
  onTilePngUpload(file: File | null, texId: number): Promise<void>;
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
    loadResourceList: bindAppAction(app, loadResourceListHelper),
    selectResource: bindAppAction(app, selectResourceHelper),
    selectPackEntry: bindAppAction(app, selectPackEntryHelper),
    loadIconEntries: bindAppAction(app, loadIconEntriesHelper),
    loadAudioEntries: bindAppAction(app, loadAudioEntriesHelper),
    selectAudioEntry: bindAppAction(app, selectAudioEntryHelper),
    loadSelectedAudioBytes: bindAppAction(app, loadSelectedAudioBytesHelper),
    selectIconEntry: bindAppAction(app, selectIconEntryHelper),
    exportIconPng: bindAppAction(app, exportIconPngHelper),
    exportIconRaw: bindAppAction(app, exportIconRawHelper),
    onIconPngUpload: bindAppAction(app, onIconPngUploadHelper),
    addIconEntry: bindAppAction(app, addIconEntryHelper),
    exportAudioWav: bindAppAction(app, exportAudioWavHelper),
    onAudioWavUpload: bindAppAction(app, onAudioWavUploadHelper),
    addAudioEntry: bindAppAction(app, addAudioEntryHelper),
    loadAllIconThumbnails: bindAppAction(app, loadAllIconThumbnailsHelper),
    downloadSelectedResource: bindAppAction(app, downloadSelectedResourceHelper),
    downloadSelectedPackEntry: bindAppAction(app, downloadSelectedPackEntryHelper),
    triggerUploadResource: bindAppAction(app, triggerUploadResourceHelper),
    triggerUploadPackEntry: bindAppAction(app, triggerUploadPackEntryHelper),
    saveStrList: bindAppAction(app, saveStrListHelper),
    updateResString: bindAppAction(app, updateResStringHelper),
    addResString: bindAppAction(app, addResStringHelper),
    removeResString: bindAppAction(app, removeResStringHelper),
    saveResText: bindAppAction(app, saveResTextHelper),
    savePackEntryFields: bindAppAction(app, savePackEntryFieldsHelper),
    openTileEditor: bindAppAction(app, openTileEditorHelper),
    exportTilePng: bindAppAction(app, exportTilePngHelper),
    onTilePngUpload: bindAppAction(app, onTilePngUploadHelper),
    onTileEditorSaved: bindAppAction(app, onTileEditorSavedHelper),
    addTileImage: bindAppAction(app, addTileImageHelper),
    deleteTileImage: bindAppAction(app, deleteTileImageHelper),
    togglePlayPause: bindAppAction(app, togglePlayPauseHelper),
    setAudioPlayerVolume: bindAppAction(app, setAudioPlayerVolumeHelper),
    stopAudio: bindAppAction(app, stopAudioHelper),
    seekAudio: bindAppAction(app, seekAudioHelper),
    playSndResource: bindAppAction(app, playAudioEntryHelper),
    getResHexDump: getResHexDumpHelper,
    iconLabel: iconLabelHelper,
  };
}
