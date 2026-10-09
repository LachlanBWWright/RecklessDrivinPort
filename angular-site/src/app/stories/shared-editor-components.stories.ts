import type { Meta, StoryObj } from '@storybook/angular-vite';
import { EditorDetailCardComponent } from '../editor/editor-detail-card.component';
import { appStoryModule } from './story-page-shell';

const meta: Meta<EditorDetailCardComponent> = {
  title: 'Components/Editor Detail Cards',
  component: EditorDetailCardComponent,
  decorators: [appStoryModule],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<EditorDetailCardComponent>;

export const ConsistentCards: Story = {
  render: () => ({
    template: `
      <main class="grid min-h-screen grid-cols-3 gap-4 bg-[var(--bg)] p-6 text-[var(--text)]">
        @for (label of labels; track label) {
          <app-editor-detail-card>
            <h2 class="m-0 text-base font-semibold">{{ label }}</h2>
            <p class="mt-2 text-sm text-[var(--muted)]">Shared detail card content.</p>
          </app-editor-detail-card>
        }
      </main>
    `,
    props: { labels: ['Core', 'Scripting', 'Flags'] },
  }),
  play: async ({ canvasElement }) => {
    const cards = [...canvasElement.querySelectorAll<HTMLElement>('app-editor-detail-card > div')];
    if (cards.length !== 3) throw new Error(`Expected 3 detail cards, got ${cards.length}`);
    const firstStyle = getComputedStyle(cards[0]);
    for (const card of cards) {
      const style = getComputedStyle(card);
      if (style.padding !== firstStyle.padding)
        throw new Error('Detail card padding is inconsistent');
      if (style.borderRadius !== firstStyle.borderRadius) {
        throw new Error('Detail card radius is inconsistent');
      }
      if (style.backgroundImage !== 'none')
        throw new Error('Detail card has an unexpected gradient');
    }
  },
};
