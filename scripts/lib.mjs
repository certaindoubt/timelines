import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SEED_DIR = join(ROOT, 'topics', 'seed');
export const DATA_DIR = join(ROOT, 'data');
export const TIMELINES_DIR = join(DATA_DIR, 'timelines');
export const QUEUE_FILE = join(ROOT, 'topics', 'queue.json');
export const INDEX_FILE = join(DATA_DIR, 'index.json');

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

export function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[’'"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function fetchWikipedia(title, { retries = 3 } = {}) {
  const url =
    'https://en.wikipedia.org/w/api.php?action=parse&page=' +
    encodeURIComponent(title) +
    '&prop=wikitext&format=json&formatversion=2&origin=*';
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'timeless-app/1.0 (hobby timeline generator; mailto:julio012358@gmail.com)' },
      });
      if (r.status === 429) {
        await new Promise((res) => setTimeout(res, 1000 * Math.pow(2, attempt)));
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${title}`);
      const d = await r.json();
      if (d.error) throw new Error(`API error for ${title}: ${d.error.info || 'unknown'}`);
      return d.parse?.wikitext ?? null;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((res) => setTimeout(res, 500 * Math.pow(2, attempt)));
    }
  }
  return null;
}

const WIKI_URL = 'https://en.wikipedia.org/wiki/';

function stripWikiLinks(text) {
  return text
    .replace(/\[\[([^|\]]*)\]\]/g, '$1')
    .replace(/\[\[([^|\]]*)\|([^\]]*)\]\]/g, '$2');
}

export function normalizeText(raw) {
  return stripWikiLinks(raw)
    .replace(/<ref[^/]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<ref[^/]*\/>/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/'''?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractYear(s) {
  if (s == null) return null;
  s = String(s);
  const bc = s.match(/(\d{1,4})\s*(?:B\.?\s*C\.?(?:\s*E\.?)?)/i);
  if (bc) return -parseInt(bc[1], 10);
  const ad = s.match(/(\d{1,4})\s*(?:A\.?\s*D\.?|C\.?\s*E\.?)/i);
  if (ad) return parseInt(ad[1], 10);
  const m = s.match(/(?:^|\D)(\d{3,4})(?:\D|$)/);
  return m ? parseInt(m[1], 10) : null;
}

export function listTimelines() {
  if (!existsSync(TIMELINES_DIR)) return [];
  return readdirSync(TIMELINES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(join(TIMELINES_DIR, f)));
}

export function ensureSchema(t) {
  const errors = [];
  if (!t.slug) errors.push('missing slug');
  if (!t.title) errors.push('missing title');
  if (!t.category) errors.push('missing category');
  if (!Array.isArray(t.events) || t.events.length === 0) errors.push('missing events');
  for (const [i, e] of (t.events ?? []).entries()) {
    if (!e.title) errors.push(`event ${i} missing title`);
    if (!e.year && e.year !== 0) errors.push(`event ${i} missing year`);
    if (!Array.isArray(e.references) || e.references.length === 0)
      errors.push(`event ${i} missing references`);
  }
  if (errors.length) throw new Error(`schema ${t.slug}: ${errors.join(', ')}`);
}

export function canonicalYear(t) {
  const years = t.events.map((e) => e.year).filter((y) => typeof y === 'number');
  return { from: Math.min(...years), to: Math.max(...years) };
}

export function makeIndexEntry(t) {
  const { from, to } = canonicalYear(t);
  return {
    slug: t.slug,
    title: t.title,
    tagline: t.tagline || '',
    category: t.category,
    icon: t.icon || '⏳',
    color: t.color || '#8b5cf6',
    source: t.source || '',
    events: t.events.length,
    from,
    to,
    generated: t.generated || '',
    via: t.via || 'seed',
    wikiPage: t.wikiPage || null,
    popularity: t.popularity ?? 40 + Math.min(t.events.length, 30),
  };
}

export function rebuildIndex() {
  const entries = listTimelines()
    .map(makeIndexEntry)
    .sort((a, b) => (b.generated || '').localeCompare(a.generated || ''));
  writeJson(INDEX_FILE, entries);
  return entries;
}