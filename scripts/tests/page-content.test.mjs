import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { ACTIVITIES } from '../../src/model.js';

const root = new URL('../../', import.meta.url);
const main = readFileSync(new URL('src/main.js', root), 'utf8');
const html = readFileSync(new URL('index.html', root), 'utf8');
const start = main.indexOf('\n') + 1;
const end = main.indexOf("$('focus-reset').onclick=");
assert.ok(end > start, 'The real page controller must be available');

// Exercise real controller functions with a clock and the minimal DOM they use.
function page(now = '2026-09-21T13:00:00Z', query = '') {
  let clock = Date.parse(now);
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      textContent: id === 'time-shift-label' ? 'LIVE' : '',
      innerHTML: id === 'pulse-mode' ? '<i></i> LIVE CLOCK' : '', value: id === 'time-shift' ? '0' : '', href: '',
      classList: { toggle() {} },
    });
    return elements.get(id);
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const context = vm.createContext({
    ACTIVITIES, URL, Date: Clock,
    document: { getElementById: element, querySelectorAll: () => [] },
    location: { href: `https://example.test/who-up-north/${query}` },
  });
  vm.runInContext(main.slice(start, end).replaceAll('import.meta.url', JSON.stringify(new URL('src/main.js', root).href)), context);
  const controller = vm.runInContext('({state,nextRelease,renderReleaseClock,renderLive,renderFreshness,countdown,setShift})', context);
  return { ...controller, element, context, setNow(value) { clock = Date.parse(value); } };
}
const release = (date, title) => ({ date, title, description: title, url: 'https://www150.statcan.gc.ca/n1/dai-quo/index-eng.html' });

for (const [shift, label] of [['3', '+3H'], ['-2.5', '−2.5H']]) {
  test(`shared offset ${shift} initializes matching controls instead of LIVE`, () => {
    const p = page(undefined, `?region=ns&shift=${shift}`);
    vm.runInContext(main.slice(main.indexOf('const initialUrl='), main.indexOf('setInterval(renderTicker')), p.context);
    assert.equal(p.state.shift, Number(shift));
    assert.equal(p.state.focus, 'ns');
    assert.equal(p.element('time-shift-label').textContent, label);
    assert.equal(Number(p.element('time-shift').value), Number(shift));
    assert.equal(p.element('pulse-mode').innerHTML, 'TIME MACHINE');
  });
}
for (const value of ['Infinity', 'NaN', '13', '-13']) {
  test(`invalid offset ${value} stays in live mode`, () => {
    const p = page(undefined, `?shift=${value}`);
    vm.runInContext(main.slice(main.indexOf('const initialUrl='), main.indexOf('setInterval(renderTicker')), p.context);
    assert.equal(p.state.shift, 0);
    assert.equal(p.element('time-shift-label').textContent, 'LIVE');
  });
}
test('expired schedule never reuses an old release as the next release', () => {
  const p = page(); p.state.live = { statcan: { schedule: [release('2026-09-18', 'Old release')] } };
  assert.equal(p.nextRelease(), null);
  p.renderReleaseClock();
  assert.equal(p.element('statcan-next-title').textContent, 'No upcoming release in this snapshot');
  assert.equal(p.element('statcan-countdown').textContent, 'CHECK THE DAILY');
});
test('unsorted release dates select the earliest upcoming release', () => {
  const p = page(); p.state.live = { statcan: { schedule: [release('2026-09-25', 'Later'), release('2026-09-22', 'Next')] } };
  assert.equal(p.nextRelease().item.title, 'Next');
});
test('malformed schedule entries are skipped without breaking the clock', () => {
  const p = page(); p.state.live = { statcan: { schedule: [null, release('2026-99-99', 'Invalid'), release('2026-09-22', 'Valid')] } };
  assert.equal(p.nextRelease().item.title, 'Valid');
});
test('non-array schedule has an honest empty state', () => {
  const p = page(); p.state.live = { statcan: { schedule: {} } };
  assert.equal(p.nextRelease(), null);
});
test('clock rollover updates the release title as well as its countdown', () => {
  const p = page('2026-09-21T12:29:00Z');
  p.state.live = { statcan: { schedule: [release('2026-09-21', 'First'), release('2026-09-22', 'Second')] } };
  p.renderReleaseClock();
  assert.equal(p.element('statcan-next-title').textContent, 'First');
  p.setNow('2026-09-21T13:01:00Z'); p.renderReleaseClock();
  assert.equal(p.element('statcan-next-title').textContent, 'Second');
  assert.match(p.element('statcan-next-date').textContent, /Sep 22/);
});
test('release time is not evidence of an actual publication', () => {
  assert.equal(page().countdown(-60000), 'CHECK THE DAILY');
  assert.equal(page().countdown(NaN), 'SCHEDULE UNAVAILABLE');
});
for (const [live, caption] of [[false, 'alert records in saved snapshot'], [true, 'current alert records']]) {
  test(`${live ? 'direct' : 'cached'} weather is labelled accurately`, () => {
    const p = page();
    p.state.live = { generatedAt: '2026-09-20T07:00:00Z', weather: { live, checkedAt: live ? '2026-09-21T13:00:00Z' : undefined, numberMatched: 4, items: [] } };
    p.renderLive();
    assert.equal(p.element('weather-caption').textContent, caption);
    assert.equal(p.element('weather-count').textContent, '4');
  });
}
test('stale direct weather is no longer labelled current', () => {
  const p = page();
  p.state.live = { generatedAt: '2026-09-20T07:00:00Z', weather: { live: true, checkedAt: '2026-09-21T12:00:00Z', numberMatched: 4, items: [] } };
  p.renderLive();
  assert.equal(p.element('weather-caption').textContent, 'alert records in saved snapshot');
});
test('build timestamp remains separate from a successful live API check', () => {
  const p = page();
  p.state.live = { generatedAt: '2026-09-20T07:00:00Z' };
  p.state.lastCheckAt = new Date('2026-09-21T13:00:00Z'); p.state.directOk = 3; p.state.directExpected = 3;
  p.renderFreshness();
  assert.match(p.element('hero-freshness').textContent, /3\/3 CHECKED/);
  assert.equal(p.element('snapshot-captured').textContent, '2026-09-20 07:00 UTC');
});
test('method text explains paused snapshots rather than promising a schedule', () => {
  assert.doesNotMatch(html, /15-minute schedule|LOADING SCHEDULED SNAPSHOT/);
  assert.match(html, /[Aa]utomatic snapshot refresh is paused/);
  assert.match(html, /id="snapshot-captured"/);
});
test('JavaScript-disabled visitors receive an explanation and source links', () => {
  assert.match(html, /<noscript>[\s\S]*JavaScript[\s\S]*href="#method"[\s\S]*<\/noscript>/);
});
test('repository documentation matches the paused deployment policy', () => {
  const readme = readFileSync(new URL('README.md', root), 'utf8');
  assert.doesNotMatch(readme, /scheduled every 15 minutes|configured 15-minute schedule|pushes to `main`;/);
  assert.match(readme, /[Aa]utomatic snapshot refresh is paused/);
});
test('cached Open Government count describes its saved 24-hour window', () => {
  const p = page();
  p.state.live = { generatedAt: '2026-09-20T07:00:00Z', openGovernment: { live: false, changedLast24h: 27, items: [] } };
  p.renderFreshness();
  assert.match(p.element('open-window-label').textContent, /before the saved check/);
});
