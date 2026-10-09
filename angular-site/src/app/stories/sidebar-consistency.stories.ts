import type { Meta, StoryObj } from '@storybook/angular-vite';
import { appStoryModule } from './story-page-shell';

const meta: Meta = {
  title: 'Layout/Sidebar Consistency',
  decorators: [appStoryModule],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj;

export const AllEditorSidebars: Story = {
  render: () => ({
    template: `
      <main class="flex min-h-screen flex-col gap-4 bg-[var(--bg)] p-4 text-[var(--text)]">
        <h1 class="m-0 text-lg font-bold">Editor sidebar layout contract</h1>
        <div class="grid min-h-0 flex-1 grid-cols-2 gap-4 xl:grid-cols-4">
          @for (name of names; track name) {
            <app-editor-sidebar data-testid="sidebar" style="height: 500px">
              <header class="shrink-0 border-b border-[var(--border)] p-4 font-semibold">{{ name }}</header>
              <app-editor-sidebar-scroll data-testid="sidebar-scroll" class="min-h-0 flex-1 overflow-y-auto p-4">
                <div class="flex flex-col gap-2">
                  @for (item of items; track item) {
                    <div class="rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3">{{ item }}</div>
                  }
                </div>
              </app-editor-sidebar-scroll>
            </app-editor-sidebar>
          }
        </div>
      </main>
    `,
    props: {
      names: ['Object Groups', 'Object Types', 'Sprites', 'Tiles', 'Audio', 'Screens'],
      items: ['Entry 1', 'Entry 2', 'Entry 3', 'Entry 4'],
    },
  }),
  play: async ({ canvasElement }) => {
    const sidebars = [...canvasElement.querySelectorAll<HTMLElement>('[data-testid="sidebar"]')];
    if (sidebars.length !== 6) throw new Error(`Expected 6 sidebars, got ${sidebars.length}`);
    for (const sidebar of sidebars) {
      const sidebarBox = sidebar.getBoundingClientRect();
      if (sidebarBox.height <= 400) {
        throw new Error(`Sidebar did not fill the available height: ${sidebarBox.height}`);
      }
      if (sidebarBox.width <= 200) {
        throw new Error('Sidebar collapsed below its minimum width');
      }
      if (getComputedStyle(sidebar).backgroundImage !== 'none') {
        throw new Error('Sidebar unexpectedly uses a gradient background');
      }
      const scrollRegion = sidebar.querySelector<HTMLElement>('[data-testid="sidebar-scroll"]');
      if (!scrollRegion || getComputedStyle(scrollRegion).overflowY !== 'auto') {
        throw new Error('Sidebar is missing its scroll region');
      }
      if (scrollRegion.scrollHeight < scrollRegion.clientHeight) {
        throw new Error('Sidebar scroll region has invalid dimensions');
      }
    }
  },
};

export const SidebarScrollInteraction: Story = {
  render: () => ({
    template: `
      <main class="min-h-screen bg-[var(--bg)] p-4 text-[var(--text)]">
        <app-editor-sidebar data-testid="sidebar" style="height: 520px">
          <h1 class="shrink-0 px-4 pt-4 text-base font-semibold">Scrollable sidebar</h1>
          <app-editor-sidebar-scroll data-testid="sidebar-scroll" class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            @for (item of items; track item) {
              <div class="border-b border-[var(--border)] py-4">{{ item }}</div>
            }
          </app-editor-sidebar-scroll>
        </app-editor-sidebar>
      </main>
    `,
    props: { items: Array.from({ length: 20 }, (_, index) => `Item ${index + 1}`) },
  }),
  play: async ({ canvasElement }) => {
    const scrollRegion = canvasElement.querySelector<HTMLElement>('[data-testid="sidebar-scroll"]');
    if (!scrollRegion) throw new Error('Missing sidebar scroll region');
    if (getComputedStyle(scrollRegion).overflowY !== 'auto') {
      throw new Error('Sidebar scroll region is not vertically scrollable');
    }
    const initialScrollTop = scrollRegion.scrollTop;
    scrollRegion.scrollTop = scrollRegion.scrollHeight;
    if (scrollRegion.scrollTop <= initialScrollTop) {
      throw new Error('Sidebar did not respond to programmatic scrolling');
    }
  },
};
