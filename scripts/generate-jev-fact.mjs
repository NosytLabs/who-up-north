import { readFile, writeFile } from 'node:fs/promises';

import {
  buildCanadaSnapshot,
  deterministicFact,
  factCandidates,
} from '../src/model.js';

const dataDir = new URL('../public/data/', import.meta.url);

const profile = JSON.parse(
  await readFile(new URL('time-use-profile.json', dataDir), 'utf8'),
);
const population = JSON.parse(
  await readFile(new URL('population.json', dataDir), 'utf8'),
);

const snapshot = buildCanadaSnapshot(profile, population, new Date());
let output = deterministicFact(snapshot);

if (process.env.AI_GATEWAY_API_KEY) {
  try {
    const { experimental_evaluate: evaluate } = await import('ai');
    const candidates = factCandidates(snapshot);
    const criteria = Object.fromEntries(
      candidates.map(candidate => [
        candidate.id,
        `${candidate.title}. ${candidate.detail}`,
      ]),
    );

    const result = await evaluate({
      model: 'typesafe-ai/jev',
      state: {
        instant: snapshot.instant,
        candidates,
        national: snapshot.national,
      },
      questions: {
        interesting: {
          type: 'choice',
          instructions:
            'Choose the most interesting, shareable fact strictly supported by the supplied candidates.',
          criteria,
        },
      },
      providerOptions: {
        gateway: { zeroDataRetention: true },
      },
    });

    const answer = result.answers.interesting;
    const selected =
      candidates.find(candidate => candidate.id === answer.choice)
      || candidates[0];

    output = {
      mode: 'jev',
      model: 'typesafe-ai/jev',
      generatedAt: new Date().toISOString(),
      snapshotInstant: snapshot.instant,
      selected,
      probability: answer.probabilities?.[answer.choice] ?? null,
    };
  } catch (error) {
    output = {
      ...output,
      error: String(error.message || error),
    };
  }
}

await writeFile(
  new URL('jev-fact.json', dataDir),
  JSON.stringify(output),
);

console.log('Fact mode:', output.mode);
