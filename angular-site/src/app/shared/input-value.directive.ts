import { Directive, ElementRef, HostListener, Input, OnChanges } from '@angular/core';

/**
 * Drop-in replacement for `[value]` bindings on `<input>` elements inside
 * OnPush components driven by signals.
 *
 * The native `[value]` property-binding fires on every change-detection cycle,
 * unconditionally overwriting `element.value` — which resets the cursor
 * position and makes editing impossible.  Angular Material (v21) also writes to
 * the native `value` property in its own async lifecycle hooks, so guarding
 * only `ngOnChanges` is not sufficient.
 *
 * This directive installs a per-instance property-descriptor guard on the
 * element's `value` setter that blocks ALL JavaScript writes while the input
 * has focus (browser-native typing is unaffected).  On blur it re-syncs the
 * element with the current model value, ensuring the displayed value is always
 * correct once the user leaves the field.
 *
 * Usage: replace `[value]="x"` → `[appValue]="x"`
 */
@Directive({
  selector: 'input[appValue]',
  standalone: false,
})
export class InputValueDirective implements OnChanges {
  @Input('appValue') appValue: string | number | null | undefined = null;

  private _focused = false;
  private readonly _proto: PropertyDescriptor | undefined;

  constructor(private readonly _el: ElementRef<HTMLInputElement>) {
    this._proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    this._installGuard();
  }

  ngOnChanges(): void {
    if (!this._focused) {
      this._domWrite(this.appValue);
    }
  }

  @HostListener('focus')
  onFocus(): void {
    this._focused = true;
  }

  @HostListener('blur')
  onBlur(): void {
    this._focused = false;
    this._domWrite(this.appValue);
  }

  /**
   * Installs an instance-level property override so that any JS code that
   * assigns to `element.value` (including Angular Material lifecycle hooks)
   * is silently dropped while the input is focused.
   */
  private _installGuard(): void {
    const desc = this._proto;
    if (!desc?.get || !desc.set) return;
    const { get: origGet, set: origSet } = desc;
    const dir = this;
    Object.defineProperty(this._el.nativeElement, 'value', {
      configurable: true,
      enumerable: true,
      get() { return origGet.call(this); },
      set(v: string) { if (!dir._focused) origSet.call(this, v); },
    });
  }

  /**
   * Writes a model value to the element using the prototype-level setter,
   * bypassing the instance-level guard installed by `_installGuard`.
   */
  private _domWrite(val: string | number | null | undefined): void {
    const desc = this._proto;
    if (!desc?.get || !desc.set) return;
    const el = this._el.nativeElement;
    const newVal = val == null ? '' : String(val);
    if (desc.get.call(el) !== newVal) {
      desc.set.call(el, newVal);
    }
  }
}
