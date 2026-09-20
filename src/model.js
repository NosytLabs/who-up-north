export const ACTIVITIES = [
  { code: '1', key: 'sleep', label: 'Sleep', short: 'sleeping', colour: '#7d8cff' },
  { code: '3', key: 'personal', label: 'Personal care', short: 'personal care', colour: '#72d9ff' },
  { code: '4', key: 'eating', label: 'Eating', short: 'eating', colour: '#61e6a2' },
  { code: '5', key: 'travel', label: 'Transportation', short: 'in transit', colour: '#f6c85f' },
  { code: '6', key: 'work', label: 'Paid work, studying or learning', short: 'work / study', colour: '#ff6675' },
  { code: '7', key: 'care', label: 'Unpaid domestic and care work', short: 'household / care', colour: '#c98cff' },
  { code: '10', key: 'leisure', label: 'Socializing and leisure', short: 'socializing / leisure', colour: '#43d9d0' },
  { code: '14', key: 'other', label: 'Other activities', short: 'other', colour: '#b7c1c9' },
];

export const PROVINCES = [
  { id: 'bc', name: 'British Columbia', abbr: 'B.C.', population: 5_646_420, tz: 'America/Vancouver' },
  { id: 'ab', name: 'Alberta', abbr: 'Alta.', population: 5_057_077, tz: 'America/Edmonton' },
  { id: 'sk', name: 'Saskatchewan', abbr: 'Sask.', population: 1_266_092, tz: 'America/Regina' },
  { id: 'mb', name: 'Manitoba', abbr: 'Man.', population: 1_503_865, tz: 'America/Winnipeg' },
  { id: 'on', name: 'Ontario', abbr: 'Ont.', population: 16_103_890, tz: 'America/Toronto' },
  { id: 'qc', name: 'Quebec', abbr: 'Que.', population: 9_016_222, tz: 'America/Toronto' },
  { id: 'nb', name: 'New Brunswick', abbr: 'N.B.', population: 866_497, tz: 'America/Moncton' },
  { id: 'ns', name: 'Nova Scotia', abbr: 'N.S.', population: 1_090_852, tz: 'America/Halifax' },
  { id: 'pe', name: 'Prince Edward Island', abbr: 'P.E.I.', population: 181_715, tz: 'America/Halifax' },
  { id: 'nl', name: 'Newfoundland and Labrador', abbr: 'N.L.', population: 547_910, tz: 'America/St_Johns' },
];

export const TERRITORIES = [
  { id: 'yt', name: 'Yukon', abbr: 'Y.T.', population: 48_493, tz: 'America/Whitehorse' },
  { id: 'nt', name: 'Northwest Territories', abbr: 'N.W.T.', population: 45_808, tz: 'America/Yellowknife' },
  { id: 'nu', name: 'Nunavut', abbr: 'Nun.', population: 42_215, tz: 'America/Iqaluit' },
];

export const AGE_15_PLUS_SHARE =
  (41_651_653 - 1_871_184 - 2_138_350 - 2_251_628) / 41_651_653;

export const VERIFIED_POPULATION = {
  strategy: 'verified-snapshot',
  asOf: '2026-04-01',
  canada: 41_417_056,
  values: Object.fromEntries(
    [...PROVINCES, ...TERRITORIES].map(region => [region.id, region.population]),
  ),
  age15PlusShare: AGE_15_PLUS_SHARE,
};

export function timeCodeForMinute(minute) {
  const fiveMinuteIndex = Math.floor(minute / 5);
  return ((fiveMinuteIndex - 48 + 288) % 288) + 1;
}

export function labelForTimeCode(code) {
  const fiveMinuteIndex = (Number(code) - 1 + 48) % 288;
  const minute = fiveMinuteIndex * 5;
  const hour = Math.floor(minute / 60) % 24;
  return `${String(hour).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = type => parts.find(part => part.type === type)?.value;
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));

  return {
    weekday: get('weekday'),
    hour,
    minute,
    label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    minuteOfDay: hour * 60 + minute,
  };
}

function dayBucket(weekday) {
  return weekday === 'Sat' || weekday === 'Sun' ? 'weekends' : 'weekdays';
}

function populationFor(data, region) {
  return Number(data?.values?.[region.id] ?? region.population);
}

function dominantAwakeActivity(activities) {
  return ACTIVITIES
    .filter(activity => activity.key !== 'sleep')
    .reduce((best, activity) =>
      activities[activity.key] > activities[best.key] ? activity : best,
    ).key;
}

export function buildCanadaSnapshot(
  profile,
  population = VERIFIED_POPULATION,
  at = new Date(),
) {
  if (!profile?.weekdays || !profile?.weekends) {
    throw new Error('Time-use profile unavailable');
  }

  const instant = at instanceof Date ? at : new Date(at);
  const age15PlusShare = population.age15PlusShare ?? AGE_15_PLUS_SHARE;
  const totals = Object.fromEntries(ACTIVITIES.map(activity => [activity.key, 0]));
  let scopedPopulationTotal = 0;

  const regions = PROVINCES.map(region => {
    const local = localParts(instant, region.tz);
    const timeCode = timeCodeForMinute(local.minuteOfDay);
    const bucket = dayBucket(local.weekday);
    const slice = profile[bucket]?.[String(timeCode)];

    if (!slice) {
      throw new Error(`Missing ${bucket} slot ${timeCode}`);
    }

    const populationValue = populationFor(population, region);
    const scopedPopulation = populationValue * age15PlusShare;
    const counts = {};
    const activities = {};

    for (const activity of ACTIVITIES) {
      const rate = Number(slice[activity.key]);
      activities[activity.key] = rate;
      counts[activity.key] = Math.round(scopedPopulation * rate / 100);
      totals[activity.key] += scopedPopulation * rate / 100;
    }

    scopedPopulationTotal += scopedPopulation;

    const awakePercent = 100 - activities.sleep;

    return {
      ...region,
      population: populationValue,
      scopedPopulation: Math.round(scopedPopulation),
      localTime: local.label,
      weekday: local.weekday,
      timeSlot: labelForTimeCode(timeCode),
      awakePercent: +awakePercent.toFixed(1),
      awakeCount: Math.round(scopedPopulation * awakePercent / 100),
      dominant: dominantAwakeActivity(activities),
      activities,
      counts,
      surveyIncluded: true,
    };
  });

  const counts = Object.fromEntries(
    ACTIVITIES.map(activity => [activity.key, Math.round(totals[activity.key])]),
  );

  const activities = Object.fromEntries(
    ACTIVITIES.map(activity => [
      activity.key,
      +((totals[activity.key] / scopedPopulationTotal) * 100).toFixed(1),
    ]),
  );

  const awakeCount = scopedPopulationTotal - totals.sleep;

  return {
    status: 'ready',
    instant: instant.toISOString(),
    national: {
      scopePopulation: Math.round(scopedPopulationTotal),
      awakeCount: Math.round(awakeCount),
      awakePercent: +((awakeCount / scopedPopulationTotal) * 100).toFixed(1),
      counts,
      activities,
    },
    regions,
    territories: TERRITORIES.map(region => ({
      ...region,
      population: populationFor(population, region),
      localTime: localParts(instant, region.tz).label,
      surveyIncluded: false,
    })),
    activities: ACTIVITIES,
    sources: {
      profile: profile.source,
      population,
    },
  };
}

export function factCandidates(snapshot) {
  const topActivity = ACTIVITIES
    .filter(activity => activity.key !== 'sleep')
    .map(activity => ({
      ...activity,
      value: snapshot.national.activities[activity.key],
      count: snapshot.national.counts[activity.key],
    }))
    .sort((a, b) => b.value - a.value)[0];

  return [
    {
      id: 'awake',
      kicker: 'National pulse',
      title: `${snapshot.national.awakePercent.toFixed(1)}% of the modelled 15+ population is awake`,
      detail: `About ${snapshot.national.awakeCount.toLocaleString('en-CA')} people across the ten-province survey scope.`,
    },
    {
      id: 'top',
      kicker: 'Top awake activity',
      title: `${topActivity.label} leads the awake mix`,
      detail: `${topActivity.value.toFixed(1)}% of the modelled population, about ${topActivity.count.toLocaleString('en-CA')} people.`,
    },
    {
      id: 'truth',
      kicker: 'What “live” means',
      title: 'Live-to-the-clock, not live surveillance',
      detail: 'The clock is live; the behavioural profile comes from Statistics Canada’s 2022 Time Use Survey. No individual is tracked.',
    },
  ];
}

export function deterministicFact(snapshot) {
  const candidates = factCandidates(snapshot);
  return {
    mode: 'deterministic',
    generatedAt: new Date().toISOString(),
    snapshotInstant: snapshot.instant,
    selected: candidates[1] || candidates[0],
  };
}
