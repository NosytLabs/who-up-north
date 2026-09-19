# Sources, methodology and compliance

_Last reviewed: 2026-09-19._

Who Up North? is an independent public-data visualization. It is not affiliated with, endorsed by, or operated by the Government of Canada, Statistics Canada, Environment and Climate Change Canada, or the Bank of Canada.

## 1. Statistics Canada — Time Use Survey

Primary behavioural source:

- Table 45-10-0105-01: **Participation in selected activities over 24 hours, by type of day, gender, and age group**
- Product ID: `45100105`
- SDMX dataflow: `DF_45100105`
- Survey: 2022 Time Use Survey, collected July 2022 to July 2023
- Geography in the table: Canada
- Population: non-institutionalized persons aged 15+ living in the 10 provinces

The table contains participation rates for five-minute time-of-day intervals. The project uses one non-overlapping partition:

1. Sleep
2. Personal care
3. Eating
4. Transportation
5. Paid work, studying or learning
6. Unpaid domestic and care work
7. Socializing and leisure
8. Other activities

Parent and child activity groups are never summed together. This prevents double-counting.

The data refresh script requests both weekday and weekend series and validates all 288 five-minute slots before publication.

## 2. Statistics Canada — population weights

Population source:

- Table 17-10-0009-01: **Population estimates, quarterly**
- WDS vectors 1–15 for Canada/provinces/territories, with the historical combined NWT/Nunavut vector omitted.

Survey-denominator alignment:

- Table 17-10-0005-01: **Population estimates on July 1, by age and gender**
- Canada / total gender
- `All ages` minus the `0–4`, `5–9`, and `10–14` groups yields the national 15+ share.

The scheduled build refreshes both sources. If that refresh fails, the application may use the last explicitly verified Statistics Canada snapshot embedded in source control metadata; the strategy and reference date are carried in `population.json`.

Statistics Canada WDS documentation notes that WDS is intended for discrete data requests, operates continuously with some overnight table locking, and documents rate limits. The static architecture avoids per-visitor WDS calls: GitHub Actions performs one compact refresh and the result is reused by all visitors.

## 3. Open Government Portal CKAN API

Endpoint used:

`https://open.canada.ca/data/en/api/3/action/recently_changed_packages_activity_list`

The Open Government API documentation describes the Portal API as live CKAN access. Public read-only API calls do not require an API key, and the Portal supports GET requests.

The site uses the feed only for a small “recently changed dataset” signal. It does not publish or modify Open Government records.

## 4. Environment and Climate Change Canada / MSC GeoMet

Endpoint family:

`https://api.weather.gc.ca/`

The project reads the public `weather-alerts` collection and displays short official alert names, affected areas/provinces, and links to the official feed.

The ECCC Data Services End-use Licence permits reuse, including commercial use, subject to its conditions. It specifically requires attribution and says weather alerts must be reproduced without altering their content or intent.

Attribution used by this project:

> Data source: Environment and Climate Change Canada.

The visualization does not rewrite warning meaning or use an LLM to summarize alert instructions.

## 5. Bank of Canada Valet API

Endpoint used:

`https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1`

The Valet API requires no registration or API key. The project caches the response in the static Pages artifact and may also attempt a direct browser refresh.

Displayed value: latest published daily average USD/CAD series (`FXUSDCAD`). This is explicitly labelled as a daily average, not a real-time tradable FX quote.

Bank of Canada terms require attribution, due diligence around accuracy, and no suggestion of endorsement. They also prohibit circumventing request-frequency limits. The Bank recommends caching data that only updates daily; the scheduled-build fallback follows that recommendation.

Attribution used by this project:

> Data source: Bank of Canada.

No Bank of Canada logo or wordmark is reproduced.

## 6. Open Government Licence — Canada

Where applicable, information is reused under the Open Government Licence – Canada. The project provides source attribution and does not imply official status or endorsement.

Government symbols, departmental signatures and official logos are not used as project branding.

## 7. Jev / TypeSafe System One

Jev is not a statistical source.

During a GitHub Actions build, `scripts/generate-jev-fact.mjs` can use `typesafe-ai/jev` through Vercel AI Gateway when the repository owner supplies `AI_GATEWAY_API_KEY` as a GitHub Actions secret.

The model receives only aggregate public statistics already computed by this project and a closed list of candidate facts. It selects which supported fact is interesting to feature. It cannot alter source values.

If the model is unavailable or no API key is configured, the build writes a deterministic candidate instead.

## 8. Privacy

The site does not request:

- precise browser geolocation;
- camera or microphone access;
- account identity;
- contact information;
- user-written prompts.

The browser does make ordinary HTTPS requests to public official APIs for live-signal cards when available. Those services can necessarily observe normal network metadata such as the visitor IP address. The core time-use model does not require those live requests and can run entirely from the static Pages artifact.

## 9. Accuracy labels

The UI intentionally separates three concepts:

- **Live clock:** current device time converted to Canadian time zones.
- **Statistical model:** 2022–23 time-use participation rates applied to the current local five-minute interval.
- **Live public signals:** current/recent official API records such as weather alerts and Open Government activity.

“Live” never means individual people are being observed.

## 10. Operational safeguards

Before publishing a Pages artifact, the workflow:

1. downloads the official StatCan time-use profile;
2. validates 288 weekday + 288 weekend slots;
3. verifies every displayed activity exists in each slot;
4. checks the non-overlapping activity partition;
5. refreshes population and 15+ denominator data;
6. snapshots live official feeds;
7. generates the optional Jev card;
8. runs local integrity tests;
9. deploys only if the build succeeds.

If core time-use data is missing, the client fails closed and shows no substitute activity statistics.
