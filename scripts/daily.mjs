import { readJson, writeJson, QUEUE_FILE, TIMELINES_DIR } from './lib.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { generateFromWikipedia } from './generate-wiki.mjs';
import { ROOT } from './lib.mjs';

const FAILED_FILE = join(ROOT, 'topics', 'failed.json');

async function main() {
  const queue = readJson(QUEUE_FILE);
  const failed = existsSync(FAILED_FILE) ? readJson(FAILED_FILE) : [];

  while (queue.length) {
    const item = queue.shift();
    const slug = (item.slug || item.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const target = join(TIMELINES_DIR, slug + '.json');

    if (existsSync(target)) continue;

    try {
      await generateFromWikipedia(item, { force: true });
      console.log(`[daily] generated ${item.title}`);
      writeJson(QUEUE_FILE, queue);
      return;
    } catch (err) {
      console.error(`[skip] ${item.title}: ${err.message}`);
      failed.push({ ...item, reason: err.message });
    }
  }

  writeJson(FAILED_FILE, failed);
  writeJson(QUEUE_FILE, queue);
  console.log('[daily] nothing to generate today');
  console.log(`[daily] ${failed.length} items marked failed (see topics/failed.json)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});