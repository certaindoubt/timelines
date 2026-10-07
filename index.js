import { ESC, fmtNumber, fmtYear, pluralize, loadIndex } from './assets/common.js';

const grid = document.getElementById('grid');
const countEl = document.getElementById('count');
const searchEl = document.getElementById('search');
const chipsEl = document.getElementById('chips');
const totalEl = document.getElementById('total');
const toggleEl = document.getElementById('viewToggle');
const SHOW = 10;

let index = [];
let activeCat = 'All';
let view = 'popular';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tileHtml(t) {
  return `
    <a class="tile" href="timeline.html?slug=${encodeURIComponent(t.slug)}" style="--tile-accent:${t.color}">
      <div class="top">
        <span class="icon">${t.icon}</span>
        ${t.via === 'seed' ? '' : `<span class="badge">via Wikipedia</span>`}
      </div>
      <h3>${ESC(t.title)}</h3>
      <div class="tagline">${ESC(t.tagline)}</div>
      <div class="meta">
        <span><b>${fmtYear(t.from)}</b> &ndash; <b>${fmtYear(t.to)}</b></span>
        <span><b>${pluralize(t.events, 'event', 'events')}</b></span>
      </div>
    </a>`;
}

function render() {
  const q = searchEl.value.trim().toLowerCase();
  let list = index;
  if (activeCat !== 'All') list = list.filter((t) => t.category === activeCat);
  if (q) list = list.filter((t) => (t.title + ' ' + t.tagline + ' ' + t.category).toLowerCase().includes(q));

  const browsing = !q && activeCat === 'All';
  if (browsing) {
    if (view === 'popular') {
      list = list.slice().sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)).slice(0, SHOW);
    } else if (view === 'random') {
      list = shuffle(list).slice(0, SHOW);
    }
  }

  grid.innerHTML = list.length ? list.map(tileHtml).join('') : '<div class="empty">No timelines match your search.</div>';
  countEl.textContent = `${list.length} of ${index.length}`;
}

function renderChips() {
  const cats = [...new Set(index.map((t) => t.category))].sort();
  const chips = ['All', ...cats].map((c) => {
    const n = c === 'All' ? index.length : index.filter((t) => t.category === c).length;
    return `<button class="chip ${c === activeCat ? 'active' : ''}" data-cat="${c}">${c} (${n})</button>`;
  });
  chipsEl.innerHTML = chips.join('');
}

toggleEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (!b) return;
  view = b.dataset.view;
  toggleEl.querySelectorAll('.view-btn').forEach((x) => x.classList.toggle('active', x === b));
  render();
});

chipsEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  activeCat = b.dataset.cat;
  renderChips();
  render();
});

searchEl.addEventListener('input', render);

loadIndex().then((ix) => {
  index = ix;
  totalEl.textContent = ` ${index.length} timelines`;
  renderChips();
  render();
});