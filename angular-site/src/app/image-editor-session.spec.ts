import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { App } from './app';
import { AppModule } from './app-module';
import { leaveImageEditor } from './image-editor-session';

it('preserves a dirty image when navigation is cancelled and clears edit targets when discarded', async () => {
  await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
  const app = TestBed.createComponent(App).componentInstance;
  app.spriteEditorOpen.set(true);
  app.spriteEditorDirty.set(true);
  app._editingIconResource = { type: 'PPic', id: 1000 };
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  try {
    expect(leaveImageEditor(app)).toBe(false);
    expect(app.spriteEditorOpen()).toBe(true);
    expect(app.spriteEditorDirty()).toBe(true);
    expect(app._editingIconResource).toEqual({ type: 'PPic', id: 1000 });
    confirm.mockReturnValue(true);
    expect(leaveImageEditor(app)).toBe(true);
    expect(app.spriteEditorOpen()).toBe(false);
    expect(app.spriteEditorDirty()).toBe(false);
    expect(app._editingIconResource).toBeNull();
    expect(app._editingTileId).toBeNull();
  } finally {
    confirm.mockRestore();
  }
});
