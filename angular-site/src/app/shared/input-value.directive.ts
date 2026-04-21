import { Directive, ElementRef, HostListener, Input, OnChanges } from '@angular/core';

/**
 * Drop-in replacement for `[value]` bindings on `<input>` elements inside
 * OnPush components driven by signals.
 *
 * Angular's `[value]="x"` property-binding calls `ngOnChanges` on every
 * change-detection cycle, which overwrites `element.value` and resets the
 * cursor position, making typing impossible.
 *
 * This directive suppresses the DOM write while the input has focus.
 * On blur it re-syncs the element with the current model value.
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
      this._write(this.appValue);
    }
  }

  @HostListener('focus')
  onFocus(): void {
    this._focused = true;
  }

  @HostListener('blur')
  onBlur(): void {
    this._focused = false;
    this._write(this.appValue);
  }

  private _write(val: string | number | null | undefined): void {
    const el = this._el.nativeElement;
    const next = val == null ? '' : String(val);
    if (el.value !== next) {
      el.value = next;
    }
  }
}
