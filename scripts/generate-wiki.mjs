import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  DATA_DIR,
  TIMELINES_DIR,
  QUEUE_FILE,
  readJson,
  writeJson,
  slugify,
  fetchWikipedia,
  extractYear,
  makeIndexEntry,
} from './lib.mjs';

function extractLinks(text) {
  const links = [];
  const re = /\[\[([^\[\]]+)\]\]/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[1];
    const target = raw.split('|')[0].trim();
    if (!target || /^(File|Image|Category|Template|Help|Special):/i.test(target)) continue;
    const url = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(target.replace(/ /g, '_'));
    const label = raw.split('|')[1] || target;
    if (label && label.length > 1) links.push({ label, url });
  }
  return links;
}

// Remove balanced {{...}} templates, <ref>...</ref>, and <!-- comments -->
export function stripBalanced(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  const skip = (depth, open2, close2) => {
    let d = depth;
    while (i < n) {
      const ch = text[i];
      if (text.startsWith(open2, i)) { d++; i += open2.length; continue; }
      if (text.startsWith(close2, i)) { d--; i += close2.length; break; }
      i++;
    }
  };
  while (i < n) {
    if (text.startsWith('{{', i)) { skip(1, '{{', '}}'); continue; }
    if (text.startsWith('<ref', i) || text.startsWith('<!--', i)) {
      const isRef = text.startsWith('<ref', i);
      const end = text.indexOf('</ref>', i);
      const endC = text.indexOf('-->', i);
      const selfClose = text.indexOf('/>', i);
      if (isRef && selfClose >= 0 && (end < 0 || selfClose < end)) { i = selfClose + 2; continue; }
      const use = isRef ? end : endC;
      if (use >= 0) { i = use + (isRef ? 6 : 3); continue; }
      i++;
      continue;
    }
    out += text[i];
    i++;
  }
  return out;
}

export function normalizeText(raw) {
  return stripBalanced(raw)
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/\[\[([^|\]]*)\]\]/g, '$1')
    .replace(/\[\[([^|\]]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[(https?:\/\/[^\s\]\|]+)(?:\s+([^\]]*))?\]/g, (_m, _url, label) => label || '')
    .replace(/'''?/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LEADING_YEAR_RE = /^(?:c(?:irca)?\.?\s*)?(?:ca\.?\s*)?(?:\([^)]*\)\s*)?(\d{1,4})(?:\s*[-–\u2013]\s*(\d{1,4}))?(?:\s*[A-Z]{2,5}\.?\s*)?(?:\s*[-–\u2013:;]\s*)(.+)$/i;

// "1 July 1875: ...", "July 1875: ...", "January 1, 1875: ...", "1875: ..."
// The year must be a freestanding token, never a model number like CALL/360.
const DATE_PREFIX_RE =
  /^(?:[^a-z0-9"']*)?(?:(?:\d{1,2}(?:st|nd|rd|th)?,?\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?),?\s+(?:\d{1,4})|\d{1,4})\s*(?:[-–\u2013:;])\s*/i;

// filter out nav-table cells, colspan artifacts, and ref-looking noise
function isMeaningfulText(s) {
  if (!s) return false;
  const t = s.trim();
  if (t.length < 3) return false;
  if (/^(?:colspan|rowspan)\s*=/i.test(t)) return false;
  if (/\b(?:H[1-4]|Q[1-4]|T[1-4])\b/i.test(t)) return false;
  if (/^\d{4}\s*\(\d{4}\)\s*\(?\s*$/i.test(t)) return false;
  if (/^\d{1,4}\s*[-–]\s*\d{1,4}\s*$/i.test(t)) return false;
  if (t.length < 8 && /^\d+$|^[^\s]{1,3}$/i.test(t)) return false;
  return true;
}

// a believable inline year: only trust leading-date or section-anchored years
function leadingYear(s) {
  const m = s.match(LEADING_YEAR_RE) || s.match(DATE_PREFIX_RE);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 0 && y <= 2600 ? y : null;
}

function splitTemplateParams(body) {
  const parts = [];
  let tDepth = 0;
  let lDepth = 0;
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    if (body.startsWith('{{', i)) { tDepth++; cur += '{{'; i++; continue; }
    if (body.startsWith('}}', i)) { tDepth--; cur += '}}'; i++; continue; }
    if (body.startsWith('[[', i)) { lDepth++; cur += '[['; i++; continue; }
    if (body.startsWith(']]', i)) { lDepth--; cur += ']]'; i++; continue; }
    if (body[i] === '|' && tDepth === 0 && lDepth === 0) { parts.push(cur); cur = ''; continue; }
    cur += body[i];
  }
  if (cur) parts.push(cur);
  return parts;
}

export function extractTemplateEvents(wikitext, pageTitle, opts = {}) {
  const EPOCH_LOW = opts.minYear ?? -120000;
  const EPOCH_HIGH = opts.maxYear ?? 2400;
  const events = [];
  let i = 0;
  while (i < wikitext.length) {
    const start = wikitext.indexOf('{{', i);
    if (start < 0) break;
    // find matching close
    let depth = 0;
    let j = start;
    for (; j < wikitext.length; j++) {
      if (wikitext.startsWith('{{', j)) { depth++; j++; continue; }
      if (wikitext.startsWith('}}', j)) { depth--; j++; if (depth === 0) break; continue; }
    }
    if (depth !== 0) break;
    const body = wikitext.slice(start + 2, j - 1);
    i = j + 1;
    const m = body.match(/^(\s*timeline[- ]event\s*\|)([\s\S]*)$/i);
    if (!m) continue;
    try {
      const params = {};
      for (const part of splitTemplateParams(m[2])) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        const k = part.slice(0, eq).trim().toLowerCase();
        if (k) params[k] = part.slice(eq + 1).trim();
      }
      const date = params.date || '';
      const eventRaw = params.event || '';
      const year = (extractYear(date) || extractYear(eventRaw)) ?? null;
      if (!year || year < EPOCH_LOW || year > EPOCH_HIGH) continue;
      const text = normalizeText(eventRaw);
      if (text.length < 6) continue;
      const links = extractLinks(eventRaw);
      const ev = buildEvent(year, text, pageTitle);
      if (ev) {
        ev.references = links.length
          ? links.slice(0, 3)
          : [{ label: `Encyclopedia article: ${pageTitle}`, url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(pageTitle.replace(/ /g, '_')) }];
        events.push(ev);
      }
    } catch {
      continue;
    }
  }
  return events;
}

function firstYearIn(text) {
  return extractYear(text);
}

export function buildEvent(year, raw, pageTitle) {
  const links = extractLinks(raw);
  const clean = normalizeText(raw);
  const trimmed = clean.replace(/^[^a-z0-9"']*([0-9]{1,4}s?\b[^]{0,2})?:?\s*/i, '');

  // Try to find the "Year – description" split
  const m = clean.match(LEADING_YEAR_RE);
  const body = (m?.[3] || clean.replace(DATE_PREFIX_RE, '').trim() || trimmed || clean).trim();

  if (!body || body.length < 8) return null;

  const title = links[0]?.label || body.split(/[.;]/)[0].trim().slice(0, 70);

  return {
    year,
    title,
    text: body.slice(0, 250),
    references: links.length
      ? links.slice(0, 3)
      : [
          {
            label: `Encyclopedia article: ${pageTitle}`,
            url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(pageTitle.replace(/ /g, '_')),
          },
        ],
  };
}

export function parseTablesAndBullets(rawWikitext, pageTitle, opts = {}) {
  const wikitext = stripBalanced(rawWikitext)
    .replace(/<ref[^/]*\/>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/'''?/g, '')
    .replace(/&nbsp;/g, ' ');
  const lines = wikitext.split('\n');
  const events = [];
  let currentSectionYear = null;
  let currentSectionName = null;
  let inTable = false;
  let pendingCells = [];
  const sectionRe = /^==+\s*(.+?)\s*==+\s*/;
  const skipSectionsRe = /references|further reading|external links|bibliography|sources|notes|see also/i;
  const EPOCH_LOW = opts.minYear ?? -120000;
  const EPOCH_HIGH = opts.maxYear ?? 2400;

const flushTableRow = () => {
    if (!pendingCells.length) return;
    const cells = pendingCells.map((c) => normalizeText(c)).filter((c) => c.length > 1);
    pendingCells = [];
    if (!cells.length) return;
    const year = extractYear(cells[0] || '') || currentSectionYear;
    if (!year || year < EPOCH_LOW || year > EPOCH_HIGH) return;
    // cells are typically [date|location|event]; event is the last non-empty cell
    let event = '';
    for (let i = cells.length - 1; i >= 1; i--) {
      if (cells[i].length >= 3 && !/^(?:[0-9]{1,4}|[0-9]{1,4}\s*[-–]\s*[0-9]{1,4})$/.test(cells[i])) {
        event = cells[i];
        break;
      }
    }
    if (!isMeaningfulText(event) || !event) return;
    const loc = cells.length >= 3 ? cells[cells.length - 2] : '';
    const rest = [event, loc && event !== loc ? `(${loc})` : ''].filter(Boolean).join(' ');
    if (!rest || rest.length < 6) return;
    const ev = buildEvent(year, rest, pageTitle);
    if (ev) events.push(ev);
  };

  const push = (year, raw) => {
    if (!year || year < EPOCH_LOW || year > EPOCH_HIGH) return;
    const ev = buildEvent(year, raw, pageTitle);
    if (ev) events.push(ev);
  };

  for (const rawLine of lines) {
    try {
      const line = rawLine.trim();

      const section = line.match(sectionRe);
      if (section) {
        flushTableRow();
        inTable = false;
        currentSectionYear = null;
        const secName = section[1];
        if (skipSectionsRe.test(secName)) {
          currentSectionName = 'skip';
          continue;
        }
        currentSectionName = secName;
        const isRange = /(\d{1,4})\s*(?:-|–|to)\s*(\d{1,4}|present)/i.test(secName);
        const sy = isRange ? null : extractYear(secName);
        currentSectionYear = sy && sy > EPOCH_LOW && sy < EPOCH_HIGH ? sy : null;
        continue;
      }

      if (line.startsWith('{|')) { flushTableRow(); inTable = true; continue; }
      if (line.startsWith('|}')) { flushTableRow(); inTable = false; continue; }
      if (/^\|-\s*/u.test(line)) { flushTableRow(); continue; }
      if (currentSectionName === 'skip') continue;

      if (inTable) {
        if (line.startsWith('!')) continue;
        if (line.startsWith('|')) {
          const content = line.replace(/^\|/, '').trim();
          if (content.startsWith('+')) { flushTableRow(); continue; }
          if (line.includes('||')) {
            flushTableRow();
            const cells = content.split(/\|\|/).map((c) => normalizeText(c)).filter(Boolean);
            if (!cells.length) continue;
            const year = extractYear(cells[0] || '') || currentSectionYear;
            const payload = cells.slice(1).join(' \u2014 ');
            if (!isMeaningfulText(payload)) continue;
            push(year, payload);
          } else {
            pendingCells.push(content);
          }
        }
        continue;
      }

      if (line.startsWith('*')) {
        const content = line.replace(/^\*+/, '');
        const year = leadingYear(content) ?? currentSectionYear ?? firstYearIn(content);
        push(year, content);
      }
    } catch {
      continue;
    }
  }
  flushTableRow();

  return dedupeAndSort(events);
}

function dedupeAndSort(events) {
  const MAX_EVENTS = 26;
  const seen = new Set();
  const unique = events.filter((e) => {
    const key = `${e.year}:${e.text.slice(0, 40)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => a.year - b.year || a.text.localeCompare(b.text));

  if (unique.length <= MAX_EVENTS) return unique;

  const step = (unique.length - 1) / (MAX_EVENTS - 1);
  const picked = [];
  for (let i = 0; i < MAX_EVENTS; i++) {
    picked.push(unique[Math.round(i * step)]);
  }
  return dedupeByKey(picked);
}

function dedupeByKey(events) {
  const seen = new Set();
  return events.filter((e) => {
    const key = `${e.year}:${e.text.slice(0, 40)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseWikiTimeline(wikitext, pageTitle) {
  const fromTables = parseTablesAndBullets(wikitext, pageTitle);
  const fromTemplates = extractTemplateEvents(wikitext, pageTitle);
  if (fromTemplates.length >= fromTables.length) return dedupeAndSort(fromTemplates);
  if (fromTemplates.length >= 4) {
    const seen = new Set(fromTemplates.map((e) => `${e.year}:${e.text.slice(0, 30)}`));
    for (const e of fromTables) {
      const k = `${e.year}:${e.text.slice(0, 30)}`;
      if (!seen.has(k)) { fromTemplates.push(e); seen.add(k); }
    }
    return dedupeAndSort(fromTemplates);
  }
  return fromTables;
}

export async function generateFromWikipedia(config, { force = false } = {}) {
  const slug = slugify(config.slug || config.title);
  const target = join(TIMELINES_DIR, slug + '.json');
  if (existsSync(target) && !force) {
    console.log(`[skip] ${slug} already generated`);
    return null;
  }

  const pageTitle = config.wikiPage || config.title;
  const wikitext = await fetchWikipedia(pageTitle);
  if (!wikitext) throw new Error(`no wikitext for ${pageTitle}`);

  const events = parseWikiTimeline(wikitext, pageTitle);
  if (events.length < 4) throw new Error(`only ${events.length} events parsed from ${pageTitle}`);

  const today = new Date().toISOString().slice(0, 10);
  const timeline = {
    slug,
    title: config.title,
    tagline: config.tagline || `Milestones in ${config.title.toLowerCase()}.`,
    category: config.category || 'General',
    icon: config.icon || '⏳',
    color: config.color || '#8b5cf6',
    source: `Generated from \u201c${pageTitle}\u201d on Wikipedia; each event links to its source article.`,
    wikiPage: pageTitle,
    via: 'wiki',
    generated: today,
    popularity: config.popularity ?? 40 + Math.min(events.length, 30),
    events,
  };

  writeJson(target, timeline);
  console.log(`[write] ${slug} (${events.length} events)`);
  return timeline;
}

export function rebuildIndex() {
  const entries = readdirSync(TIMELINES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => makeIndexEntry(readJson(join(TIMELINES_DIR, f))))
    .sort((a, b) => (b.generated || '').localeCompare(a.generated || ''));
  writeJson(join(DATA_DIR, 'index.json'), entries);
  console.log(`[index] ${entries.length} timelines`);
}

export async function runQueue() {
  const queue = readJson(QUEUE_FILE);
  const queueRemaining = [];

  for (const item of queue) {
    try {
      const t = await generateFromWikipedia(item);
      if (!t) queueRemaining.push(item);
    } catch (err) {
      console.error(`[fail] ${item.slug ?? item.title}: ${err.message}`);
      queueRemaining.push(item);
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  writeJson(QUEUE_FILE, queueRemaining);
  console.log(`[queue] ${queueRemaining.length}/${queue.length} remaining`);
  rebuildIndex();
}

const isMain =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  runQueue().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}