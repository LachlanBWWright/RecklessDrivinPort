import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { vi } from 'vitest';
import { SCRIPT_FORMAT_VERSION } from '../script-format';
import {
  LuaScriptEditorDialogComponent,
  type LuaScriptEditorDialogData,
  type LuaScriptEditorDialogResult,
} from './lua-script-editor-dialog.component';

describe('LuaScriptEditorDialogComponent', () => {
  const data: LuaScriptEditorDialogData = {
    script: {
      id: 128,
      version: SCRIPT_FORMAT_VERSION,
      name: 'Ambush',
      source: 'function onTick(self, ctx)\n  self:setVelocity(1, 0)\nend\n',
    },
    objectTypeId: 200,
    objectTypes: [
      {
        typeRes: 200,
        mass: 1,
        maxEngineForce: 0,
        maxNegEngineForce: 0,
        friction: 1,
        flags: 0,
        deathObj: -1,
        frame: 128,
        numFrames: 1,
        frameDuration: 0,
        wheelWidth: 0,
        wheelLength: 0,
        steering: 0,
        width: 0,
        length: 0,
        score: 0,
        flags2: 0,
        creationSound: -1,
        otherSound: -1,
        maxDamage: 0,
        weaponObj: -1,
        weaponInfo: -1,
      },
    ],
    spriteFrames: [{ id: 128, bitDepth: 8, width: 16, height: 16 }],
    audioEntries: [{ id: 130, sizeBytes: 4000, durationMs: 500 }],
    issues: [],
  };

  function createComponent(close: (result?: LuaScriptEditorDialogResult) => void): LuaScriptEditorDialogComponent {
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    return TestBed.runInInjectionContext(() => new LuaScriptEditorDialogComponent());
  }

  it('closes with edited name and source on save', () => {
    const close = vi.fn();
    const component = createComponent(close);
    component.nameControl.setValue('Chaser');

    component.save();

    expect(close).toHaveBeenCalledWith({
      scriptId: 128,
      name: 'Chaser',
      source: data.script.source,
    });
  });

  it('closes without a result on clean cancel', () => {
    const close = vi.fn();
    const component = createComponent(close);

    component.cancel();

    expect(close).toHaveBeenCalledWith();
  });
});
