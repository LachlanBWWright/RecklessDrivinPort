import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-rearrange-levels-dialog',
  imports: [DragDropModule, MatDialogModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Rearrange levels</h2>
    <mat-dialog-content>
      <p class="mb-4 text-sm text-[var(--muted)]" id="rearrange-help">
        Drag levels into play order. Level numbers update when you save.
      </p>
      <div
        cdkDropList
        (cdkDropListDropped)="drop($event)"
        class="level-list"
        role="list"
        aria-describedby="rearrange-help"
      >
        @for (id of order; track id; let position = $index) {
          <div cdkDrag cdkDragLockAxis="y" class="level-row" role="listitem">
            <span class="position">{{ position + 1 }}</span>
            <span class="level-name">Level {{ id - 139 }}</span>
            <button
              mat-icon-button
              cdkDragHandle
              class="drag-handle"
              [attr.aria-label]="
                'Move level ' + (id - 139) + '. Use up and down arrow keys to reorder.'
              "
              (keydown.arrowup)="move(position, -1, $event)"
              (keydown.arrowdown)="move(position, 1, $event)"
            >
              <mat-icon>drag_indicator</mat-icon>
            </button>
          </div>
        }
      </div>
      <span class="sr-only" aria-live="polite">{{ announcement }}</span>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button [disabled]="!changed" (click)="save()">Save order</button>
    </mat-dialog-actions>
  `,
  styles: `
    .level-list {
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    .level-row {
      display: flex;
      align-items: center;
      gap: 16px;
      min-height: 48px;
      padding: 0 8px 0 16px;
      background: var(--surface2);
      color: var(--text);
    }
    .level-row + .level-row {
      border-top: 1px solid var(--border);
    }
    .position {
      width: 20px;
      text-align: right;
      font-variant-numeric: tabular-nums;
      color: var(--muted);
    }
    .level-name {
      flex: 1;
      font-size: 14px;
    }
    .drag-handle {
      cursor: grab;
      touch-action: none;
      color: var(--muted);
    }
    .drag-handle:active {
      cursor: grabbing;
    }
    .cdk-drag-preview {
      box-sizing: border-box;
      border-radius: 8px;
      box-shadow: 0 4px 16px #0004;
    }
    .cdk-drag-placeholder {
      opacity: 0.25;
    }
    .cdk-drag-animating {
      transition: transform 160ms ease;
    }
    @media (prefers-reduced-motion: reduce) {
      .cdk-drag-animating {
        transition: none;
      }
    }
  `,
})
export class RearrangeLevelsDialogComponent {
  private readonly original = inject<number[]>(MAT_DIALOG_DATA);
  private readonly dialog =
    inject<MatDialogRef<RearrangeLevelsDialogComponent, number[]>>(MatDialogRef);
  readonly order = [...this.original];
  announcement = '';
  get changed(): boolean {
    return this.order.some((id, index) => id !== this.original[index]);
  }
  drop(event: CdkDragDrop<number[]>): void {
    this.move(event.previousIndex, event.currentIndex - event.previousIndex);
  }
  move(index: number, offset: number, event?: Event): void {
    event?.preventDefault();
    const target = index + offset;
    if (target < 0 || target >= this.order.length) return;
    moveItemInArray(this.order, index, target);
    this.announcement =
      'Level ' + (this.order[target] - 139) + ' moved to position ' + (target + 1);
  }
  save(): void {
    this.dialog.close([...this.order]);
  }
}
