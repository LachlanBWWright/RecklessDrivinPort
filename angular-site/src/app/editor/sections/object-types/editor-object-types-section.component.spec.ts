import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { EditorObjectTypesSectionComponent } from './editor-object-types-section.component';
import type { ObjectTypeDefinition, ScriptBinding, ScriptDefinition, ScriptValidationIssue } from '../../../level-editor.service';
import { SCRIPT_FORMAT_VERSION } from '../../../script-format';

describe('EditorObjectTypesSectionComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: MatDialog, useValue: { open: () => ({ afterClosed: () => ({ subscribe: () => undefined }) }) } }],
    });
  });

  function createComponent(): EditorObjectTypesSectionComponent {
    return TestBed.runInInjectionContext(() => new EditorObjectTypesSectionComponent());
  }

  function makeType(overrides: Partial<ObjectTypeDefinition> = {}): ObjectTypeDefinition {
    return {
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
      ...overrides,
    };
  }

  it('cycles through contiguous sprite frames for the preview', () => {
    const component = createComponent();
    component.objectTypes = [makeType({ frame: 128, numFrames: 3 })];
    component.spriteFrames = [
      { id: 128, bitDepth: 8, width: 16, height: 16 },
      { id: 129, bitDepth: 8, width: 16, height: 16 },
      { id: 130, bitDepth: 8, width: 16, height: 16 },
    ];
    component.selectedObjectTypeId = 200;

    expect(component.getPreviewFrameId(component.selectedType!)).toBe(128);
    expect(component.hasPreviewFrameControls(component.selectedType!)).toBe(true);

    component.stepPreviewFrame(200, 1);
    expect(component.getPreviewFrameId(component.selectedType!)).toBe(129);

    component.stepPreviewFrame(200, 1);
    expect(component.getPreviewFrameId(component.selectedType!)).toBe(130);

    component.stepPreviewFrame(200, 1);
    expect(component.getPreviewFrameId(component.selectedType!)).toBe(128);
  });

  it('hides preview controls when there is only one frame', () => {
    const component = createComponent();
    component.objectTypes = [makeType({ frame: 300, numFrames: 1 })];
    component.spriteFrames = [{ id: 300, bitDepth: 16, width: 24, height: 24 }];
    component.selectedObjectTypeId = 200;

    expect(component.hasPreviewFrameControls(component.selectedType!)).toBe(false);
  });

  it('resolves the selected script binding and diagnostics', () => {
    const component = createComponent();
    component.objectTypes = [makeType()];
    component.selectedObjectTypeId = 200;
    component.scripts = [
      {
        id: 128,
        version: SCRIPT_FORMAT_VERSION,
        name: 'Ambush',
        source: 'function onTick(self, ctx)\n  self:setInput(1, 0.65)\nend\n',
      } satisfies ScriptDefinition,
    ];
    component.scriptBindings = [{ objectTypeId: 200, scriptId: 128, flags: 0 }] satisfies ScriptBinding[];
    component.scriptIssues = [
      {
        severity: 'warning',
        scriptId: 128,
        hook: 'onTick',
        line: 1,
        message: 'test issue',
      },
    ] satisfies ScriptValidationIssue[];

    expect(component.selectedScriptBinding).toEqual({ objectTypeId: 200, scriptId: 128, flags: 0 });
    expect(component.selectedScript?.name).toBe('Ambush');
    expect(component.getIssuesForSelectedScript()).toEqual(component.scriptIssues);
    expect(component.selectedScript?.source).toContain('onTick');
    expect(component.getSelectedScriptValidationLabel()).toBe('Warnings');
    expect(component.getSelectedScriptHookLabels()).toEqual(['onTick']);
  });
});
