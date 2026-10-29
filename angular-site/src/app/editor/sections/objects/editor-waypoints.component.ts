import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  type OnChanges,
  type SimpleChanges,
} from '@angular/core';
import type { TrackSeg } from '../../../level-editor.types';
import type { TrackWaypointRef } from '../../../level-editor.types';
import { isValidWaypointEdit, type TrackWaypointEdit } from '../../../waypoint-editing';

@Component({
  selector: 'app-editor-waypoints',
  standalone: false,
  host: { class: 'block w-full shrink-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4 pt-2" aria-label="AI waypoints">
      <div class="grid grid-cols-[90px_minmax(0,1fr)] gap-2">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="min-w-0">
          <mat-label>Track</mat-label>
          <select
            matNativeControl
            #trackInput
            [ngModel]="track"
            (ngModelChange)="selectTrack($event)"
            [disabled]="busy"
          >
            <option value="up">Up</option>
            <option value="down">Down</option>
          </select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="min-w-0">
          <mat-label>Waypoint</mat-label>
          <select
            matNativeControl
            #pointInput
            [ngModel]="selectedIndex"
            (ngModelChange)="selectIndex($event)"
            [disabled]="busy || points.length === 0"
          >
            @for (point of points; track $index) {
              <option [ngValue]="$index">{{ $index + 1 }} ({{ point.x }}, {{ point.y }})</option>
            }
          </select>
        </mat-form-field>
      </div>
      @if (selectedPoint; as point) {
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-full">
          <mat-label>Target speed (m/s)</mat-label>
          <input
            matInput
            #speedInput
            type="number"
            min="0"
            step="any"
            [value]="point.velo"
            [disabled]="busy"
            (change)="changeSpeed(speedInput.value)"
          />
        </mat-form-field>
        <mat-radio-group
          class="flex flex-col"
          aria-label="Traffic behavior"
          [value]="behavior"
          [disabled]="busy"
          (change)="changeBehavior($event.value)"
        >
          <mat-radio-button [value]="1">Overtake</mat-radio-button>
          <mat-radio-button [value]="0">No overtake</mat-radio-button>
          <mat-radio-button [value]="2">No stop</mat-radio-button>
        </mat-radio-group>
        <p class="text-xs leading-relaxed text-[var(--muted)]">
          @if (behavior === 1) {
            Overtaking-capable cars move 7 m left and aim for twice the target speed.
          } @else if (behavior === 2) {
            Skips braking for nearby traffic. Cars can still brake to turn.
          } @else {
            Cars follow the route at the target speed and brake for nearby traffic.
          }
        </p>
        <p class="text-xs text-[var(--muted)]">
          Canvas: ⇄ overtake · ⊘ no stop. Green = active; grey = off.
        </p>
        <button mat-stroked-button [disabled]="busy || points.length < 2" (click)="openRange()">
          Apply to range…
        </button>
        @if (rangeOpen) {
          <div
            class="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-3"
            aria-label="Apply to waypoint range"
          >
            <p class="text-sm">
              Apply this waypoint’s speed and traffic behavior to a range on the {{ track }} track.
            </p>
            <div class="grid grid-cols-2 gap-2">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>First waypoint</mat-label>
                <select
                  matNativeControl
                  #first
                  [ngModel]="rangeStart"
                  (ngModelChange)="rangeStart = $event"
                >
                  @for (entry of points; track $index) {
                    <option [ngValue]="$index">{{ $index + 1 }}</option>
                  }
                </select>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Last waypoint</mat-label>
                <select
                  matNativeControl
                  #last
                  [ngModel]="rangeEnd"
                  (ngModelChange)="rangeEnd = $event"
                >
                  @for (entry of points; track $index) {
                    <option [ngValue]="$index">{{ $index + 1 }}</option>
                  }
                </select>
              </mat-form-field>
            </div>
            <p class="text-xs text-[var(--muted)]">
              Both endpoints are included. This changes only the selected track.
            </p>
            <div class="flex justify-end gap-2">
              <button mat-button (click)="rangeOpen = false">Cancel</button>
              <button mat-flat-button [disabled]="busy" (click)="applyRange()">Apply</button>
            </div>
          </div>
        }
      } @else {
        <p class="text-sm text-[var(--muted)]">
          No waypoints in this track. Right-click on the canvas to add one.
        </p>
      }
      @if (error) {
        <p role="alert" class="text-sm text-red-500">{{ error }}</p>
      }
    </div>
  `,
})
export class EditorWaypointsComponent implements OnChanges {
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selection']) this.rangeOpen = false;
  }
  @Input() trackUp: readonly TrackSeg[] = [];
  @Input() trackDown: readonly TrackSeg[] = [];
  @Input() selection: TrackWaypointRef | null = null;
  @Input() busy = false;
  @Output() waypointEdit = new EventEmitter<TrackWaypointEdit>();
  @Output() selectionChange = new EventEmitter<TrackWaypointRef>();
  error = '';
  rangeOpen = false;
  rangeStart = 0;
  rangeEnd = 0;

  openRange(): void {
    this.rangeStart = this.selectedIndex;
    this.rangeEnd = this.selectedIndex;
    this.rangeOpen = true;
  }

  applyRange(): void {
    const point = this.selectedPoint;
    if (!point) return;
    this.waypointEdit.emit({
      track: this.track,
      index: Math.min(this.rangeStart, this.rangeEnd),
      endIndex: Math.max(this.rangeStart, this.rangeEnd),
      velo: point.velo,
      flags: this.behavior,
    });
    this.rangeOpen = false;
  }

  get track(): 'up' | 'down' {
    return this.selection?.track ?? 'up';
  }
  get points(): readonly TrackSeg[] {
    return this.track === 'up' ? this.trackUp : this.trackDown;
  }
  get selectedIndex(): number {
    return Math.min(this.selection?.segIdx ?? 0, this.points.length - 1);
  }
  get selectedPoint(): TrackSeg | undefined {
    return this.points[this.selectedIndex];
  }

  selectTrack(value: string): void {
    if (value !== 'up' && value !== 'down') return;
    this.error = '';
    this.rangeOpen = false;
    this.selectionChange.emit({ track: value, segIdx: 0 });
  }

  selectIndex(value: string | number): void {
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= this.points.length) return;
    this.error = '';
    this.rangeOpen = false;
    this.selectionChange.emit({ track: this.track, segIdx: index });
  }

  get behavior(): number {
    const flags = this.selectedPoint?.flags ?? 0;
    return flags & 2 ? 2 : flags === 1 ? 1 : 0;
  }

  changeBehavior(value: unknown): void {
    if (value !== 0 && value !== 1 && value !== 2) return;
    const point = this.selectedPoint;
    if (point) this.emitEdit(point.velo, value);
  }

  changeSpeed(value: string): void {
    const point = this.selectedPoint;
    if (point) this.emitEdit(value.trim() === '' ? NaN : Number(value), point.flags);
  }

  private emitEdit(velo: number, flags: number): void {
    const edit = { track: this.track, index: this.selectedIndex, velo, flags };
    if (!isValidWaypointEdit(edit)) {
      this.error = 'Enter a finite, non-negative speed.';
      return;
    }
    this.error = '';
    this.waypointEdit.emit(edit);
  }
}
