import type { StorybookConfig } from '@storybook/angular-vite';

const config: StorybookConfig = {
  "stories": [
    "../src/app/stories/**/*.stories.ts"
  ],
  "addons": [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-onboarding"
  ],
  "framework": {
    "name": "@storybook/angular-vite",
    "options": {
      "compodoc": true,
      "compodocArgs": [
        "-e",
        "json",
        "-d",
        "."
      ]
    }
  }
};
export default config;
