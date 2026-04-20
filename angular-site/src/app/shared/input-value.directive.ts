import { Directive, ElementRef, HostListener, Input, OnChanges } from '@angular/core';

/**
 * Drop-in replacement for `[value]` bindings on `<input>` elements inside
 * OnPush components driven by signals.
 *
 * The native `[value]` property-binding fires every time Angular runs change
 * detection and the expression value differs from the last-written value,
 * unconditionally overwriting `element.value` — which resets the cursor
 * position and makes editing numbers (or any mid-value editing) impossible.
 *
 * `appValue` avoids this by suppressing DOM writes while the field has focus.
 * On blur it re-syncs the element with the current model value, ensuring the
 * displayed value is always correct after the user leaves the field.
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

  constructor(private readonly _el: ElementRef<HTMLInputElement>) {}

  ngOnChanges(): void {
    if (!this._focused) {
      this._applyValue();
    }
  }

  @HostListener('focus')
  onFocus(): void {
    this._focused = true;
  }

  @HostListener('blur')
  onBlur(): void {
    this._focused = false;
    this._applyValue();
  }

  private _applyValue(): void {
    const el = this._el.nativeElement;
    const newVal = this.appValue == null ? '' : String(this.appValue);
    if (el.value !== newVal) {
      el.value = newVal;
    }
  }
}
