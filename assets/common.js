export const ESC = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmtYear = (n) => {
  if (n == null || n === '') return '?';
  const v = Number(n);
  if (v === 0) return '1 BC';
  if (v < 0) return `${Math.abs(v).toLocaleString('en-US')} BC`;
  return v.toLocaleString('en-US');
};

export const fmtNumber = (n) => (n == null || n === '' ? '?' : Number(n).toLocaleString('en-US'));

export function pluralize(n, one, many) {
  return n === 1 ? one : many;
}

export function dateStr(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export async function loadIndex() {
  const r = await fetch('data/index.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('could not load index');
  return r.json();
}

export async function loadTimeline(slug) {
  const r = await fetch('data/timelines/' + slug + '.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('could not load timeline');
  return r.json();
}

if (typeof window !== 'undefined') window.App = { ESC, fmtNumber, fmtYear, pluralize, dateStr, loadIndex, loadTimeline };