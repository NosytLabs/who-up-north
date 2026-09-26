import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateDataBundle } from '../validate-data.mjs';
import { ACTIVITIES } from '../../src/model.js';

async function bundle(run) {
  const dir = await mkdtemp(join(tmpdir(), 'data-bundle-'));
  const generatedAt = '2026-09-26T12:00:00Z';
  const vector = Object.fromEntries(ACTIVITIES.map(a => [a.key, 100 / ACTIVITIES.length]));
  const bucket = Object.fromEntries(Array.from({ length: 288 }, (_, i) => [i + 1, vector]));
  const profile = { generatedAt, weekdays: bucket, weekends: bucket };
  const population = { generatedAt, canada: 1300, age15PlusShare: .8, values: Object.fromEntries(['nb','ns','pe','nl','qc','on','mb','sk','ab','bc','yt','nt','nu'].map(id => [id, 100])) };
  const geo = { generatedAt, type: 'FeatureCollection', features: ['10','11','12','13','24','35','46','47','48','59','60','61','62'].map(PRUID => ({ properties: { PRUID }, geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] } })) };
  const files = { 'time-use-profile.json': profile, 'population.json': population, 'canada-provinces.geojson': geo, 'live-signals.json': { generatedAt } };
  const save = () => Promise.all(Object.entries(files).map(([name, value]) => writeFile(join(dir, name), JSON.stringify(value))));
  try { await save(); await run({ dir, files, save }); } finally { await rm(dir, { recursive: true }); }
}
test('a complete captured bundle can be published', () => bundle(async ({dir}) => { assert.equal(await validateDataBundle(dir), true); }));
test('missing data fails publication, including the live-site 404 regression', () => bundle(async ({dir}) => { await rm(join(dir, 'time-use-profile.json')); await assert.rejects(validateDataBundle(dir), /npm run refresh/); }));
test('partial survey data is rejected', () => bundle(async ({dir,files,save}) => { delete files['time-use-profile.json'].weekdays[100]; await save(); await assert.rejects(validateDataBundle(dir), /Incomplete survey vector/); }));
test('missing regional population is rejected', () => bundle(async ({dir,files,save}) => { delete files['population.json'].values.pe; await save(); await assert.rejects(validateDataBundle(dir), /regional population/); }));
test('duplicate boundaries are rejected', () => bundle(async ({dir,files,save}) => { files['canada-provinces.geojson'].features[1].properties.PRUID = '10'; await save(); await assert.rejects(validateDataBundle(dir), /boundary bundle/); }));
