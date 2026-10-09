import type { Meta, StoryObj } from '@storybook/angular-vite';
import { SiteToolbarComponent } from '../layout/site-toolbar/site-toolbar.component';
import { appStoryModule } from './story-page-shell';

const meta: Meta<SiteToolbarComponent> = {
  title: 'Pages/Game',
  component: SiteToolbarComponent,
  decorators: [appStoryModule],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'desktop-1440x900' },
  },
};

export default meta;
type Story = StoryObj<SiteToolbarComponent>;

const gamePageTemplate = `
  <div class="flex min-h-screen flex-col bg-[var(--bg)]">
    <app-site-toolbar
      [activeTab]="'game'"
      [activeEditorSection]="'properties'"
      [parsedLevels]="[]"
      [selectedLevelId]="null"
      [hasEditorData]="false"
      [workerBusy]="false"
      [editorError]="''"
    ></app-site-toolbar>
    <main class="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg)]">
      <app-game-panel
      [activeTab]="'game'"
      [statusText]="statusText"
      [progressPct]="100"
      [overlayVisible]="false"
      [masterVolume]="masterVolume"
      [customResourcesLoaded]="false"
      [customResourcesName]="null"
      [customOptionsPreset]="'manual'"
      [customResourcesPreset]="'default'"
      [customSettingsPreset]="'manual'"
      [gameRestarting]="false"
      [editorTestDriveLevelEnabled]="true"
      [editorTestDriveLevelNumber]="1"
      ></app-game-panel>
    </main>
  </div>
`;

export const Ready: Story = {
  render: () => ({
    template: gamePageTemplate,
    props: {
      statusText: 'Ready to race',
      masterVolume: 80,
    },
  }),
};

export const Loading: Story = {
  render: () => ({
    template: gamePageTemplate,
    props: {
      statusText: 'Loading game data…',
      masterVolume: 65,
    },
  }),
};
