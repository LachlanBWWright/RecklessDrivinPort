import type { Meta, StoryObj } from '@storybook/angular-vite';
import { SiteToolbarComponent } from '../layout/site-toolbar/site-toolbar.component';
import { appStoryModule } from './story-page-shell';

const meta: Meta<SiteToolbarComponent> = {
  title: 'Pages/Editor',
  component: SiteToolbarComponent,
  decorators: [appStoryModule],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'desktop-1440x900' },
  },
};

export default meta;
type Story = StoryObj<SiteToolbarComponent>;

const editorPageTemplate = `
  <div class="flex min-h-screen flex-col bg-[var(--bg)]">
    <app-site-toolbar
      [activeTab]="'editor'"
      [activeEditorSection]="'properties'"
      [parsedLevels]="[]"
      [selectedLevelId]="null"
      [hasEditorData]="hasEditorData"
      [workerBusy]="workerBusy"
      [editorError]="editorError"
    ></app-site-toolbar>
    <main class="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg)]">
      <section class="flex w-full min-h-0 flex-1 flex-col overflow-hidden">
      @if (!hasEditorData && !workerBusy) {
      <mat-card class="w-full border border-dashed border-[var(--border)] bg-[var(--surface)]">
      <mat-card-content>
      <div class="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <mat-icon class="!h-14 !w-14 !text-[56px] text-[var(--surface4)]">folder_open</mat-icon>
      <h3 class="text-[1.2rem] font-bold text-[var(--on-surface)]">No data loaded</h3>
      <p class="max-w-[600px] leading-[1.6] text-[var(--muted)]">
      Load a <code class="rounded bg-[var(--surface3)] px-1.5 py-px font-mono text-[0.85em] text-[var(--accent2)]">resources.dat</code> file to begin editing.
      </p>
      </div>
      </mat-card-content>
      </mat-card>
      }
      @if (workerBusy) {
      <mat-card class="w-full border border-dashed border-[var(--border)] bg-[var(--surface)]">
      <mat-card-content>
      <div class="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <mat-spinner diameter="40"></mat-spinner>
      <p class="max-w-[600px] leading-[1.6] text-[var(--on-surface)]">Decompressing resources.dat…</p>
      <p class="text-[0.85rem] text-[var(--muted)]">The editor will be ready shortly.</p>
      </div>
      </mat-card-content>
      </mat-card>
      }
      </section>
    </main>
  </div>
`;

export const Empty: Story = {
  render: () => ({
    template: editorPageTemplate,
    props: {
      hasEditorData: false,
      workerBusy: false,
      editorError: '',
    },
  }),
};

export const LoadingResources: Story = {
  render: () => ({
    template: editorPageTemplate,
    props: {
      hasEditorData: false,
      workerBusy: true,
      editorError: '',
    },
  }),
};
