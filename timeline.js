import { ESC, fmtNumber, fmtYear, pluralize, dateStr, loadTimeline } from './assets/common.js';

const titleEl = document.getElementById('title');
const taglineEl = document.getElementById('tagline');
const srcNotesEl = document.getElementById('src-notes');
const rangeEl = document.getElementById('range');
const tlEl = document.getElementById('timeline');
const playBtn = document.getElementById('playBtn');
const resetBtn = document.getElementById('resetBtn');
const progressEl = document.getElementById('progress');
const tlCountEl = document.getElementById('tl-count');
const legendEl = document.getElementById('legend');

const slug = new URLSearchParams(location.search).get('slug');

let events = [];
let playTimer = null;
let playing = false;

const yearColor = (y) => {
  const h = 260 - Math.round(((y - events[0]?.year || 0) / (events[events.length - 1]?.year - events[0]?.year || 1)) * 140);
  return `hsl(${h}, 70%, 62%)`;
};

function eventHtml(e, i, total) {
  const refs = (e.references || [])
    .slice(0, 3)
    .map((r) => `<a href="${ESC(r.url)}" target="_blank" rel="noopener">${ESC(r.label)}</a>`)
    .join('');
  return `
    <div class="tl-event" data-i="${i}" data-year="${e.year}">
      <div class="year">${fmtYear(e.year)}</div>
      <div class="dot" style="--dot-accent:${yearColorSnake(e.year, total)}"></div>
      <div class="card">
        <h4>${ESC(e.title)}</h4>
        <p>${ESC(e.text)}</p>
        ${refs ? `<div class="refs">${refs}</div>` : ''}
      </div>
    </div>`;
}

function yearColorSnake(y, total) {
  const years = events.map((e) => e.year).sort((a, b) => a - b);
  const min = years[0], max = years[years.length - 1];
  if (max === min) return 'var(--accent)';
  const t = Math.max(0, Math.min(1, (y - min) / (max - min)));
  return `hsl(${280 - t * 210}, 65%, 62%)`;
}

function render() {
  if (!events.length) return;
  tlEl.innerHTML = events.map((e, i) => eventHtml(e, i, events.length)).join('');
  const first = events[0];
  const last = events[events.length - 1];
  rangeEl.innerHTML = `Showing <b>${fmtYear(first.year)}</b>&ndash;<b>${fmtYear(last.year)}</b> &middot; ${events.length} events`;
}

function highlight(i) {
  tlEl.querySelectorAll('.tl-event').forEach((el) => el.classList.toggle('active', +el.dataset.i === i));
  const el = tlEl.querySelector(`[data-i="${i}"]`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const scrollable = document.documentElement.scrollTop || document.body.scrollTop;
  const max = (document.documentElement.scrollHeight - window.innerHeight) || 1;
  progressEl.style.width = `${(scrollable / max) * 100}%`;
}

function play() {
  if (playing) {
    stop();
    return;
  }
  playing = true;
  playBtn.innerHTML = '&#10073;&#10073; Pause';
  let i = 0;
  highlight(0);
  playTimer = setInterval(() => {
    i++;
    if (i >= events.length) { stop(); reset(); return; }
    highlight(i);
  }, 1600);
}

function stop() {
  playing = false;
  clearInterval(playTimer);
  playBtn.innerHTML = '&#9654; Play';
}

function reset() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  progressEl.style.width = '0';
}

playBtn.addEventListener('click', play);
resetBtn.addEventListener('click', () => { stop(); reset(); });

window.addEventListener('scroll', () => {
  const max = (document.documentElement.scrollHeight - window.innerHeight) || 1;
  progressEl.style.width = `${((document.documentElement.scrollTop || document.body.scrollTop) / max) * 100}%`;
}, { passive: true });

tlEl.addEventListener('click', (e) => {
  const box = e.target.closest('.tl-event');
  if (box) highlight(+box.dataset.i);
});

loadTimeline(slug).then((t) => {
  events = t.events;
  document.title = `${t.title} &mdash; Timeless`;
  titleEl.textContent = t.title;
  taglineEl.textContent = t.tagline || '';
  srcNotesEl.innerHTML = t.events.length
    ? `${pluralize(t.events.length, 'event', 'events')} &middot; ${t.via === 'wiki' ? `Generated from <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(t.wikiPage || '')}" target="_blank" rel="noopener">${ESC(t.wikiPage || 'Wikipedia')}</a>` : 'Hand-curated &mdash; sources linked per event.'} &middot; added ${dateStr(t.generated)}`
    : '';
  tlCountEl.textContent = t.events ? `${t.events.length} events` : '';
  render();
  legendEl.innerHTML = `
    <span class="swatch" style="background:${yearColorSnake(events[0]?.year, events.length)}"></span> earliest
    &rarr;
    <span class="swatch" style="background:${yearColorSnake(events[events.length - 1]?.year, events.length)}"></span> latest
    &middot; click a dot to focus that event
  `;
}).catch((err) => {
  tlEl.innerHTML = `<div class="empty">Sorry &mdash; could not load this timeline (${ESC(err.message)}).</div>`;
});