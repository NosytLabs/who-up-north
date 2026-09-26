import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateCoreData } from '../src/model.js';

export async function validateDataBundle(directory) {
  const read = async name => {
    try { return JSON.parse(await readFile(join(directory, name), 'utf8')); }
    catch { throw new Error(`Missing or invalid ${name}. Run npm run refresh before building for publication. Use --allow-missing-data only for a local UI smoke test.`); }
  };
  const [profile, population, geo, signals] = await Promise.all([
    read('time-use-profile.json'), read('population.json'), read('canada-provinces.geojson'), read('live-signals.json'),
  ]);
  for (const [name, data] of Object.entries({profile, population, geo, signals})) {
    if (!Number.isFinite(Date.parse(data.generatedAt))) throw new Error(`${name}: missing valid source capture timestamp`);
  }
  validateCoreData(profile, population);
  const ids = new Set(geo.features?.map(f => String(f.properties?.PRUID)));
  if (geo.type !== 'FeatureCollection' || geo.features?.length !== 13 || !['10','11','12','13','24','35','46','47','48','59','60','61','62'].every(id => ids.has(id)) || !geo.features.every(f => f.geometry?.coordinates?.length)) throw new Error('Incomplete Canada boundary bundle');
  return true;
}
