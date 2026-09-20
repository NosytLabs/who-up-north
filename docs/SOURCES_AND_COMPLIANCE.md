# Sources, methodology and compliance

_Last reviewed: 2026-09-20._

Who Up North? is an independent public-data visualization. It is not affiliated with, endorsed by, or operated by the Government of Canada, Statistics Canada, Environment and Climate Change Canada, the Open Government Portal or the Bank of Canada.

For model equations and assumptions, see [DATA_MODEL.md](DATA_MODEL.md).

## Statistics Canada — Time Use Survey

**Table 45-10-0105-01** — *Participation in selected activities over 24 hours, by type of day, gender, and age group*

- Product ID: `45100105`
- SDMX dataflow: `DF_45100105`
- Survey: 2022 Time Use Survey
- Collection period: July 2022 to July 2023
- Geography: Canada
- Population: non-institutionalized persons aged 15+ living in the ten provinces

The site uses eight non-overlapping activity groups and both weekday/weekend series.

The refresh job validates all 288 five-minute slots in each series. If a slot has a suppressed or missing component, the entire slot is mapped to the nearest complete official vector in the same series; the substitution is recorded instead of silently fabricated.

## Statistics Canada — population

**Table 17-10-0009-01** — *Population estimates, quarterly*

The build uses WDS `getDataFromCubePidCoordAndLatestNPeriods` with product ID `17100009` and geography in the first coordinate position.

Safeguards require:

- Canada plus all 13 province/territory values;
- the expected product ID;
- province/territory totals that reconcile to Canada;
- plausible values relative to the last verified snapshot.

**Table 17-10-0005-01** supplies the national age denominator. The site derives the 15+ share as all ages minus the 0–4, 5–9 and 10–14 groups.

The browser does not call these population endpoints per visitor. GitHub Actions refreshes them and publishes a reusable static snapshot.

## Statistics Canada — release wire

The dashboard also consumes official Statistics Canada developer services for context:

- major economic indicators JSON, including province/territory records for employment, unemployment, weekly earnings, building permits, retail sales and real GDP where published;
- major-release schedule JSON;
- WDS `getChangedCubeList`;
- WDS `getCubeMetadata` for names of selected changed tables.

The release countdown uses the published schedule. It is not a prediction.

## Canada map geometry

Primary geometry source:

- Statistics Canada 2021 Digital Boundary Files, province/territory layer.

The build requests GeoJSON, simplifies coordinate rings for display performance and validates the 13 expected region IDs.

If the StatCan ArcGIS service rejects a runner request, the build can use an official Government of Manitoba Canada province/territory GeoJSON listed in the federal Open Government catalogue. That fallback is reprojected to longitude/latitude, normalized to StatCan province/territory IDs and validated before publication.

Activity colours layered onto the geometry are this project's model output, not an official StatCan map variable.

## Open Government Portal

Read-only CKAN endpoints power:

- the recently changed dataset feed;
- catalogue search;
- a rolling count of records whose `metadata_modified` timestamp falls within the previous 24 hours.

Public read requests require no API key. The site does not create or modify catalogue records. Selecting a province/territory issues a read-only CKAN `package_search` query using Solr title syntax for that region name. If no title matches are returned, the client may fall back to a normal full-text query. Results are labelled as federal catalogue matches, not as records published by that provincial or territorial government.

## Environment and Climate Change Canada / MSC GeoMet

The site reads the public `weather-alerts` collection from `api.weather.gc.ca`.

Displayed content is limited to official alert labels/areas plus links back to the official weather service. The site does not use an LLM to rewrite warning meaning or instructions.

Attribution:

> Data source: Environment and Climate Change Canada.

## Bank of Canada Valet API

Endpoint family: Bank of Canada Valet, series `FXUSDCAD`.

The value shown is the latest published **daily average** of the US dollar in Canadian dollars. It is not a live tradable quote.

The browser may check the API directly on page load/manual refresh, but it is not polled every five minutes because the underlying statistic updates daily.

Attribution:

> Data source: Bank of Canada.

No Bank of Canada logo or wordmark is reproduced.

## Open Government Licence — Canada

Where applicable, information is reused under the Open Government Licence – Canada.

The project:

- attributes its sources;
- does not imply official status or endorsement;
- does not use government logos, signatures or symbols as project branding.

## Jev / TypeSafe System One

Jev is optional and is not a statistical source.

During a build, it receives aggregate public statistics plus a closed list of already-computed fact candidates. It can choose which supported fact to feature but cannot alter counts, percentages or source data.

If it is unavailable, the build uses a deterministic fact candidate.

## Privacy

The site does not request:

- precise geolocation;
- camera or microphone access;
- account identity;
- contact details;
- user-written prompts.

The browser makes ordinary HTTPS requests to public official APIs for direct signal checks. Those services can observe normal network metadata such as the visitor's IP address.

The core time-use model can run entirely from the static Pages artifact.

## Accuracy labels

The UI separates:

- **Live clock** — current device time converted to Canadian time zones.
- **Statistical model** — historical survey distributions applied to a configured representative reference clock for each province. Provinces that span multiple real-world time zones are not subdivided by time zone.
- **Direct API check** — a successful current request to an official public endpoint.
- **Build snapshot** — data captured during the most recent successful GitHub Actions refresh.
- **Daily statistic** — a value such as Bank of Canada FX that may be freshly checked but is published only daily.

“Live” never means that individual people are being observed.

## Publication safeguards

Before deployment, the workflow:

1. downloads and validates the weekday/weekend time-use profile;
2. refreshes and validates population/age data;
3. snapshots official public-signal and StatCan release feeds;
4. fetches and validates Canada boundary geometry;
5. optionally selects a verified fact;
6. runs model, generated-data and Pages-workflow tests;
7. builds the static artifact;
8. deploys only after the checks succeed.

If core time-use data is unavailable, the browser fails closed and shows no substitute activity statistics.
