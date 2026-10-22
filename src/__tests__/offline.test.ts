import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('the app is self contained', () => {
  it('loads nothing from another origin', () => {
    const html = read('../../index.html');

    expect(html).not.toMatch(/(src|href)="https?:\/\//);
  });

  it('bundles the fonts instead of asking a font server', () => {
    const css = read('../styles/fonts.css');

    expect(css).toMatch(/@font-face/);

    for (const match of css.matchAll(/url\(([^)]+)\)/g)) {
      expect(match[1]).not.toMatch(/^https?:/);
    }
  });

  it('sends every request of the built app to this origin only', () => {
    const config = read('../../vite.config.ts');

    expect(config).not.toMatch(/https?:\/\//);
  });
});
