# Data model

## Core formula

For every included province `p` at instant `t`:

```text
local_time(p,t)
→ weekday/weekend bucket
→ 5-minute StatCan time code
→ Canada-level activity participation vector
→ province population × national 15+ share × activity rate
```

National activity counts are the sum of those ten provincial model counts. National percentages use the modelled 15+ population across the ten provinces as denominator.

## Why time zones matter

A single Eastern-time profile multiplied by Canada's population would be wrong. At one instant, Vancouver, Toronto, Halifax and St. John's occupy different survey slots. The model therefore evaluates each province separately before combining it.

## Time coding

StatCan's table starts its code list at 04:00:

```text
1   = 04:00–04:04
97  = 12:00–12:04
240 = 23:55–23:59
241 = 00:00–00:04
288 = 03:55–03:59
```

No interpolation is used between official slots. The value is held for the five minutes represented by that StatCan interval.

## Province cards

The source time-use table is Canada-level. A province card is therefore **not** a claim that StatCan measured a province-specific behavioural rate. It is the Canada profile evaluated at that province's local clock and population-scaled for the visualization.

## Territories

The selected Time Use Survey table covers the ten provinces. Territories are shown only as local-time context and excluded from national activity estimates.

## Population age alignment

Quarterly population estimates are total population. To align approximately with the survey's 15+ scope, the build calculates the latest national 15+ share from StatCan population-by-age data and applies it to provincial totals.

## Suppressed five-minute cells

Some StatCan five-minute cells are unavailable/suppressed. The build does not synthesize a missing component. Instead, it replaces an incomplete slot with the nearest **complete official five-minute vector** from the same weekday/weekend series and records each mapping under `gapFill` in the generated profile. On the current source release, this affects 21 weekend slots and no weekday slots.
