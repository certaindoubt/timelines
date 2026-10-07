import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TIMELINES_DIR, readJson, extractYear, ensureSchema } from './lib.mjs';

const MAX_EVENTS = 26;
const MIN_EVENTS = 4;
let failures = 0;

function check(ok, message, timeline) {
  if (ok) return;
  failures++;
  console.log(`  [FAIL] ${timeline.slug}: ${message}`);
}

function validate(t) {
  console.log(`\n== ${t.title} (${t.slug}, via ${t.via}, ${t.events.length} events) ==`);

  try {
    ensureSchema(t);
  } catch (err) {
    check(false, err.message, t);
  }

  const events = t.events ?? [];
  check(events.length >= MIN_EVENTS, `only ${events.length} events (< ${MIN_EVENTS})`, t);
  check(events.length <= MAX_EVENTS, `${events.length} events exceed cap ${MAX_EVENTS}`, t);

  const years = events.map((e) => e.year);
  const sorted = [...years].sort((a, b) => a - b);
  const dupYears = years.filter((y, i) => years.indexOf(y) !== i).length;
  if (dupYears > 0) {
    console.log(`  [warn] ${t.slug}: ${dupYears} shared year values (usually fine for dense eras)`);
  }

  // years must be sorted ascending
  for (let i = 1; i < years.length; i++) {
    if (years[i] < years[i - 1]) {
      check(false, `events out of order at index ${i} (${years[i - 1]} -> ${years[i]})`, t);
      break;
    }
  }

  // sanity year range (allow deep ancient history for archaeology pages, but flag extreme)
  const min = Math.min(...years);
  const max = Math.max(...years);
  check(max <= 2600, `max year ${max} is implausibly far in the future`, t);
  check(min >= -200000, `min year ${min} is implausibly ancient`, t);
  check(max - min >= 1, `flat timeline: all events share year ${min}`, t);

  // flags worth a manual look: heavy clustering of recent years often signals
  // BC dates misparsed as AD (e.g. "2000 BC" -> 2000) or a truncated source.
  const modern = years.filter((y) => y > 1980 && y <= 2026).length;
  const allRecent =
    modern === years.length && (max - min) < 40 && min > 1950;
  if (allRecent && years.length >= MAX_EVENTS) {
    console.log(`  [warn] ${t.slug}: all ${years.length} events cluster in ${min}-${max}; verify dates`);
    failures++;
  }

  // each event needs title + text + references
  let missingRefs = 0;
  for (const [i, e] of events.entries()) {
    if (!e.title || String(e.title).length < 2) check(false, `event ${i} missing title`, t);
    if (!e.text || String(e.text).length < 6) check(false, `event ${i} missing text`, t);
    if (!e.year || Number.isNaN(+e.year)) check(false, `event ${i} missing year`, t);
    if (!Array.isArray(e.references) || e.references.length === 0) missingRefs++;
  }
  check(missingRefs === 0, `${missingRefs}/${events.length} events have no references`, t);

  // one bad routed marker: leftover wiki markup in the plain text
  for (const e of events) {
    const joined = String(e.text) + ' ' + String(e.title);
    if (/\{\{|\}\}|\[\[|\]\]|<ref|<\/ref|<br|==+/.test(joined)) {
      check(false, 'event text still contains wiki markup', t);
      break;
    }
  }
}

const files = readdirSync(TIMELINES_DIR).filter((f) => f.endsWith('.json'));
if (process.argv.includes('--json')) {
  const out = {};
  for (const f of files) out[f] = readJson(join(TIMELINES_DIR, f));
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

for (const f of files) {
  try {
    validate(readJson(join(TIMELINES_DIR, f)));
  } catch (err) {
    failures++;
    console.log(`[FAIL] ${f}: crashed (${err.message})`);
  }
}
console.log(`\n${files.length} timelines checked; ${failures} problems.`);
process.exit(failures ? 1 : 0);