export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatScore(n) {
  const abs = Math.abs(n).toLocaleString('en-US');
  return n < 0 ? '−' + abs : abs;
}
