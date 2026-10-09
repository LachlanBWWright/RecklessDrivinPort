import type { Meta, StoryObj } from '@storybook/angular-vite';
import { SiteToolbarComponent } from '../layout/site-toolbar/site-toolbar.component';
import { appStoryModule } from './story-page-shell';

const meta: Meta<SiteToolbarComponent> = {
  title: 'Pages/Editor Tabs',
  component: SiteToolbarComponent,
  decorators: [appStoryModule],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'desktop-1440x900' },
  },
};

export default meta;
type Story = StoryObj<SiteToolbarComponent>;

const editorTabTemplate = `
  <div class="flex min-h-screen flex-col bg-[var(--bg)]">
    <app-site-toolbar
      [activeTab]="'editor'"
      [activeEditorSection]="activeSection"
      [parsedLevels]="[]"
      [selectedLevelId]="null"
      [hasEditorData]="true"
      [workerBusy]="false"
      [editorError]="''"
    ></app-site-toolbar>
    <main class="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg)]">
      @switch (activeSection) {
      @case ('properties') {
      <app-editor-properties-section></app-editor-properties-section>
      }
      @case ('object-groups') {
      <app-editor-object-groups-section></app-editor-object-groups-section>
      }
      @case ('object-types') {
      <app-editor-object-types-section></app-editor-object-types-section>
      }
      @case ('objects') {
      <app-editor-objects-section></app-editor-objects-section>
      }
      @case ('sprites') {
      <app-editor-sprites-section></app-editor-sprites-section>
      }
      @case ('tiles') {
      <app-editor-tiles-section></app-editor-tiles-section>
      }
      @case ('audio') {
      <app-editor-audio-section></app-editor-audio-section>
      }
      @case ('screens') {
      <app-editor-screens-section></app-editor-screens-section>
      }
      @case ('strings') {
      <app-editor-strings-section></app-editor-strings-section>
      }
      }
    </main>
  </div>
`;

const tabStory = (activeSection: SiteToolbarComponent['activeEditorSection']): Story => ({
  render: () => ({
    template: editorTabTemplate,
    props: { activeSection },
  }),
  play: async ({ canvasElement }) => {
    const panel = canvasElement.querySelector<HTMLElement>(`app-editor-${activeSection}-section`);
    if (!panel) throw new Error(`Missing ${activeSection} editor section`);
    const card = panel.querySelector(':scope > mat-card');
    if (!card) return;
    const sidebar = panel.querySelector<HTMLElement>('aside, app-editor-objects-sidebar');
    if (!sidebar) return;
    const sidebarBox = sidebar.getBoundingClientRect();
    if (sidebarBox.width <= 250 || sidebarBox.height <= 100) {
      throw new Error('Editor sidebar does not satisfy the minimum layout contract');
    }
    if (getComputedStyle(sidebar).backgroundImage !== 'none') {
      throw new Error('Editor sidebar unexpectedly uses a gradient background');
    }
    const scrollRegion = sidebar.querySelector<HTMLElement>(
      '.editor-sidebar-scroll, [class*="overflow-y-auto"]',
    );
    if (!scrollRegion || getComputedStyle(scrollRegion).overflowY !== 'auto') {
      throw new Error('Editor sidebar is missing its scroll region');
    }
  },
});

export const Properties = tabStory('properties');
export const ObjectGroups = tabStory('object-groups');
export const ObjectTypes = tabStory('object-types');
export const ObjectsAndTracks = tabStory('objects');
export const Sprites = tabStory('sprites');
export const Tiles = tabStory('tiles');
export const Audio = tabStory('audio');
export const Screens = tabStory('screens');
export const Strings = tabStory('strings');
