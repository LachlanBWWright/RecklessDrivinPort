import type { App } from './app';

/** Navigation must not silently discard the pixel editor's working copy. */
export function leaveImageEditor(app: App): boolean {
  if (!app.spriteEditorOpen()) return true;
  if (app.spriteEditorDirty() && !window.confirm('Discard unapplied image changes?')) return false;
  app.closeImageEditor();
  return true;
}
