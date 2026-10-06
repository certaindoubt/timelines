# Timeless

Beautiful, explorable timelines about everything: science, technology, history, culture and more. A new timeline is generated every day, and every event links to its primary source.

Live at **https://certaindoubt.github.io/timelines/**.

## How it works

- **Static site, no build step.** `<index.html>` and `<timeline.html>` read `data/index.json` and `data/timelines/*.json` at runtime.
- **Curated seeds** in `topics/seed/*.json` are compiled with `node scripts/compile-seeds.mjs`.
- **Daily generation.** A GitHub Action cron (`daily.yml`) runs `node scripts/daily.mjs`, which takes the next entry from `topics/queue.json`, fetches its Wikipedia timeline, parses it into our event schema, writes it to `data/timelines/`, and removes it from the queue.
- **Deploy.** `pages.yml` builds the static site and publishes it to GitHub Pages after every push and after each daily run.

## Local development

```bash
node scripts/compile-seeds.mjs   # compile curated seeds into data/
node scripts/generate-wiki.mjs   # try every remaining queue item (for testing)
node scripts/daily.mjs           # generate exactly one timeline from the queue
python3 -m http.server 8000      # serve the site
```

## Schema

A timeline in `data/timelines/<slug>.json`:

```json
{
  "slug": "quantum-computing",
  "title": "Quantum Computing",
  "tagline": "...",
  "category": "Technology",
  "icon": "🔮",
  "color": "#8b5cf6",
  "source": "...",
  "via": "seed" | "wiki",
  "generated": "2026-10-06",
  "wikiPage": null,
  "events": [
    {
      "year": 1982,
      "title": "Feynman proposes quantum computers",
      "text": "...",
      "references": [{ "label": "...", "url": "...j" }]
    }
  ]
}
```

`data/index.json` is a lightweight map of `slug` -> metadata for the grid view.

## License

MIT.