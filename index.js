import { ESC, fmtNumber, pluralize, loadIndex } from './assets/common.js';

const grid = document.getElementById('grid');
const countEl = document.getElementById('count');
const searchEl = document.getElementById('search');
const chipsEl = document.getElementById('chips');
const totalEl = document.getElementById('total');

let index = [];
let activeCat = 'All';

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
        <span><b>${fmtNumber(t.from)}</b> &ndash; <b>${fmtNumber(t.to)}</b></span>
        <span><b>${pluralize(t.events, 'event', 'events')}</b></span>
      </div>
    </a>`;
}

function render() {
  const q = searchEl.value.trim().toLowerCase();
  let list = index;
  if (activeCat !== 'All') list = list.filter((t) => t.category === activeCat);
  if (q) list = list.filter((t) => (t.title + ' ' + t.tagline + ' ' + t.category).toLowerCase().includes(q));
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