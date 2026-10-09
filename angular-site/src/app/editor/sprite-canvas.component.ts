import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  Output,
  EventEmitter,
  ViewChild,
} from '@angular/core';

@Component({
  selector: 'app-sprite-canvas',
  template: `<canvas
    #editorCanvas
    class="block border border-[var(--border)] [image-rendering:pixelated]"
    (mousedown)="mouseDown.emit($event)"
    (mousemove)="mouseMove.emit($event)"
    (mouseup)="mouseUp.emit()"
    (mouseleave)="mouseUp.emit()"
    (contextmenu)="$event.preventDefault()"
    [style.cursor]="cursor"
  ></canvas>`,
  standalone: false,
  host: {
    class:
      '[scrollbar-width:thin] [scrollbar-color:var(--surface4)_var(--bg)] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-[var(--bg)] [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-[var(--surface4)] [&::-webkit-scrollbar-thumb:hover]:bg-[var(--muted)] block flex-1 overflow-auto bg-[var(--bg)] p-2',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpriteCanvasComponent implements AfterViewInit {
  @Input() cursor = 'default';
  @Output() mouseDown = new EventEmitter<MouseEvent>();
  @Output() mouseMove = new EventEmitter<MouseEvent>();
  @Output() mouseUp = new EventEmitter<void>();
  @Output() ready = new EventEmitter<ElementRef<HTMLCanvasElement>>();
  @ViewChild('editorCanvas', { static: true }) private canvas!: ElementRef<HTMLCanvasElement>;

  ngAfterViewInit(): void {
    this.ready.emit(this.canvas);
  }
}
