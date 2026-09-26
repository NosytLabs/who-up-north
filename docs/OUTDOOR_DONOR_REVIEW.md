# Hunting/fishing donor and live UX review

Reviewed September 26, 2026. Baseline: `0b925e4`.

This repository is a Canada-wide statistical dashboard, not the intended Atlantic hunting/fishing product. Reuse its explicit provenance, honest missing-data states and region selection ideas. Do not transplant national awake estimates, macroeconomic indicators, AI fact selection or the single-document route structure into the new resource. The original dashboard retains its separate purpose.

## Confirmed live defect

The published HTML at `https://nosytlabs.github.io/who-up-north/` returned 200, but all four required files under `/who-up-north/data/` returned 404: `time-use-profile.json`, `population.json`, `canada-provinces.geojson` and `live-signals.json`. Browser review showed CORE DATA UNAVAILABLE, an empty map and incomplete loading states. The code now prevents this artifact from being built through the normal publication command.

## Changes

- `scripts/validate-data.mjs` checks required bundles, valid capture timestamps, all weekday/weekend survey slots, regional population and the complete 13-region boundary set. `scripts/build.mjs` validates both input and copied output before accepting a publication build.
- CI may explicitly build with `--allow-missing-data` for local/UI smoke checks. This mode warns against deployment. The existing manual Pages workflow still refreshes data and runs the guarded default build; automatic schedules remain paused.
- `src/main.js` ends the fact/model/map loading states when core data fails, disables unusable controls, and shows source-oriented fallback copy. Missing StatCan data renders unavailable rather than staying in a loading state.
- `src/styles.css` makes provenance readable, wraps long pills and gives pill/suggestion buttons a 44px minimum height.
- `index.html` adds a Sources navigation destination and distinguishes official inputs from the project's derived model.

## Verification

`npm run check` passed all 40 tests, including five data-bundle cases and two new unavailable-state cases. `npm run refresh` successfully regenerated local ignored data from the official sources, and the guarded `npm run build` passed with that bundle. Browser review of the resulting local artifact showed populated national figures, the 13-region map and snapshot labels. Visible pill controls measured at least 44px and freshness text measured 13px. No modelled figures were invented to hide missing data.

The regenerated bundle is ignored build input, not source code committed to this PR. The manual Pages workflow regenerates it before publication. The live site remains unchanged until this fix is reviewed and the refreshed build is deployed. No DNS, Pages settings, schedules or production deployment were changed by this review.
