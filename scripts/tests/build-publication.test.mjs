import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('a publication build serves the tracked data bundle at the runtime data URLs', async () => {
  const root = new URL('../../', import.meta.url);
  const directory = await mkdtemp(join(tmpdir(), 'north-publication-'));
  try {
    for (const name of ['index.html', 'src', 'public', 'docs', 'data']) {
      await cp(new URL(name, root), join(directory, name), { recursive: true });
    }
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('scripts/build.mjs', root))], {
      cwd: directory,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    for (const name of ['time-use-profile.json', 'population.json', 'canada-provinces.geojson', 'live-signals.json', 'jev-fact.json']) {
      const data = JSON.parse(await readFile(join(directory, 'dist/data', name), 'utf8'));
      assert.equal(typeof data, 'object', `${name} must be served as JSON`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
