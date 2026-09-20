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

The data refresh script requests both weekday and weekend series and validates all 288 five-minute slots before publication. If StatCan suppresses any component within a slot, the build copies the nearest complete official five-minute vector from the same weekday/weekend series and records the substitution in the generated profile; it does not fabricate the missing component. On the current source release, 21 weekend slots require this treatment and no weekday slots do.

## 2. Statistics Canada — population weights

Population source:

- Table 17-10-0009-01: **Population estimates, quarterly**
- WDS method `getDataFromCubePidCoordAndLatestNPeriods` with product ID `17100009` and the table's geography member code in the first coordinate position. The build validates the returned product ID, requires all 13 province/territory values, reconciles their sum to Canada, and compares each generated value with the last verified snapshot to catch member-order mistakes.

Survey-denominator alignment:

- Table 17-10-0005-01: **Population estimates on July 1, by age and gender**
- Canada / total gender
- `All ages` minus the `0–4`, `5–9`, and `10–14` groups yields the national 15+ share.

The scheduled build refreshes both sources. If that refresh fails, the application may use the last explicitly verified Statistics Canada snapshot embedded in source control metadata; the strategy and reference date are carried in `population.json`.

Statistics Canada WDS documentation notes that WDS is intended for discrete data requests, operates continuously with some overnight table locking, and documents rate limits. The static architecture avoids per-visitor WDS population calls: GitHub Actions performs one compact coordinate-based refresh and the result is reused by all visitors.

## 3. Statistics Canada — release wire and map

Additional official Statistics Canada services used by the dashboard:

- Major economic indicators JSON: `ind-econ.json`.
- Major-release schedule JSON: `schedule-key_indicators-eng.json`.
- WDS `getChangedCubeList` for the most recent business-day table-release count.
- 2021 Digital Boundary Files province/territory ArcGIS layer, requested as GeoJSON and simplified during the build for browser rendering.

These feeds are informational context around the core time-use model. The release schedule is shown as a countdown to the published release date/time; it is not a prediction. The build also calls `getCubeMetadata` for a small set of tables returned by the latest `getChangedCubeList` response so the release wire can show table names instead of opaque product IDs. The map geometry is official geography, while activity colours layered onto it are this project's statistical visualization. Statistics Canada's 2021 province/territory digital boundary service is the primary source. If that ArcGIS service rejects the GitHub runner request, the build falls back to the Government of Manitoba's April 2022 Canada provinces/territories GeoJSON listed in the federal Open Government catalogue, reprojects it from EPSG:3857 to longitude/latitude, normalizes PRUIDs and validates all 13 regions before publication.

## 4. Open Government Portal CKAN API

Endpoint used:

`https://open.canada.ca/data/en/api/3/action/recently_changed_packages_activity_list`

The Open Government API documentation describes the Portal API as live CKAN access. Public read-only API calls do not require an API key, and the Portal supports GET requests.

The site uses the feed for a small “recently changed dataset” signal, direct catalogue search, and a `package_search` count filtered to records whose `metadata_modified` timestamp falls within the previous 24 hours. It does not publish or modify Open Government records.

## 5. Environment and Climate Change Canada / MSC GeoMet

Endpoint family:

`https://api.weather.gc.ca/`

The project reads the public `weather-alerts` collection and displays short official alert names, affected areas/provinces, and links to the official feed.

The ECCC Data Services End-use Licence permits reuse, including commercial use, subject to its conditions. It specifically requires attribution and says weather alerts must be reproduced without altering their content or intent.

Attribution used by this project:

> Data source: Environment and Climate Change Canada.

The visualization does not rewrite warning meaning or use an LLM to summarize alert instructions.

## 6. Bank of Canada Valet API

Endpoint used:

`https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1`

The Valet API requires no registration or API key. The project caches the response in the static Pages artifact and may also attempt a direct browser refresh.

Displayed value: latest published daily average USD/CAD series (`FXUSDCAD`). This is explicitly labelled as a daily average, not a real-time tradable FX quote.

Bank of Canada terms require attribution, due diligence around accuracy, and no suggestion of endorsement. They also prohibit circumventing request-frequency limits. The Bank recommends caching data that only updates daily; the scheduled-build fallback follows that recommendation.

Attribution used by this project:

> Data source: Bank of Canada.

No Bank of Canada logo or wordmark is reproduced.

## 7. Open Government Licence — Canada

Where applicable, information is reused under the Open Government Licence – Canada. The project provides source attribution and does not imply official status or endorsement.

Government symbols, departmental signatures and official logos are not used as project branding.

## 8. Jev / TypeSafe System One

Jev is not a statistical source.

During a GitHub Actions build, `scripts/generate-jev-fact.mjs` can use `typesafe-ai/jev` through Vercel AI Gateway when the repository owner supplies `AI_GATEWAY_API_KEY` as a GitHub Actions secret.

The model receives only aggregate public statistics already computed by this project and a closed list of candidate facts. It selects which supported fact is interesting to feature. It cannot alter source values.

If the model is unavailable or no API key is configured, the build writes a deterministic candidate instead.

## 9. Privacy

The site does not request:

- precise browser geolocation;
- camera or microphone access;
- account identity;
- contact information;
- user-written prompts.

The browser does make ordinary HTTPS requests to public official APIs for live-signal cards when available. Those services can necessarily observe normal network metadata such as the visitor IP address. The core time-use model does not require those live requests and can run entirely from the static Pages artifact.

## 10. Accuracy labels

The UI intentionally separates three concepts:

- **Live clock:** current device time converted to Canadian time zones.
- **Statistical model:** 2022–23 time-use participation rates applied to the current local five-minute interval.
- **Live public signals:** current/recent official API records such as weather-alert feature records and Open Government activity. Direct API connectivity is labelled separately from the age of the underlying statistic (for example, Bank of Canada daily averages).

“Live” never means individual people are being observed.

## 11. Operational safeguards

Before publishing a Pages artifact, the workflow:

1. downloads the official StatCan time-use profile;
2. validates 288 weekday + 288 weekend slots;
3. verifies every displayed activity exists in each slot;
4. checks the non-overlapping activity partition;
5. refreshes population and 15+ denominator data;
6. snapshots live official feeds plus StatCan release-wire data;
7. fetches and validates all 13 official province/territory boundary features;
8. validates generated population geography mappings against the verified snapshot;
9. generates the optional Jev fact selection;
10. runs local integrity and Pages workflow tests;
11. deploys only if the build succeeds.

If core time-use data is missing, the client fails closed and shows no substitute activity statistics.
