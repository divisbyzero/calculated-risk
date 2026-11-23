// The projector window. It only displays what the host window sends it.

import { openChannel } from './sync.js';
import { setMathHTML, setMacros } from './math.js';
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
      html = `<div class="screen dd"><div class="big-word">DAILY<br>DOUBLE</div></div>`;
      break;
    case 'clue':
      html = clueHtml();
      break;
    case 'final-category':
      html = `
        <div class="screen">
          <div class="screen-label">FINAL JEOPARDY</div>
          <div class="screen-body" data-fit-max="0.12" data-fit-min="0.03">
            <div class="fit-inner clue-content"><div class="final-cat">${pub.final.category}</div></div>
          </div>
        </div>`;
      break;
    case 'final-clue': {
      const label = `FINAL JEOPARDY &middot; <span class="clue-content">${pub.final.category}</span>`;
      html = pub.final.response
        ? answerHtml(label, pub.final.response, pub.final.solution)
        : `
        <div class="screen">
          <div class="screen-label">${label}</div>
          <div class="screen-body" data-fit-max="0.085" data-fit-min="0.02">
            <div class="fit-inner clue-content"><div class="clue-text">${pub.final.clue}</div></div>
          </div>
        </div>`;
      break;
    }
    case 'results':
      html = resultsHtml();
      break;
    default:
      html = `
        <div class="screen title-screen">
          <div class="big-word clue-content">${pub.title || 'Jeopardy!'}</div>
          <div class="title-sub">Waiting for the host&hellip;</div>
        </div>`;
  }
  setMathHTML(main, html).then(fitAll);
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
  const label = a.dailyDouble
    ? `DAILY DOUBLE &middot; <span class="clue-content">${a.category}</span>${a.ddTeam ? ` &middot; ${escapeHtml(a.ddTeam)} wagers ${formatScore(a.value)}` : ''}`
    : `<span class="clue-content">${a.category}</span> &middot; ${a.value}${a.review ? ' &middot; REVIEW' : ''}`;
  if (a.response) return answerHtml(label, a.response, a.solution);
  return `
    <div class="screen">
      <div class="screen-label">${label}</div>
      <div class="screen-body" data-fit-max="0.085" data-fit-min="0.02">
        <div class="fit-inner clue-content">
          <div class="clue-text">${a.clue}</div>
        </div>
      </div>
    </div>`;
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
  return `
    <div class="screen answer-screen">
      <div class="screen-label">${label} &middot; ANSWER</div>
      <div class="screen-body" data-fit-max="0.085" data-fit-min="0.016">
        <div class="fit-inner clue-content">
          <div class="answer-response">${response}</div>
          ${solution ? `<div class="answer-solution">${solution}</div>` : ''}
        </div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Shrink text until it fits its box.

function fitAll() {
  main.querySelectorAll('[data-fit-max]').forEach(fitBox);
}

function fitBox(box) {
  const inner = box.querySelector('.fit-inner');
  if (!inner) return;
  const H = window.innerHeight;
  const min = parseFloat(box.dataset.fitMin) * H;
  let size = parseFloat(box.dataset.fitMax) * H;
  inner.style.fontSize = size + 'px';
  for (let k = 0; k < 40 && size > min; k++) {
    if (inner.scrollHeight <= box.clientHeight && inner.scrollWidth <= box.clientWidth) break;
    size = Math.max(min, size * 0.92);
    inner.style.fontSize = size + 'px';
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
