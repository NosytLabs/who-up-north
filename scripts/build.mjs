import { access, cp, copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { validateDataBundle } from './validate-data.mjs';

const smokeOnly = process.argv.includes('--allow-missing-data');
if (!smokeOnly) await validateDataBundle('public/data');
else console.warn('UI smoke build only: data may be missing. Do not deploy this artifact.');

await rm('dist', { recursive: true, force: true });
await mkdir('dist/src', { recursive: true });
await mkdir('dist/docs', { recursive: true });

await copyFile('index.html', 'dist/index.html');
await cp('src', 'dist/src', { recursive: true });

if (existsSync('public')) {
  await cp('public', 'dist', { recursive: true });
}

if (existsSync('docs')) {
  await cp('docs', 'dist/docs', { recursive: true });
}

await writeFile('dist/.nojekyll', '');
if (!smokeOnly) await validateDataBundle('dist/data');

for (const file of [
  'dist/index.html',
  'dist/src/main.js',
  'dist/src/model.js',
  'dist/src/styles.css',
  'dist/favicon.svg',
  'dist/docs/SOURCES_AND_COMPLIANCE.md',
]) {
  await access(file);
}

console.log('Built dist/ with GitHub Pages asset paths intact.');
