# Data model

This document describes only the statistical/model logic. Source provenance and licence notes live in [SOURCES_AND_COMPLIANCE.md](SOURCES_AND_COMPLIANCE.md).

## Scope

The behavioural source is Statistics Canada Table **45-10-0105-01** from the 2022 Time Use Survey.

The selected table represents:

- Canada-level activity participation rates;
- persons aged 15+;
- the ten provinces;
- weekday and weekend profiles;
- 288 five-minute intervals per day.

Territories are displayed only for local-time context.

## Activity partition

The model uses eight non-overlapping groups:

1. Sleep
2. Personal care
3. Eating
4. Transportation
5. Paid work, studying or learning
6. Unpaid domestic and care work
7. Socializing and leisure
8. Other activities

Parent and child groups are not added together.

## Per-province calculation

For province `p` at instant `t`:

```text
local_time(p, t)
→ weekday/weekend bucket
→ 5-minute survey code
→ activity-rate vector
```

For activity `a`:

```text
scope_population(p)
  = province_population(p) × national_15_plus_share

activity_count(p, a, t)
  = scope_population(p) × activity_rate(a, local_time(p,t)) / 100
```

Awake share is:

```text
awake_rate(p,t) = 100 - sleep_rate(p,t)
```

National activity counts are the sum of the ten provincial model counts. National percentages divide those sums by the total modelled 15+ population across the ten provinces.

## Why province-local time matters

A single Eastern-time slice multiplied by Canada's population would apply the wrong part of the daily profile to western and Atlantic provinces.

At one instant, Vancouver, Winnipeg, Toronto, Halifax and St. John's occupy different five-minute survey intervals. The model evaluates each province first, then combines them.

## StatCan time coding

Table 45-10-0105-01 starts its time-code sequence at 04:00:

```text
1   = 04:00–04:04
97  = 12:00–12:04
240 = 23:55–23:59
241 = 00:00–00:04
288 = 03:55–03:59
```

No interpolation occurs between official intervals. A five-minute value is held for the interval it represents.

## Population alignment

Quarterly total population comes from Table **17-10-0009-01** through the coordinate-based WDS endpoint.

The build:

1. requests Canada plus all 13 provinces/territories;
2. validates the returned product ID;
3. requires every geography;
4. checks that province/territory totals reconcile to Canada;
5. compares each result with the last verified snapshot to catch geography-order mistakes.

The survey is 15+, so the model derives a national 15+ share from Table **17-10-0005-01**:

```text
15+ share
= (all ages - age 0–4 - age 5–9 - age 10–14) / all ages
```

That national share is applied to each province. This is an approximation; it does not use province-specific age structures.

## Suppressed five-minute cells

Some survey cells are suppressed or incomplete.

The build does **not** fabricate a missing activity. If any component is missing, it replaces the entire interval with the nearest complete official five-minute vector from the same weekday/weekend series.

Every substitution is recorded in `public/data/time-use-profile.json` under `gapFill`.

## Province cards and map

Province cards and map colours are model outputs, not province-specific survey estimates.

For each province they show:

- local clock time;
- current modelled awake share/count;
- leading non-sleep activity.

The interactive map uses verified province/territory geometry. Geometry is simplified for display performance only; region identity is validated before publication.

## Time machine and model path

The time slider and future-path cards do not forecast behaviour.

They apply the same official weekday/weekend profile to another clock instant:

```text
shifted instant → local province clocks → matching official survey slots
```

This answers “what does this statistical model look like at another time?” rather than “what will people actually do in the future?”
