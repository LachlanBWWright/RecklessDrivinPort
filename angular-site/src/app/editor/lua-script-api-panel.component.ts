import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { LuaScriptApiCompletionComponent } from './lua-script-api-completion.component';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { LuaApiGroup } from '../lua-script-api.types';
import type { ScriptValidationIssue } from '../level-editor.service';

@Component({
  selector: 'app-lua-script-api-panel',
  templateUrl: './lua-script-api-panel.component.html',
  host: {
    class: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
  },
  standalone: true,
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule, LuaScriptApiCompletionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LuaScriptApiPanelComponent {
  @Input() apiGroups: readonly LuaApiGroup[] = [];
  @Input() currentIssues: readonly ScriptValidationIssue[] = [];
  @Output() issueSelected = new EventEmitter<ScriptValidationIssue>();
  @Output() useSnippet = new EventEmitter<string | undefined>();

  query = '';
  activeGroup = 'all';
  readonly collapsedGroups = new Set<string>();

  get hasIssues(): boolean {
    return this.currentIssues.length > 0;
  }

  get hasErrors(): boolean {
    return this.currentIssues.some((issue) => issue.severity === 'error');
  }

  get hasWarnings(): boolean {
    return !this.hasErrors && this.currentIssues.length > 0;
  }

  get totalCount(): number {
    return this.apiGroups.reduce((total, group) => total + group.completions.length, 0);
  }

  get filteredGroups(): readonly LuaApiGroup[] {
    const query = this.query.trim().toLowerCase();
    return this.apiGroups
      .filter((group) => this.activeGroup === 'all' || group.id === this.activeGroup)
      .map((group) => ({
        ...group,
        completions: group.completions.filter(
          (completion) =>
            query.length === 0 ||
            `${completion.label} ${completion.detail} ${completion.documentation}`
              .toLowerCase()
              .includes(query),
        ),
      }))
      .filter((group) => group.completions.length > 0);
  }

  groupCount(groupId: string): number {
    return this.apiGroups.find((group) => group.id === groupId)?.completions.length ?? 0;
  }

  isCollapsed(groupId: string): boolean {
    return this.collapsedGroups.has(groupId);
  }

  toggleGroup(groupId: string): void {
    if (this.collapsedGroups.has(groupId)) this.collapsedGroups.delete(groupId);
    else this.collapsedGroups.add(groupId);
  }

  resetFilter(): void {
    this.query = '';
    this.activeGroup = 'all';
  }

  onQueryInput(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.query = event.target.value;
  }
}
