import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SEED_DIR,
  TIMELINES_DIR,
  DATA_DIR,
  readJson,
  writeJson,
  ensureSchema,
  makeIndexEntry,
  canonicalYear,
} from './lib.mjs';

function compileSeeds() {
  const files = readdirSync(SEED_DIR).filter((f) => f.endsWith('.json'));
  const written = [];

  for (const f of files) {
    const t = readJson(join(SEED_DIR, f));
    ensureSchema(t);
    const timeline = {
      slug: t.slug,
      title: t.title,
      tagline: t.tagline || '',
      category: t.category,
      icon: t.icon || '⏳',
      color: t.color || '#8b5cf6',
      source: t.source || 'Curated timeline with references.',
      via: 'seed',
      generated: '2026-10-06',
      popularity: t.popularity ?? 50 + Math.min(t.events.length, 30),
      events: t.events,
    };
    const target = join(TIMELINES_DIR, timeline.slug + '.json');
    writeJson(target, timeline);
    written.push(timeline.slug);
  }

  const entries = readdirSync(TIMELINES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => makeIndexEntry(readJson(join(TIMELINES_DIR, f))))
    .sort((a, b) => (b.generated || '').localeCompare(a.generated || ''));

  writeJson(join(DATA_DIR, 'index.json'), entries);
  console.log(`compiled ${written.length} seeds; index has ${entries.length} timelines`);
}

compileSeeds();