import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { GamePanelComponent } from './game-panel.component';

describe('GamePanelComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GamePanelComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(GamePanelComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should handle gamepad connected and disconnected events', () => {
    const fixture = TestBed.createComponent(GamePanelComponent);
    const comp = fixture.componentInstance;
    comp.ngOnInit();

    const gamepad = { id: 'Xbox Wireless Controller', connected: true } as Gamepad;
    const connectEvent = new Event('gamepadconnected') as GamepadEvent;
    Object.defineProperty(connectEvent, 'gamepad', { value: gamepad });

    window.dispatchEvent(connectEvent);
    expect(comp.connectedGamepadName).toBe('Xbox Wireless Controller');

    const disconnectEvent = new Event('gamepaddisconnected') as GamepadEvent;
    window.dispatchEvent(disconnectEvent);
    comp.ngOnDestroy();
  });
});
