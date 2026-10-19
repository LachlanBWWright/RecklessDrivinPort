import type { App } from './app';

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

export function getEditorSectionIndex(app: App): number {
  return app.SECTION_ORDER.indexOf(app.editorSection());
}

export function setEditorSectionIndex(app: App, index: number): void {
  const section = app.SECTION_ORDER[index];
  if (section) app.runtime.setSection(section);
}

export function toggleFullscreen(): void {
  const frame = document.getElementById('game-frame');
  const frameWindow = frame instanceof HTMLIFrameElement ? frame.contentWindow : null;
  const canvas = frameWindow?.document.querySelector<HTMLCanvasElement>('#canvas');
  if (!canvas) return;
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  void canvas.requestFullscreen().catch((error: unknown) => {
    console.warn('Fullscreen error:', error);
  });
}

export function onVolumeChange(app: App, event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const volume = Number.parseInt(input.value, 10);
  if (!Number.isFinite(volume)) return;
  app.masterVolume.set(volume);
  app.runtime.applyVolumeToWasm(volume);
}
