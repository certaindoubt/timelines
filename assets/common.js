const ESC = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtNumber = (n) => (n == null || n === '' ? '?' : Number(n).toLocaleString('en-US'));

function pluralize(n, one, many) {
  return n === 1 ? one : many;
}

function dateStr(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function loadIndex() {
  const r = await fetch('data/index.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('could not load index');
  return r.json();
}

async function loadTimeline(slug) {
  const r = await fetch('data/timelines/' + slug + '.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('could not load timeline');
  return r.json();
}

window.App = { ESC, fmtNumber, pluralize, dateStr, loadIndex, loadTimeline };