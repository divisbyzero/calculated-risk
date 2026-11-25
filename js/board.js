// The projector window. It only displays what the host window sends it.

import { openChannel } from './sync.js';
import { setMathHTML, setMacros, fitWideMath, hasWideMath, clearWideMath } from './math.js';
import { escapeHtml, formatScore } from './util.js';

const main = document.getElementById('main');
const scores = document.getElementById('scores');

let pub = { view: 'waiting' };
let mainKey = null;

const channel = openChannel((msg) => {
  if (msg && msg.type === 'state') {
    pub = msg.state;
    render();
  }
});

channel.send({ type: 'hello' });
setInterval(() => channel.send({ type: 'ping' }), 1500);

render();

// ---------------------------------------------------------------------------
// Rendering

function render() {
  if (pub.macros) setMacros(pub.macros);

  const showScores = pub.view !== 'waiting' && pub.view !== 'results' && Array.isArray(pub.teams);
  const scoresChanged = scores.hidden === showScores;
  scores.hidden = !showScores;
  if (showScores) renderScores();

  const key = keyFor(pub);
  if (key !== mainKey) {
    mainKey = key;
    buildMain();
  } else if (scoresChanged) {
    fitAll();
  }
}

function keyFor(p) {
  switch (p.view) {
    case 'board':
      return JSON.stringify(['board', p.categories, p.cells]);
    case 'clue':
      return JSON.stringify(['clue', p.active]);
    case 'dd-wager':
      return JSON.stringify(['dd', p.active && p.active.category, p.active && p.active.value]);
    case 'final-category':
      return JSON.stringify(['final-category', p.final && p.final.category]);
    case 'final-clue':
      return JSON.stringify(['final-clue', p.final]);
    case 'results':
      return JSON.stringify(['results', p.teams]);
    default:
      return JSON.stringify(['waiting', p.title]);
  }
}

function renderScores() {
  const dd = pub.view === 'clue' && pub.active && pub.active.ddTeamIndex;
  scores.innerHTML = pub.teams
    .map(
      (t, i) => `
      <div class="team${dd === i ? ' highlight' : ''}">
        <div class="team-name">${escapeHtml(t.name)}</div>
        <div class="team-score${t.score < 0 ? ' neg' : ''}">${formatScore(t.score)}</div>
      </div>`
    )
    .join('');
}

function buildMain() {
  let html;
  switch (pub.view) {
    case 'board':
      html = boardHtml();
      break;
    case 'dd-wager':
      html = `<div class="screen dd"><div class="big-word">DOUBLE<br>DOWN</div></div>`;
      break;
    case 'clue':
      html = clueHtml();
      break;
    case 'final-category':
      html = `
        <div class="screen">
          <div class="screen-label">FERMAT’S LAST ROUND</div>
          <div class="screen-body" data-fit-max="0.12" data-fit-min="0.03">
            <div class="fit-inner clue-content"><div class="final-cat">${pub.final.category}</div></div>
          </div>
        </div>`;
      break;
    case 'final-clue': {
      const label = `FERMAT’S LAST ROUND &middot; <span class="clue-content">${pub.final.category}</span>`;
      html = pub.final.response
        ? answerHtml(label, pub.final.response, pub.final.solution)
        : `
        <div class="screen">
          <div class="screen-label">${label}</div>
          ${modeBadge(pub.final.mode)}
          ${clueBody(pub.final.clue)}
        </div>`;
      break;
    }
    case 'results':
      html = resultsHtml();
      break;
    default:
      html = `
        <div class="screen title-screen">
          <div class="big-word clue-content">${pub.title || 'Calculated Risk'}</div>
          <div class="title-sub">Waiting for the host&hellip;</div>
        </div>`;
  }
  setMathHTML(main, html).then(fitAll);
  main.querySelectorAll('img.tex-img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', fitAll, { once: true });
  });
  // Fit right away too, so text is sized sensibly before math is ready.
  fitAll();
}

function boardHtml() {
  const n = pub.categories.length;
  const rows = pub.rows;
  let html = `<div class="grid" style="grid-template-columns: repeat(${n}, minmax(0, 1fr)); grid-template-rows: 1.3fr repeat(${rows}, minmax(0, 1fr));">`;
  for (const cat of pub.categories) {
    html += `<div class="cell cat" data-fit-max="0.045" data-fit-min="0.014"><div class="fit-inner clue-content">${cat}</div></div>`;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < n; c++) {
      const cell = pub.cells[c][r];
      if (!cell || cell.used) html += `<div class="cell val used"></div>`;
      else html += `<div class="cell val">${cell.value}</div>`;
    }
  }
  return html + '</div>';
}

function clueHtml() {
  const a = pub.active;
  const label = a.doubleDown
    ? `DOUBLE DOWN &middot; <span class="clue-content">${a.category}</span>${a.ddTeam ? ` &middot; ${escapeHtml(a.ddTeam)} wagers ${formatScore(a.value)}` : ''}`
    : `<span class="clue-content">${a.category}</span> &middot; ${a.value}${a.review ? ' &middot; REVIEW' : ''}`;
  if (a.response) return answerHtml(label, a.response, a.solution);
  return `
    <div class="screen">
      <div class="screen-label">${label}</div>
      ${modeBadge(a.mode)}
      ${clueBody(a.clue)}
    </div>`;
}

// Tells the players whether they must write their response before ringing
// in, or may just say it.
function modeBadge(mode) {
  if (mode === 'write') return `<div class="mode-badge mode-write"><span class="mode-icon">✍️</span>WRITE IT</div>`;
  if (mode === 'say') return `<div class="mode-badge mode-say"><span class="mode-icon">🗣️</span>SAY IT</div>`;
  return '';
}

function resultsHtml() {
  const ranked = pub.teams.map((t, i) => ({ ...t, i })).sort((a, b) => b.score - a.score);
  const top = ranked.length ? ranked[0].score : 0;
  const winners = ranked.filter((t) => t.score === top);
  const line =
    winners.length === 1
      ? `${escapeHtml(winners[0].name)} wins!`
      : `Tie: ${winners.map((w) => escapeHtml(w.name)).join(' &amp; ')}`;
  let rank = 0;
  let prev = null;
  const rows = ranked
    .map((t, k) => {
      if (t.score !== prev) rank = k + 1;
      prev = t.score;
      return `
        <div class="standing${t.score === top ? ' winner' : ''}">
          <span class="standing-rank">${rank}.</span>
          <span class="standing-name">${escapeHtml(t.name)}</span>
          <span class="standing-score${t.score < 0 ? ' neg' : ''}">${formatScore(t.score)}</span>
        </div>`;
    })
    .join('');
  return `
    <div class="screen">
      <div class="screen-label">FINAL SCORES</div>
      <div style="margin:auto">
        <div class="winner-line">${line}</div>
        <div class="standings">${rows}</div>
      </div>
    </div>`;
}

// The answer screen: the correct response, plus the worked solution if any.
function answerHtml(label, response, solution) {
  const r = takeFigures(response);
  const s = takeFigures(solution || '');
  const inner = `
    ${r.text ? `<div class="answer-response">${r.text}</div>` : ''}
    ${s.text ? `<div class="answer-solution${r.text ? '' : ' alone'}">${s.text}</div>` : ''}`;
  return `
    <div class="screen answer-screen">
      <div class="screen-label">${label} &middot; ANSWER</div>
      ${screenBody(inner, r.figures + s.figures, 0.085, 0.016)}
    </div>`;
}

function clueBody(clue) {
  const c = takeFigures(clue);
  return screenBody(c.text ? `<div class="clue-text">${c.text}</div>` : '', c.figures, 0.085, 0.02);
}

// ---------------------------------------------------------------------------
// Pictures. A screen with pictures puts the text on the left and the
// pictures on the right, each picture scaled to fill its share of the space.

// Pull the pictures out of some clue HTML.
function takeFigures(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  const imgs = [...t.content.querySelectorAll('img.tex-img')];
  if (!imgs.length) return { text: html, figures: '' };
  imgs.forEach((img) => img.remove());
  // Drop wrappers (like a center environment) that only held a picture.
  t.content.querySelectorAll('div, span').forEach((el) => {
    if (!el.textContent.trim()) el.remove();
  });
  const text = t.innerHTML.trim().replace(/^(\s*<br>\s*)+|(\s*<br>\s*)+$/g, '').trim();
  return { text, figures: imgs.map((img) => img.outerHTML).join('') };
}

function screenBody(inner, figures, fitMax, fitMin) {
  const textBox = (cls) => `
    <div class="${cls}" data-fit-max="${fitMax}" data-fit-min="${fitMin}">
      <div class="fit-inner clue-content">${inner}</div>
    </div>`;
  if (!figures) return textBox('screen-body');
  if (!inner.trim()) return `<div class="screen-body"><div class="split-figure">${figures}</div></div>`;
  return `
    <div class="screen-body split">
      ${textBox('split-text')}
      <div class="split-figure">${figures}</div>
    </div>`;
}

// Size each picture as large as fits in its column (pictures stack).
function fitFigures() {
  main.querySelectorAll('.split-figure').forEach((col) => {
    const imgs = [...col.querySelectorAll('img.tex-img')];
    if (!imgs.length) return;
    const gap = parseFloat(getComputedStyle(col).rowGap) || 0;
    const W = col.clientWidth;
    const slot = (col.clientHeight - gap * (imgs.length - 1)) / imgs.length;
    for (const img of imgs) {
      const cs = getComputedStyle(img);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const w = W - padX;
      const h = slot - padY;
      if (w <= 0 || h <= 0) continue;
      if (!img.naturalWidth || !img.naturalHeight) {
        // Not loaded yet, or an SVG with no size of its own.
        img.style.width = w + 'px';
        img.style.height = h + 'px';
        continue;
      }
      const k = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      img.style.width = img.naturalWidth * k + 'px';
      img.style.height = img.naturalHeight * k + 'px';
    }
  });
}

// ---------------------------------------------------------------------------
// Shrink text until it fits its box.

function fitAll() {
  fitFigures();
  main.querySelectorAll('[data-fit-max]').forEach(fitBox);
}

// Shrink the text in a box until it fits, in three steps:
//   1. Shrink everything until it fits vertically and horizontally. A long
//      equation can only shrink the whole text to WIDE_FLOOR of the size
//      that fits vertically, so one equation can't make everything tiny.
//   2. Then shrink just the equations that are still too wide (down to
//      WIDE_MATH_MIN of their size), and shrink everything again if needed.
//   3. Anything still too wide scrolls sideways (see shared.css).
const WIDE_FLOOR = 0.65;
const WIDE_MATH_MIN = 0.5;

function fitBox(box) {
  const inner = box.querySelector('.fit-inner');
  if (!inner) return;
  const H = window.innerHeight;
  const min = parseFloat(box.dataset.fitMin) * H;
  let size = parseFloat(box.dataset.fitMax) * H;
  clearWideMath(inner);
  const setSize = (s) => {
    size = s;
    inner.style.fontSize = size + 'px';
  };
  const tallFits = () => inner.scrollHeight <= box.clientHeight;
  const wideFits = () => inner.scrollWidth <= box.clientWidth && !hasWideMath(inner);
  const shrink = (floor, fits) => {
    for (let k = 0; k < 60 && size > floor && !fits(); k++) setSize(Math.max(floor, size * 0.94));
  };

  setSize(size);
  shrink(min, tallFits);
  shrink(Math.max(min, size * WIDE_FLOOR), () => tallFits() && wideFits());
  if (!wideFits()) {
    fitWideMath(inner, WIDE_MATH_MIN);
    shrink(min, tallFits);
  }
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(fitAll, 100);
});

// ---------------------------------------------------------------------------
// Full screen (Safari needs the webkit-prefixed versions on older releases)

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function enterFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!fn) return;
  const p = fn.call(el);
  if (p && p.catch) p.catch(() => {});
}

function exitFullscreen() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen;
  if (fn) fn.call(document);
}

function onFullscreenChange() {
  document.body.classList.toggle('fullscreen', isFullscreen());
  setTimeout(fitAll, 150);
}

document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);

document.addEventListener('click', () => {
  if (!isFullscreen()) enterFullscreen();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') {
    if (isFullscreen()) exitFullscreen();
    else enterFullscreen();
  }
});

// Hide the mouse pointer when it hasn't moved for a couple of seconds.
let idleTimer;
document.addEventListener('mousemove', () => {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle'), 2000);
});
