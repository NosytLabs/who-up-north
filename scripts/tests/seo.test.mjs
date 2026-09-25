import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');

test('static site exposes crawl-control files', () => {
  assert.ok(existsSync(new URL('public/robots.txt', root)), 'public/robots.txt must exist');
  assert.ok(existsSync(new URL('public/sitemap.xml', root)), 'public/sitemap.xml must exist');

  const robots = readFileSync(new URL('public/robots.txt', root), 'utf8');
  const sitemap = readFileSync(new URL('public/sitemap.xml', root), 'utf8');

  assert.match(robots, /Sitemap:\s+https:\/\/nosytlabs\.github\.io\/who-up-north\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/nosytlabs\.github\.io\/who-up-north\/<\/loc>/);
});

test('homepage exposes WebSite and Dataset structured data', () => {
  assert.match(html, /"@type"\s*:\s*"WebSite"/);
  assert.match(html, /"@type"\s*:\s*"Dataset"/);
  assert.match(html, /"license"\s*:/);
  assert.match(html, /"isBasedOn"\s*:/);
});
