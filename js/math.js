// Small wrapper around MathJax. All typesetting goes through one queue,
// as MathJax recommends, so calls never overlap.

let queue = Promise.resolve();
let definedMacros = null;

function mathJax() {
  const M = window.MathJax;
  return M && M.startup && M.startup.promise ? M : null;
}

export function mathAvailable() {
  return mathJax() !== null;
}

function enqueue(task) {
  queue = queue.then(async () => {
    const M = mathJax();
    if (!M) return;
    await M.startup.promise;
    try {
      await task(M);
    } catch (e) {
      console.warn('MathJax:', e);
    }
  });
  return queue;
}

// Define the game's \newcommand macros. MathJax keeps definitions for the
// rest of the page's life, so this only needs to run once per game.
export function setMacros(defs) {
  if (!defs || defs === definedMacros) return queue;
  definedMacros = defs;
  return enqueue((M) => M.tex2chtmlPromise(defs));
}

export function typeset(el) {
  return enqueue((M) => M.typesetPromise([el]));
}

export function setMathHTML(el, html) {
  const M = mathJax();
  if (M && M.typesetClear) {
    try {
      M.typesetClear([el]);
    } catch {
      /* not typeset yet */
    }
  }
  el.innerHTML = html;
  return typeset(el);
}

// MathJax 3 cannot line-break display math, so a long equation can be wider
// than its box. Shrink each one that is too wide (down to MIN_SCALE); any
// that still don't fit scroll sideways (see shared.css).
const MIN_SCALE = 0.6;

export function fitWideMath(el) {
  for (const box of el.querySelectorAll('mjx-container[display="true"]')) {
    box.style.fontSize = '';
    const math = box.firstElementChild;
    if (!math) continue;
    const avail = box.clientWidth;
    const need = math.getBoundingClientRect().width;
    if (avail > 0 && need > avail) {
      box.style.fontSize = `${Math.max(MIN_SCALE, (avail - 2) / need) * 100}%`;
    }
  }
}
