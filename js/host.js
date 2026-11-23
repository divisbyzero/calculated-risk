// The host (professor) window. It owns the game state and sends the board
// window what it should display.

import { parseGame } from './texparser.js';
import { openChannel, syncSupported } from './sync.js';
import { setMathHTML, setMacros, mathAvailable } from './math.js';
import { escapeHtml, formatScore } from './util.js';

const STORAGE_KEY = 'classroom-jeopardy.saved.v1';
const MAX_HISTORY = 200;
const $ = (sel) => document.querySelector(sel);

let loaded = null; // { game, errors, warnings, source } for the setup screen
let teamNames = ['Team 1', 'Team 2', 'Team 3'];
let state = null; // the running game
let history = []; // snapshots for Undo
let boardWindow = null;
let boardLastSeen = 0;
let mainKey = null;

const channel = openChannel(handleMessage);

init();

// ---------------------------------------------------------------------------
// Setup

function init() {
  if (!syncSupported) {
    notice('This browser can’t connect the host and board windows. Please update Safari (15.4 or later) or use another current browser.');
  }
  if (location.protocol === 'file:') {
    notice('This page was opened as a file. Run it from a web server instead (see the README) so the game list and board window work.');
  }
  // MathJax loads from the internet; give it a moment before warning.
  setTimeout(() => {
    if (!mathAvailable()) notice('MathJax didn’t load, so math will appear as raw LaTeX. Check your internet connection and reload.');
  }, 4000);

  renderTeamInputs();
  loadGameList();
  checkSavedGame();

  $('#btn-open-board').addEventListener('click', openBoard);
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-final').addEventListener('click', () => act(startFinal));
  $('#btn-new').addEventListener('click', endGame);

  $('#game-list').addEventListener('click', onGameListClick);
  $('#file-input').addEventListener('change', onFileChosen);
  $('#preview').addEventListener('toggle', renderPreview);

  $('#team-list').addEventListener('input', (e) => {
    const i = Number(e.target.dataset.index);
    if (!Number.isNaN(i)) teamNames[i] = e.target.value;
  });
  $('#team-list').addEventListener('click', (e) => {
    const i = e.target.dataset.remove;
    if (i === undefined) return;
    teamNames.splice(Number(i), 1);
    renderTeamInputs();
  });
  $('#btn-add-team').addEventListener('click', () => {
    teamNames.push(`Team ${teamNames.length + 1}`);
    renderTeamInputs();
    const inputs = document.querySelectorAll('#team-list input');
    inputs[inputs.length - 1].select();
  });

  $('#btn-start').addEventListener('click', startGame);
  $('#btn-resume').addEventListener('click', resumeGame);
  $('#btn-discard').addEventListener('click', () => {
    if (!confirm('Discard the saved game? This can’t be undone.')) return;
    clearSaved();
    $('#resume-card').hidden = true;
  });

  $('#host-main').addEventListener('click', onMainClick);
  $('#host-main').addEventListener('input', onMainInput);
  $('#host-side').addEventListener('click', onSideClick);

  setInterval(renderBoardStatus, 2000);
  broadcast();
}

function notice(text) {
  const div = document.createElement('div');
  div.className = 'notice';
  div.textContent = text;
  $('#notices').appendChild(div);
}

async function loadGameList() {
  const box = $('#game-list');
  try {
    const res = await fetch('games/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    box.innerHTML = list
      .map(
        (g) => `
        <button class="game-option" data-file="${escapeHtml(g.file)}">
          <span class="game-option-title">${escapeHtml(g.title)}</span>
          <span class="game-option-desc">${escapeHtml(g.description || '')}</span>
        </button>`
      )
      .join('');
  } catch (e) {
    box.innerHTML = `<p class="muted">Couldn’t load the built-in games (${escapeHtml(e.message)}). You can still load a .tex file.</p>`;
  }
}

async function onGameListClick(e) {
  const btn = e.target.closest('.game-option');
  if (!btn) return;
  try {
    const res = await fetch(`games/${btn.dataset.file}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    loadSource(await res.text(), btn.dataset.file);
    markSelected(btn);
  } catch (err) {
    alert(`Couldn’t load ${btn.dataset.file}: ${err.message}`);
  }
}

async function onFileChosen(e) {
  const file = e.target.files[0];
  if (!file) return;
  loadSource(await file.text(), file.name);
  markSelected(null);
  e.target.value = ''; // so choosing the same file again reloads it
}

function markSelected(btn) {
  document.querySelectorAll('.game-option').forEach((b) => b.classList.toggle('selected', b === btn));
}

function loadSource(text, source) {
  loaded = { ...parseGame(text), source };
  setMacros(loaded.game.macros);
  renderLoadStatus();
  updateStartButton();
}

function renderLoadStatus() {
  const { game, errors, warnings, source } = loaded;
  const s = game.stats;
  const summary = `${s.categories} categories, ${s.clues} clues, ${s.dailyDoubles} Daily Double${s.dailyDoubles === 1 ? '' : 's'}, ${game.final ? 'Final Jeopardy' : 'no Final Jeopardy'}`;
  let html = `
    <div class="${errors.length ? 'load-bad' : 'load-ok'}">
      <strong>${escapeHtml(source)}</strong>: <span class="clue-content">${game.titleHtml}</span>
      <div class="small">${summary}</div>
      ${errors.length ? `<div><strong>${errors.length} problem${errors.length === 1 ? '' : 's'} to fix before playing:</strong></div><ul class="msg-list msg-errors">${errors.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>` : ''}
    </div>`;
  if (warnings.length) {
    html += `<ul class="msg-list msg-warnings">${warnings.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`;
  }
  setMathHTML($('#load-status'), html);

  const preview = $('#preview');
  preview.hidden = s.clues === 0;
  if (preview.open) renderPreview();
}

function renderPreview() {
  const preview = $('#preview');
  if (!preview.open || !loaded) return;
  const g = loaded.game;
  let html = '';
  g.categories.forEach((c, ci) => {
    html += `<h3 class="clue-content">${ci + 1}. ${c.nameHtml}</h3><table><tr><th>Value</th><th>Clue</th><th>Response</th></tr>`;
    for (const q of c.clues) {
      html += `<tr><td>${q.value}${q.dailyDouble ? ' <span class="tag">DD</span>' : ''}</td><td class="clue-content">${q.clueHtml}</td><td class="clue-content">${q.responseHtml}</td></tr>`;
    }
    html += '</table>';
  });
  if (g.final) {
    html += `<h3>Final Jeopardy: <span class="clue-content">${g.final.categoryHtml}</span></h3><table><tr><th></th><th>Clue</th><th>Response</th></tr>
      <tr><td></td><td class="clue-content">${g.final.clueHtml}</td><td class="clue-content">${g.final.responseHtml}</td></tr></table>`;
  }
  setMathHTML($('#preview-body'), html);
}

function renderTeamInputs() {
  $('#team-list').innerHTML = teamNames
    .map(
      (name, i) => `
      <div class="team-input-row">
        <input type="text" value="${escapeHtml(name)}" data-index="${i}" maxlength="40" aria-label="Team ${i + 1} name">
        <button class="btn small" data-remove="${i}" ${teamNames.length <= 1 ? 'disabled' : ''}>Remove</button>
      </div>`
    )
    .join('');
  $('#btn-add-team').disabled = teamNames.length >= 8;
  updateStartButton();
}

function updateStartButton() {
  const btn = $('#btn-start');
  const hint = $('#start-hint');
  if (!loaded) {
    btn.disabled = true;
    hint.textContent = 'Choose a game first.';
  } else if (loaded.errors.length) {
    btn.disabled = true;
    hint.textContent = 'Fix the problems in the game file, then load it again.';
  } else {
    btn.disabled = false;
    hint.textContent = '';
  }
}

function startGame() {
  if (!loaded || loaded.errors.length) return;
  const g = loaded.game;
  state = {
    game: g,
    teams: teamNames.map((n, i) => ({ name: n.trim() || `Team ${i + 1}`, score: 0 })),
    used: g.categories.map((c) => c.clues.map(() => false)),
    view: 'board',
    active: null,
    final: null,
  };
  history = [];
  mainKey = null;
  commit();
}

// ---------------------------------------------------------------------------
// Saving (so a refresh or crash doesn't lose the game)

function save() {
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, history }));
  } catch {
    /* storage full or unavailable; the game still works */
  }
}

function clearSaved() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.state && saved.state.game && Array.isArray(saved.state.teams)) return saved;
  } catch {
    /* ignore */
  }
  return null;
}

function checkSavedGame() {
  const saved = readSaved();
  if (!saved) return;
  const st = saved.state;
  const scores = st.teams.map((t) => `${escapeHtml(t.name)} ${formatScore(t.score)}`).join(', ');
  $('#resume-text').innerHTML = `<strong>${escapeHtml(st.game.title)}</strong>: ${scores}`;
  $('#resume-card').hidden = false;
}

function resumeGame() {
  const saved = readSaved();
  if (!saved) return;
  state = saved.state;
  history = saved.history || [];
  mainKey = null;
  commit();
}

function endGame() {
  if (!confirm('End this game and go back to setup? The scores will be cleared.')) return;
  state = null;
  history = [];
  mainKey = null;
  clearSaved();
  $('#resume-card').hidden = true;
  showSetup();
  broadcast();
}

// ---------------------------------------------------------------------------
// Undo

function snapshot() {
  const { teams, used, view, active, final } = state;
  return JSON.stringify({ teams, used, view, active, final });
}

function pushHistory() {
  history.push(snapshot());
  if (history.length > MAX_HISTORY) history.shift();
}

function undo() {
  if (!state || !history.length) return;
  Object.assign(state, JSON.parse(history.pop()));
  mainKey = null;
  commit();
}

// ---------------------------------------------------------------------------
// Board window and messaging

function openBoard() {
  if (boardWindow && !boardWindow.closed) {
    boardWindow.focus();
    return;
  }
  boardWindow = window.open('board.html', 'jeopardy-board', 'popup=yes,width=1280,height=760');
  if (!boardWindow) alert('The browser blocked the board window. Allow pop-ups for this site and try again.');
}

function handleMessage(msg) {
  if (!msg) return;
  if (msg.type === 'hello' || msg.type === 'ping') {
    const wasConnected = boardConnected();
    boardLastSeen = Date.now();
    if (msg.type === 'hello') broadcast();
    if (!wasConnected) renderBoardStatus();
  }
}

function boardConnected() {
  return Date.now() - boardLastSeen < 4500;
}

function renderBoardStatus() {
  const chip = $('#board-status');
  const on = boardConnected();
  chip.classList.toggle('on', on);
  chip.textContent = on ? 'Board window: connected' : 'Board window: not open';
}

function broadcast() {
  channel.send({ type: 'state', state: publicState() });
}

// What the board is allowed to see. Responses are only included once revealed.
function publicState() {
  if (!state) return { view: 'waiting' };
  const g = state.game;
  const pub = {
    view: state.view,
    title: g.titleHtml,
    macros: g.macros,
    rows: g.rows,
    categories: g.categories.map((c) => c.nameHtml),
    cells: g.categories.map((c, ci) => {
      const col = [];
      for (let r = 0; r < g.rows; r++) {
        const q = c.clues[r];
        col.push(q ? { value: q.value, used: state.used[ci][r] } : null);
      }
      return col;
    }),
    teams: state.teams.map((t) => ({ name: t.name, score: t.score })),
  };
  const a = state.active;
  if (a) {
    const q = g.categories[a.c].clues[a.r];
    const isDD = q.dailyDouble;
    const ddStarted = isDD && a.ddTeam !== null;
    pub.active = {
      category: g.categories[a.c].nameHtml,
      value: ddStarted ? a.wager : q.value,
      dailyDouble: isDD,
      ddTeam: ddStarted ? state.teams[a.ddTeam].name : null,
      ddTeamIndex: ddStarted ? a.ddTeam : null,
      clue: state.view === 'clue' ? q.clueHtml : null,
      response: state.view === 'clue' && a.showResponse ? q.responseHtml : null,
    };
  }
  if (state.final && g.final) {
    const showClue = state.view === 'final-clue' || state.view === 'results';
    pub.final = {
      category: g.final.categoryHtml,
      clue: showClue ? g.final.clueHtml : null,
      response: state.final.showResponse ? g.final.responseHtml : null,
    };
  }
  return pub;
}

// ---------------------------------------------------------------------------
// Game actions. Each changes `state`; act() then saves, redraws and broadcasts.

function act(fn, ...args) {
  if (!state) return;
  if (fn(...args) === false) return;
  commit();
}

function commit() {
  save();
  showGame();
  broadcast();
}

function clueAt(c, r) {
  return state.game.categories[c].clues[r];
}

function remainingClues() {
  let n = 0;
  state.used.forEach((col, c) => col.forEach((u, r) => { if (!u && clueAt(c, r)) n++; }));
  return n;
}

function maxBoardValue() {
  let m = 0;
  for (const c of state.game.categories) for (const q of c.clues) m = Math.max(m, q.value);
  return m;
}

function ddMaxWager(team) {
  return Math.max(state.teams[team].score, maxBoardValue());
}

function openClue(c, r) {
  if (state.view !== 'board' || state.used[c][r]) return false;
  pushHistory();
  state.active = { c, r, judged: {}, showResponse: false, ddTeam: null, wager: null, ddPick: null, wagerDraft: '' };
  state.view = clueAt(c, r).dailyDouble ? 'dd-wager' : 'clue';
}

function pickDDTeam(i) {
  state.active.ddPick = i;
}

function startDD() {
  const a = state.active;
  const errBox = $('#form-error');
  if (a.ddPick === null) {
    errBox.textContent = 'Choose the team that picked the Daily Double.';
    return false;
  }
  const max = ddMaxWager(a.ddPick);
  const w = parseWager(a.wagerDraft);
  if (w === null || w > max) {
    errBox.textContent = `Enter a whole-number wager from 0 to ${formatScore(max)}.`;
    return false;
  }
  pushHistory();
  a.ddTeam = a.ddPick;
  a.wager = w;
  state.view = 'clue';
}

function judge(team, right) {
  const a = state.active;
  if (a.judged[team]) return false;
  pushHistory();
  const amount = a.ddTeam !== null ? a.wager : clueAt(a.c, a.r).value;
  state.teams[team].score += right ? amount : -amount;
  a.judged[team] = right ? 'right' : 'wrong';
  if (right || a.ddTeam !== null) a.showResponse = true;
}

function revealResponse() {
  if (state.view === 'clue') {
    if (state.active.showResponse) return false;
    pushHistory();
    state.active.showResponse = true;
  } else if (state.view === 'final-clue') {
    if (state.final.showResponse) return false;
    pushHistory();
    state.final.showResponse = true;
  }
}

function closeClue() {
  pushHistory();
  const { c, r } = state.active;
  state.used[c][r] = true;
  state.active = null;
  state.view = 'board';
}

function cancelClue() {
  pushHistory();
  state.active = null;
  state.view = 'board';
}

function startFinal() {
  if (!state.game.final || state.view !== 'board') return false;
  const left = remainingClues();
  if (left > 0 && !confirm(`There ${left === 1 ? 'is still 1 clue' : `are still ${left} clues`} on the board. Go to Final Jeopardy anyway?`)) return false;
  pushHistory();
  state.final = {
    wagerDrafts: state.teams.map(() => ''),
    wagers: null,
    judged: {},
    showResponse: false,
  };
  state.view = 'final-category';
}

function showFinalClue() {
  const f = state.final;
  const wagers = [];
  for (let i = 0; i < state.teams.length; i++) {
    const max = Math.max(state.teams[i].score, 0);
    if (max === 0) {
      wagers.push(0);
      continue;
    }
    const w = parseWager(f.wagerDrafts[i]);
    if (w === null || w > max) {
      $('#form-error').textContent = `${state.teams[i].name}: enter a whole-number wager from 0 to ${formatScore(max)}.`;
      return false;
    }
    wagers.push(w);
  }
  pushHistory();
  f.wagers = wagers;
  state.view = 'final-clue';
}

function judgeFinal(team, right) {
  const f = state.final;
  if (f.judged[team]) return false;
  pushHistory();
  state.teams[team].score += right ? f.wagers[team] : -f.wagers[team];
  f.judged[team] = right ? 'right' : 'wrong';
}

function showResults() {
  const f = state.final;
  const unjudged = state.teams.filter((_, i) => !f.judged[i]).length;
  if (unjudged && !confirm(`${unjudged} team${unjudged === 1 ? ' hasn’t' : 's haven’t'} been marked yet. Show the final results anyway?`)) return false;
  pushHistory();
  state.view = 'results';
}

function adjustScore(team) {
  const t = state.teams[team];
  const input = prompt(`New score for ${t.name}:`, String(t.score));
  if (input === null) return false;
  const n = Number(input.trim().replace(/[,−]/g, (ch) => (ch === ',' ? '' : '-')));
  if (!Number.isFinite(n) || input.trim() === '') {
    alert('Please enter a number.');
    return false;
  }
  pushHistory();
  t.score = Math.round(n);
}

function parseWager(s) {
  const t = String(s ?? '').trim().replace(/,/g, '');
  return /^\d+$/.test(t) ? Number(t) : null;
}

// ---------------------------------------------------------------------------
// Events in the game screen

function onMainClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const d = el.dataset;
  const team = Number(d.team);
  switch (d.action) {
    case 'open': return act(openClue, Number(d.c), Number(d.r));
    case 'dd-pick': return act(pickDDTeam, team);
    case 'dd-start': return act(startDD);
    case 'judge': return act(judge, team, d.right === '1');
    case 'reveal': return act(revealResponse);
    case 'close': return act(closeClue);
    case 'cancel': return act(cancelClue);
    case 'final': return act(startFinal);
    case 'final-clue': return act(showFinalClue);
    case 'final-judge': return act(judgeFinal, team, d.right === '1');
    case 'results': return act(showResults);
    case 'new-game': return endGame();
  }
}

// Typing a wager updates state without redrawing (so the input keeps focus).
function onMainInput(e) {
  const t = e.target;
  if (t.dataset.ddWager !== undefined) state.active.wagerDraft = t.value;
  if (t.dataset.finalWager !== undefined) state.final.wagerDrafts[Number(t.dataset.finalWager)] = t.value;
  $('#form-error') && ($('#form-error').textContent = '');
  save();
}

function onSideClick(e) {
  const el = e.target.closest('[data-adjust]');
  if (el) act(adjustScore, Number(el.dataset.adjust));
}

// ---------------------------------------------------------------------------
// Drawing the game screen

function showSetup() {
  $('#setup-screen').hidden = false;
  $('#game-screen').hidden = true;
  $('#btn-undo').hidden = true;
  $('#btn-final').hidden = true;
  $('#btn-new').hidden = true;
  $('#topbar-title').innerHTML = 'Jeopardy! <span class="muted">Host</span>';
}

function showGame() {
  if (!state) return showSetup();
  setMacros(state.game.macros);
  $('#setup-screen').hidden = true;
  $('#game-screen').hidden = false;

  $('#topbar-title').innerHTML = `<span class="clue-content">${state.game.titleHtml}</span> <span class="muted">Host</span>`;
  $('#btn-undo').hidden = false;
  $('#btn-undo').disabled = history.length === 0;
  $('#btn-new').hidden = false;
  $('#btn-final').hidden = !(state.view === 'board' && state.game.final);

  renderSide();
  renderMain();
}

function renderSide() {
  const rows = state.teams
    .map(
      (t, i) => `
      <div class="score-row">
        <span class="score-name">${escapeHtml(t.name)}</span>
        <span class="score-val${t.score < 0 ? ' neg' : ''}">${formatScore(t.score)}</span>
        <button class="btn link small" data-adjust="${i}">Adjust</button>
      </div>`
    )
    .join('');
  $('#host-side').innerHTML = `<h2>Scores</h2>${rows}<div class="side-meta">${remainingClues()} clue${remainingClues() === 1 ? '' : 's'} left on the board</div>`;
}

// The main area has a "content" part (with math, rebuilt only when the view
// or clue changes) and a "controls" part (rebuilt on every change).
function renderMain() {
  const a = state.active;
  const key = JSON.stringify([state.view, a && [a.c, a.r, a.ddTeam, a.wager], state.view === 'board' ? state.used : null]);
  const main = $('#host-main');
  if (key !== mainKey) {
    mainKey = key;
    setMathHTML(main, contentHtml());
  }
  const controls = $('#controls');
  if (controls) controls.innerHTML = controlsHtml();
}

function responseBoxes(clueHtml, responseHtml) {
  return `
    <div class="box box-clue clue-content"><div class="box-label">Clue</div>${clueHtml}</div>
    <div class="box box-response clue-content"><div class="box-label">Correct response (only you see this)</div>${responseHtml}</div>`;
}

function contentHtml() {
  const g = state.game;
  const a = state.active;
  switch (state.view) {
    case 'board': {
      const n = g.categories.length;
      let html = `<div class="hint">Click a clue to show it on the board. <span class="dd-badge">DD</span> marks a Daily Double; only you can see that.</div>`;
      html += `<div class="host-grid" style="grid-template-columns: repeat(${n}, minmax(0, 1fr));">`;
      for (const c of g.categories) html += `<div class="hcat clue-content">${c.nameHtml}</div>`;
      for (let r = 0; r < g.rows; r++) {
        for (let c = 0; c < n; c++) {
          const q = g.categories[c].clues[r];
          if (!q) html += `<div class="hcell empty"></div>`;
          else if (state.used[c][r]) html += `<button class="hcell used" disabled>${q.value}</button>`;
          else html += `<button class="hcell" data-action="open" data-c="${c}" data-r="${r}">${q.value}${q.dailyDouble ? '<span class="dd-badge">DD</span>' : ''}</button>`;
        }
      }
      return html + `</div><div id="controls"></div>`;
    }
    case 'dd-wager': {
      const q = clueAt(a.c, a.r);
      return `
        <div class="dd-banner">Daily Double!</div>
        <div class="clue-head"><span class="cat-name clue-content">${g.categories[a.c].nameHtml}</span><span class="amount">${q.value} square</span></div>
        <p>The board is showing <strong>DAILY DOUBLE</strong>. Choose the team and enter its wager.</p>
        <div id="controls"></div>
        <details class="peek"><summary>Peek at the clue and response</summary>${responseBoxes(q.clueHtml, q.responseHtml)}</details>`;
    }
    case 'clue': {
      const q = clueAt(a.c, a.r);
      const amount = a.ddTeam !== null
        ? `<span class="tag">Daily Double</span><span class="amount">${escapeHtml(state.teams[a.ddTeam].name)} wagered ${formatScore(a.wager)}</span>`
        : `<span class="amount">${q.value}</span>`;
      return `
        <div class="clue-head"><span class="cat-name clue-content">${g.categories[a.c].nameHtml}</span>${amount}</div>
        ${responseBoxes(q.clueHtml, q.responseHtml)}
        <div id="controls"></div>`;
    }
    case 'final-category':
      return `
        <div class="dd-banner" style="color:var(--blue)">Final Jeopardy</div>
        <div class="clue-head"><span class="muted">Category:</span><span class="cat-name clue-content">${g.final.categoryHtml}</span></div>
        <p>The board is showing the category. Enter each team’s wager (a team can wager up to its current score).</p>
        <div id="controls"></div>
        <details class="peek"><summary>Peek at the clue and response</summary>${responseBoxes(g.final.clueHtml, g.final.responseHtml)}</details>`;
    case 'final-clue':
      return `
        <div class="clue-head"><span class="tag" style="background:var(--blue)">Final Jeopardy</span><span class="cat-name clue-content">${g.final.categoryHtml}</span></div>
        ${responseBoxes(g.final.clueHtml, g.final.responseHtml)}
        <div id="controls"></div>`;
    case 'results':
      return `<h2>Final scores</h2><div id="controls"></div>`;
  }
  return '';
}

function controlsHtml() {
  const a = state.active;
  switch (state.view) {
    case 'board': {
      if (remainingClues() > 0) return '';
      return state.game.final
        ? `<div class="board-done">All clues are done. <button class="btn primary" data-action="final">Go to Final Jeopardy</button></div>`
        : `<div class="board-done">All clues are done. <button class="btn primary" data-action="new-game">End game</button></div>`;
    }

    case 'dd-wager': {
      const picks = state.teams
        .map((t, i) => `<button class="btn${a.ddPick === i ? ' selected' : ''}" data-action="dd-pick" data-team="${i}">${escapeHtml(t.name)} (${formatScore(t.score)})</button>`)
        .join('');
      const max = a.ddPick === null ? null : ddMaxWager(a.ddPick);
      return `
        <div class="team-pick">${picks}</div>
        <div class="row">
          <label>Wager <input class="wager-input" inputmode="numeric" data-dd-wager value="${escapeHtml(a.wagerDraft)}" ${a.ddPick === null ? 'disabled' : ''}></label>
          ${max === null ? '<span class="muted small">Choose a team first.</span>' : `<span class="muted small">0 to ${formatScore(max)}</span>`}
          <button class="btn primary" data-action="dd-start">Show the clue</button>
          <button class="btn link" data-action="cancel">Cancel: put this clue back</button>
        </div>
        <div class="form-error" id="form-error"></div>`;
    }

    case 'clue': {
      const q = clueAt(a.c, a.r);
      const isDD = a.ddTeam !== null;
      const amount = isDD ? a.wager : q.value;
      const someoneRight = Object.values(a.judged).includes('right');
      const teams = isDD ? [a.ddTeam] : state.teams.map((_, i) => i);
      const rows = teams
        .map((i) => {
          const t = state.teams[i];
          const j = a.judged[i];
          let buttons;
          if (j === 'right') buttons = `<span class="judged right">Correct +${formatScore(amount)}</span>`;
          else if (j === 'wrong') buttons = `<span class="judged wrong">Incorrect −${formatScore(amount)}</span>`;
          else if (someoneRight) buttons = '';
          else
            buttons = `
              <button class="btn right" data-action="judge" data-team="${i}" data-right="1">✓ Correct +${formatScore(amount)}</button>
              <button class="btn wrong" data-action="judge" data-team="${i}" data-right="0">✗ Incorrect −${formatScore(amount)}</button>`;
          return `<div class="judge-row"><span class="judge-name">${escapeHtml(t.name)}</span><span class="judge-score">${formatScore(t.score)}</span>${buttons}</div>`;
        })
        .join('');
      const nothingYet = Object.keys(a.judged).length === 0 && !a.showResponse;
      return `
        <div class="board-shows">Board shows: <strong>${a.showResponse ? 'the clue and the response' : 'the clue'}</strong></div>
        <div class="judge-list">${rows}</div>
        <div class="actions">
          <button class="btn" data-action="reveal" ${a.showResponse ? 'disabled' : ''}>Show response on board</button>
          <button class="btn primary" data-action="close">Return to board</button>
          ${nothingYet && !isDD ? '<button class="btn link" data-action="cancel">Cancel: put this clue back</button>' : ''}
        </div>`;
    }

    case 'final-category': {
      const f = state.final;
      const rows = state.teams
        .map((t, i) => {
          const max = Math.max(t.score, 0);
          const input = max === 0
            ? `<span class="muted small">Score is ${formatScore(t.score)}, so the wager is 0</span>`
            : `<input class="wager-input" inputmode="numeric" data-final-wager="${i}" value="${escapeHtml(f.wagerDrafts[i])}"> <span class="muted small">0 to ${formatScore(max)}</span>`;
          return `<div class="judge-row"><span class="judge-name">${escapeHtml(t.name)}</span><span class="judge-score">${formatScore(t.score)}</span>${input}</div>`;
        })
        .join('');
      return `
        <div class="judge-list">${rows}</div>
        <div class="actions"><button class="btn primary" data-action="final-clue">Show the Final Jeopardy clue</button></div>
        <div class="form-error" id="form-error"></div>`;
    }

    case 'final-clue': {
      const f = state.final;
      const rows = state.teams
        .map((t, i) => {
          const w = f.wagers[i];
          const j = f.judged[i];
          let buttons;
          if (j === 'right') buttons = `<span class="judged right">Correct +${formatScore(w)}</span>`;
          else if (j === 'wrong') buttons = `<span class="judged wrong">Incorrect −${formatScore(w)}</span>`;
          else
            buttons = `
              <span class="muted small">wagered ${formatScore(w)}</span>
              <button class="btn right" data-action="final-judge" data-team="${i}" data-right="1">✓ Correct</button>
              <button class="btn wrong" data-action="final-judge" data-team="${i}" data-right="0">✗ Incorrect</button>`;
          return `<div class="judge-row"><span class="judge-name">${escapeHtml(t.name)}</span><span class="judge-score">${formatScore(t.score)}</span>${buttons}</div>`;
        })
        .join('');
      return `
        <div class="board-shows">Board shows: <strong>${f.showResponse ? 'the clue and the response' : 'the clue'}</strong></div>
        <div class="judge-list">${rows}</div>
        <div class="actions">
          <button class="btn" data-action="reveal" ${f.showResponse ? 'disabled' : ''}>Show response on board</button>
          <button class="btn primary" data-action="results">Show final scores</button>
        </div>`;
    }

    case 'results': {
      const ranked = [...state.teams].sort((x, y) => y.score - x.score);
      const top = ranked.length ? ranked[0].score : 0;
      const rows = ranked
        .map((t) => `<tr class="${t.score === top ? 'winner' : ''}"><td>${escapeHtml(t.name)}</td><td>${formatScore(t.score)}</td></tr>`)
        .join('');
      return `
        <table class="results-table">${rows}</table>
        <p class="muted">The board is showing the final scores. Use Undo to go back.</p>
        <button class="btn primary" data-action="new-game">End game</button>`;
    }
  }
  return '';
}
