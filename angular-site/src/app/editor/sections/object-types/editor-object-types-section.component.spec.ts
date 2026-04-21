import { EditorObjectTypesSectionComponent } from './editor-object-types-section.component';
import { TestBed } from '@angular/core/testing';
import { SimpleChange, type SimpleChanges } from '@angular/core';
import type { ObjectTypeDefinition } from '../../../level-editor.service';

describe('EditorObjectTypesSectionComponent', () => {
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

  function createComponent(): EditorObjectTypesSectionComponent {
    return TestBed.runInInjectionContext(() => new EditorObjectTypesSectionComponent());
  }

  function syncSelection(component: EditorObjectTypesSectionComponent): void {
    const changes: SimpleChanges = {
      objectTypes: new SimpleChange([], component.objectTypes, true),
      selectedObjectTypeId: new SimpleChange(null, component.selectedObjectTypeId, true),
    };
    component.ngOnChanges(changes);
  }

  it('cycles through contiguous sprite frames for the preview', () => {
    const component = createComponent();
    component.objectTypes = [makeType({ frame: 128, numFrames: 3 })];
    component.spriteFrames = [{ id: 128, bitDepth: 8, width: 16, height: 16 }, { id: 129, bitDepth: 8, width: 16, height: 16 }, { id: 130, bitDepth: 8, width: 16, height: 16 }];
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

  it('emits frameChange when frame form value changes', () => {
    const component = createComponent();
    component.objectTypes = [makeType({ frame: 128 })];
    component.spriteFrames = [{ id: 128, bitDepth: 8, width: 16, height: 16 }];
    component.selectedObjectTypeId = 200;
    syncSelection(component);
    const emitSpy = vi.spyOn(component.frameChange, 'emit');

    component.typeForm.controls.frame.setValue(129);

    expect(emitSpy).toHaveBeenCalledWith({ typeRes: 200, frame: 129 });
  });

  it('emits scalar fieldInput when scalar form value changes', () => {
    const component = createComponent();
    component.objectTypes = [makeType({ mass: 1 })];
    component.selectedObjectTypeId = 200;
    syncSelection(component);
    const emitSpy = vi.spyOn(component.fieldInput, 'emit');

    component.typeForm.controls.mass.setValue(2);

    expect(emitSpy).toHaveBeenCalledWith({ typeRes: 200, field: 'mass', value: 2 });
  });

  it('emits referenceChange when reference field value changes', () => {
    const component = createComponent();
    component.objectTypes = [makeType({ deathObj: -1 }), makeType({ typeRes: 201 })];
    component.selectedObjectTypeId = 200;
    syncSelection(component);
    const emitSpy = vi.spyOn(component.referenceChange, 'emit');

    component.typeForm.controls.deathObj.setValue(201);

    expect(emitSpy).toHaveBeenCalledWith({ typeRes: 200, field: 'deathObj', value: 201 });
  });

  it('emits flagToggle when flag checkbox changes', () => {
    const component = createComponent();
    component.objectTypes = [makeType({ flags: 0 })];
    component.selectedObjectTypeId = 200;
    syncSelection(component);
    const emitSpy = vi.spyOn(component.flagToggle, 'emit');

    component.flagForms.flags.controls[0].setValue(true);

    expect(emitSpy).toHaveBeenCalledWith({ typeRes: 200, field: 'flags', bit: 1, checked: true });
  });

  it('disables and re-enables forms when workerBusy changes', () => {
    const component = createComponent();
    component.objectTypes = [makeType()];
    component.selectedObjectTypeId = 200;
    syncSelection(component);

    component.workerBusy = true;
    component.ngOnChanges({
      workerBusy: new SimpleChange(false, true, false),
    });
    expect(component.typeForm.disabled).toBe(true);
    expect(component.flagForms.flags.disabled).toBe(true);
    expect(component.flagForms.flags2.disabled).toBe(true);

    component.workerBusy = false;
    component.ngOnChanges({
      workerBusy: new SimpleChange(true, false, false),
    });
    expect(component.typeForm.enabled).toBe(true);
    expect(component.flagForms.flags.enabled).toBe(true);
    expect(component.flagForms.flags2.enabled).toBe(true);
  });
});
