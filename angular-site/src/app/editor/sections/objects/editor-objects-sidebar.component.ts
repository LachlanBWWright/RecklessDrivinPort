import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { EditorObjectsSectionComponent } from './editor-objects-section.component';

@Component({
  selector: 'app-editor-objects-sidebar',
  templateUrl: './editor-objects-sidebar.component.html',
  host: {
    class:
      'flex min-h-0 w-[320px] shrink-0 flex-col max-[1024px]:w-full max-[1024px]:max-h-[42vh] max-[1024px]:flex-[0_0_auto]',
  },
  standalone: false,
  // The owner mutates this state object while its identity stays stable.
  changeDetection: ChangeDetectionStrategy.Default,
})
export class EditorObjectsSidebarComponent {
  @Input({ required: true }) state!: EditorObjectsSectionComponent;

  onTabKeydown(event: KeyboardEvent, current: 'objects' | 'groups' | 'tracks'): void {
    const tabs: ('objects' | 'groups' | 'tracks')[] = ['objects', 'groups', 'tracks'];
    const index = tabs.indexOf(current);
    let next = index;
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        next = (index + tabs.length - 1) % tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    const tab = tabs[next];
    this.host.setSidebarTab(tab);
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget
        .closest('[role="tablist"]')
        ?.querySelector<HTMLButtonElement>(`[data-mode="${tab}"]`)
        ?.focus();
    }
  }

  get host(): EditorObjectsSectionComponent {
    return this.state;
  }
}
