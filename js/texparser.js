// Reads a game written as a .tex file (see games/template.tex) and turns it
// into a game object whose clue and response fields are HTML with the math
// left as LaTeX for MathJax to typeset.
//
//   parseGame(source) -> { game, errors, warnings }
//
// Errors stop a game from starting; warnings are shown but don't.

import { BOARD, clueValue, MATHJAX_MACROS } from './config.js';
import { escapeHtml } from './util.js';

const MATH_ENVS = new Set([
  'equation', 'equation*', 'align', 'align*', 'gather', 'gather*',
  'multline', 'multline*', 'alignat', 'alignat*', 'flalign', 'flalign*',
  'eqnarray', 'eqnarray*', 'displaymath', 'math',
]);

// Private-use characters used as markers while converting text.
const PH_OPEN = '';
const PH_CLOSE = '';
const PAR = '';

// ---------------------------------------------------------------------------
// Top level

// Names of the packages a game file loads with \usepackage.
export function packagesUsed(source) {
  const text = stripComments(String(source));
  const names = [];
  const re = /\\usepackage\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    for (const n of m[1].split(',')) {
      const name = n.trim();
      if (name && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

// Packages whose features MathJax already has (or that don't matter on
// screen), so a missing .sty file isn't worth a warning.
const KNOWN_PACKAGES = new Set([
  'jeopardy', 'amsmath', 'amssymb', 'amsthm', 'amsfonts', 'mathtools',
  'mathrsfs', 'bm', 'graphicx', 'xcolor', 'color', 'geometry', 'enumitem',
  'enumerate', 'hyperref', 'cleveref', 'booktabs', 'array', 'multicol',
  'todonotes', 'tikz', 'pgfplots', 'fullpage', 'fontspec', 'inputenc',
  'fontenc', 'lmodern', 'stmaryrd', 'esvect', 'accents', 'cancel',
]);

// options.packages: { name: contents of name.sty } for packages the app
// could load. Their macros are made available to MathJax.
export function parseGame(source, options = {}) {
  const packages = options.packages || {};
  const errors = [];
  const warnings = [];
  const seenWarnings = new Set();

  const text = stripComments(String(source).replace(/\r\n?/g, '\n'));

  const lineOf = (offset) => {
    let n = 1;
    for (let k = 0; k < offset && k < text.length; k++) {
      if (text.charCodeAt(k) === 10) n++;
    }
    return n;
  };
  const at = (msg, off) => (off == null ? msg : `Line ${lineOf(off)}: ${msg}`);
  const err = (msg, off) => errors.push(at(msg, off));
  const warn = (msg, off) => {
    const m = at(msg, off);
    if (!seenWarnings.has(m)) {
      seenWarnings.add(m);
      warnings.push(m);
    }
  };

  // Preamble and body
  const beginDoc = '\\begin{document}';
  const endDoc = '\\end{document}';
  const bd = text.indexOf(beginDoc);
  let preEnd, bodyStart, bodyEnd;
  if (bd >= 0) {
    preEnd = bd;
    bodyStart = bd + beginDoc.length;
    const ed = text.indexOf(endDoc, bodyStart);
    bodyEnd = ed >= 0 ? ed : text.length;
  } else {
    preEnd = text.length;
    bodyStart = 0;
    bodyEnd = text.length;
  }

  // Macros: first from loaded packages, then the file's own (which win).
  const macros = new Map();
  for (const name of packagesUsed(text.slice(0, preEnd))) {
    if (packages[name] !== undefined) {
      parseMacros(stripComments(packages[name]), null).forEach(({ name: n, def }) => macros.set(n, def));
    } else if (!KNOWN_PACKAGES.has(name)) {
      warn(`The app can't read the package ${name}, so its macros won't work on screen. To fix this, put a copy of ${name}.sty in the app's games/ folder.`);
    }
  }
  parseMacros(text.slice(0, preEnd), err).forEach(({ name: n, def }) => macros.set(n, def));
  for (const [n, def] of Object.entries(MATHJAX_MACROS)) {
    if (n === 'vv' || macros.has(n)) macros.set(n, def);
  }
  const macroNames = new Set(macros.keys());
  const defs = [...macros.values()];

  const convert = (src, off) =>
    convertTex(src, {
      macroNames,
      error: (m) => err(m, off),
      warn: (m) => warn(m, off),
    });

  // Title
  let titleText = '';
  let titleHtml = '';
  const gt = /\\gametitle(?![A-Za-z])/.exec(text);
  if (gt) {
    const g = readGroup(text, skipWs(text, gt.index + gt[0].length));
    if (g) {
      titleText = g.content.trim();
      titleHtml = convert(titleText, g.start);
    } else {
      err('\\gametitle must be followed by a title in braces, like \\gametitle{Calculus Review}.', gt.index);
    }
  }
  if (!titleText) {
    warn('No \\gametitle{...} found; the game will be called "Jeopardy!".');
    titleText = 'Jeopardy!';
    titleHtml = 'Jeopardy!';
  }

  // Categories and Final Jeopardy
  const categories = [];
  let final = null;

  const re = /\\begin\{(category|final|clue)\}/g;
  re.lastIndex = bodyStart;
  let m;
  while ((m = re.exec(text)) && m.index < bodyEnd) {
    const kind = m[1];
    const afterBegin = m.index + m[0].length;

    if (kind === 'clue') {
      err('Found \\begin{clue} outside of a category. Every clue must be inside \\begin{category}{...} ... \\end{category}.', m.index);
      const e = text.indexOf('\\end{clue}', afterBegin);
      re.lastIndex = e >= 0 ? e : bodyEnd;
      continue;
    }

    const endTag = `\\end{${kind}}`;
    const g = readGroup(text, skipWs(text, afterBegin));
    if (!g) {
      const example = kind === 'final' ? '\\begin{final}{Series}' : '\\begin{category}{Limits}';
      err(`\\begin{${kind}} must be followed by a name in braces, like ${example}.`, m.index);
      continue;
    }

    const e = text.indexOf(endTag, g.end);
    if (e < 0 || e > bodyEnd) {
      err(`Missing ${endTag} for the ${kind === 'final' ? 'Final Jeopardy' : 'category'} that starts here.`, m.index);
      break;
    }
    const nested = /\\begin\{(category|final)\}/g;
    nested.lastIndex = g.end;
    const n = nested.exec(text);
    if (n && n.index < e) {
      err(`Missing ${endTag}: a new \\begin{${n[1]}} starts before this one ends.`, m.index);
      re.lastIndex = n.index;
      continue;
    }

    const nameText = g.content.trim();
    if (!nameText) err(`The ${kind === 'final' ? 'Final Jeopardy category' : 'category name'} is empty.`, m.index);
    const nameHtml = convert(nameText, g.start);

    if (kind === 'category') {
      const clues = parseClues(text, g.end, e, nameText || `#${categories.length + 1}`, { err, warn, convert, lineOf });
      categories.push({ nameText, nameHtml, line: lineOf(m.index), clues });
    } else if (final) {
      warn('More than one Final Jeopardy found; using the first one.', m.index);
    } else {
      const parts = splitResponse(text, g.end, e, 'Final Jeopardy', m.index, { err, convert });
      final = { categoryText: nameText, categoryHtml: nameHtml, ...parts };
    }
    re.lastIndex = e + endTag.length;
  }

  // Board checks
  if (categories.length === 0) {
    err('No categories found. Write each category as \\begin{category}{Name} ... \\end{category}.');
  } else if (BOARD.enforceStandardSize) {
    if (categories.length < BOARD.minCategories || categories.length > BOARD.maxCategories) {
      const need = BOARD.minCategories === BOARD.maxCategories
        ? `exactly ${BOARD.minCategories}`
        : `${BOARD.minCategories} to ${BOARD.maxCategories}`;
      err(`The board needs ${need} categories; this file has ${categories.length}.`);
    }
    for (const c of categories) {
      if (c.clues.length !== BOARD.cluesPerCategory) {
        errors.push(`Line ${c.line}: Category "${c.nameText}" has ${c.clues.length} clue${c.clues.length === 1 ? '' : 's'}; each category needs exactly ${BOARD.cluesPerCategory}.`);
      }
    }
  } else {
    for (const c of categories) {
      if (c.clues.length === 0) errors.push(`Line ${c.line}: Category "${c.nameText}" has no clues.`);
    }
  }

  const dailyDoubles = categories.reduce((n, c) => n + c.clues.filter((x) => x.dailyDouble).length, 0);
  if (categories.length && dailyDoubles === 0) {
    warn('No Daily Double is marked. To add one, write \\begin{clue}[dailydouble].');
  }
  if (!final) {
    warn('No Final Jeopardy found. Add \\begin{final}{Category} ... \\response ... \\end{final} to include one.');
  }

  const game = {
    title: titleText,
    titleHtml,
    macros: defs.join(''),
    rows: Math.max(0, ...categories.map((c) => c.clues.length)),
    categories: categories.map(({ nameText, nameHtml, clues }) => ({ nameText, nameHtml, clues })),
    final,
    stats: {
      categories: categories.length,
      clues: categories.reduce((n, c) => n + c.clues.length, 0),
      dailyDoubles,
      solutions:
        categories.reduce((n, c) => n + c.clues.filter((x) => x.solutionHtml).length, 0) +
        (final && final.solutionHtml ? 1 : 0),
    },
  };

  return { game, errors, warnings };
}

function parseClues(text, start, end, label, ctx) {
  const clues = [];
  const re = /\\begin\{clue\}/g;
  re.lastIndex = start;
  let pos = start;
  let m;

  const checkStray = (from, to) => {
    const stray = text.slice(from, to);
    const trimmed = stray.trim();
    if (trimmed) {
      const off = from + stray.indexOf(trimmed[0]);
      ctx.warn(`Text outside of a clue in category "${label}" was ignored: "${truncate(trimmed)}"`, off);
    }
  };

  while ((m = re.exec(text)) && m.index < end) {
    checkStray(pos, m.index);
    let i = m.index + m[0].length;

    let opts = '';
    const j = skipWs(text, i);
    if (text[j] === '[') {
      const b = readBracket(text, j);
      if (b) {
        opts = b.content.trim();
        i = b.end;
      }
    }

    const e = text.indexOf('\\end{clue}', i);
    if (e < 0 || e > end) {
      ctx.err(`Missing \\end{clue} in category "${label}".`, m.index);
      pos = end;
      break;
    }
    const nb = text.indexOf('\\begin{clue}', i);
    if (nb >= 0 && nb < e) {
      ctx.err('Missing \\end{clue}: another \\begin{clue} starts before this clue ends.', m.index);
      re.lastIndex = nb;
      pos = nb;
      continue;
    }

    const row = clues.length;
    const value = clueValue(row);
    const where = `category "${label}", ${value} clue`;
    const parts = splitResponse(text, i, e, where, m.index, ctx);

    let dailyDouble = false;
    if (opts) {
      if (opts.toLowerCase() === 'dailydouble') dailyDouble = true;
      else ctx.warn(`Unknown clue option [${opts}] (${where}). The only option is [dailydouble].`, m.index);
    }

    clues.push({ value, dailyDouble, ...parts });
    pos = e + '\\end{clue}'.length;
    re.lastIndex = pos;
  }
  checkStray(pos, end);
  return clues;
}

// Split a clue into its parts: clue \response response [\solution solution].
// The solution (worked steps shown on the answer screen) is optional.
function splitResponse(text, start, end, where, off, ctx) {
  const content = text.slice(start, end);
  const resp = [...content.matchAll(/\\response(?![A-Za-z])/g)];
  const sol = [...content.matchAll(/\\solution(?![A-Za-z])/g)];
  if (resp.length === 0) {
    ctx.err(`No \\response found (${where}). Write the clue, then \\response, then the correct response.`, off);
    return { clueHtml: ctx.convert(content.trim(), start), responseHtml: '', solutionHtml: '' };
  }
  if (resp.length > 1) ctx.err(`More than one \\response (${where}).`, off);
  if (sol.length > 1) ctx.err(`More than one \\solution (${where}).`, off);

  const k = resp[0].index;
  const s = sol.length ? sol[0].index : -1;
  if (s >= 0 && s < k) {
    ctx.err(`\\solution must come after \\response (${where}).`, off);
    return { clueHtml: '', responseHtml: '', solutionHtml: '' };
  }

  const clueSrc = content.slice(0, k).trim();
  const respSrc = content.slice(k + '\\response'.length, s >= 0 ? s : content.length).trim();
  const solSrc = s >= 0 ? content.slice(s + '\\solution'.length).trim() : '';
  if (!clueSrc) ctx.err(`The clue is empty (${where}).`, off);
  if (!respSrc) ctx.err(`The response is empty (${where}).`, off);
  if (s >= 0 && !solSrc) ctx.warn(`\\solution is empty (${where}).`, off);
  return {
    clueHtml: ctx.convert(clueSrc, start),
    responseHtml: ctx.convert(respSrc, start + k),
    solutionHtml: solSrc ? ctx.convert(solSrc, start + s) : '',
  };
}

// ---------------------------------------------------------------------------
// Macros from the preamble or a package: \newcommand, \renewcommand,
// \providecommand, \DeclareMathOperator. They are handed to MathJax, so they
// work in math. Returns [{ name, def }].
//
// With err = null (reading a .sty file), anything that can't be read, and
// internal macros with @ in their names, are skipped silently.

function parseMacros(pre, err) {
  const lenient = err === null;
  const fail = (msg, off) => {
    if (!lenient) err(msg, off);
  };
  const out = [];
  const re = /\\(newcommand|renewcommand|providecommand|DeclareMathOperator)(\*?)/g;
  let m;
  while ((m = re.exec(pre))) {
    let i = skipWs(pre, m.index + m[0].length);
    let name;
    if (pre[i] === '{') {
      const g = readGroup(pre, i);
      if (!g) {
        fail(`Couldn't read the macro name after \\${m[1]}.`, m.index);
        continue;
      }
      name = g.content.trim();
      i = g.end;
    } else {
      const nm = /^\\([A-Za-z@]+|.)/.exec(pre.slice(i));
      if (!nm) {
        fail(`Couldn't read the macro name after \\${m[1]}.`, m.index);
        continue;
      }
      name = nm[0];
      i += nm[0].length;
    }
    const internal = lenient && name.includes('@');
    if (!internal && !/^\\([A-Za-z]+|.)$/.test(name)) {
      fail(`"${name}" isn't a valid macro name.`, m.index);
      continue;
    }

    let def;
    i = skipWs(pre, i);
    if (m[1] === 'DeclareMathOperator') {
      const g = readGroup(pre, i);
      if (!g) {
        fail(`Couldn't read the definition of ${name}.`, m.index);
        continue;
      }
      def = `\\newcommand{${name}}{\\operatorname${m[2]}{${g.content}}}`;
      i = g.end;
    } else {
      let nargs = '';
      let optDefault = '';
      if (pre[i] === '[') {
        const b = readBracket(pre, i);
        if (!b) {
          fail(`Couldn't read the number of arguments for ${name}.`, m.index);
          continue;
        }
        nargs = `[${b.content.trim()}]`;
        i = skipWs(pre, b.end);
        if (pre[i] === '[') {
          const d = readBracket(pre, i);
          if (d) {
            optDefault = `[${d.content}]`;
            i = skipWs(pre, d.end);
          }
        }
      }
      const g = readGroup(pre, i);
      if (!g) {
        fail(`Couldn't read the definition of ${name} (missing braces?).`, m.index);
        continue;
      }
      def = `\\newcommand{${name}}${nargs}${optDefault}{${g.content}}`;
      i = g.end;
    }
    if (!internal) out.push({ name: name.slice(1), def });
    re.lastIndex = i;
  }
  return out;
}

// ---------------------------------------------------------------------------
// LaTeX text -> HTML. Math is pulled out first and passed through untouched.

export function convertTex(src, ctx) {
  const { text, math, errors } = extractMath(src);
  errors.forEach((e) => ctx.error(e));

  const normalized = text
    .replace(/[ \t]*\n[ \t]*(\n[ \t]*)+/g, PAR) // blank line = paragraph break
    .replace(/\s+/g, ' ')
    .trim();

  const html = new TextConverter(normalized, ctx).run();
  return html
    .replace(new RegExp(`${PH_OPEN}(\\d+)${PH_CLOSE}`, 'g'), (_, k) => escapeHtml(math[Number(k)]))
    .replace(/^(<br>)+|(<br>)+$/g, '');
}

function extractMath(src) {
  const math = [];
  const errors = [];
  let out = '';
  let i = 0;
  const keep = (m) => {
    out += PH_OPEN + math.length + PH_CLOSE;
    math.push(m);
  };

  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      const n = src[i + 1];
      if (n === '(' || n === '[') {
        const close = n === '(' ? '\\)' : '\\]';
        const j = findClose(src, i + 2, close);
        if (j < 0) {
          errors.push(`Math opened with \\${n} is never closed with ${close}.`);
          out += src.slice(i);
          break;
        }
        keep(src.slice(i, j + 2));
        i = j + 2;
        continue;
      }
      const env = /^\\begin\{([A-Za-z]+\*?)\}/.exec(src.slice(i, i + 40));
      if (env && MATH_ENVS.has(env[1])) {
        const endTag = `\\end{${env[1]}}`;
        const j = src.indexOf(endTag, i);
        if (j < 0) {
          errors.push(`\\begin{${env[1]}} is never closed with ${endTag}.`);
          out += src.slice(i);
          break;
        }
        keep(src.slice(i, j + endTag.length));
        i = j + endTag.length;
        continue;
      }
      out += c + (n ?? '');
      i += 2;
      continue;
    }
    if (c === '$') {
      const delim = src[i + 1] === '$' ? '$$' : '$';
      const j = findClose(src, i + delim.length, delim);
      if (j < 0) {
        errors.push(`Unmatched ${delim}: math must open and close with ${delim}. (Write \\$ for a literal dollar sign.)`);
        out += src.slice(i);
        break;
      }
      keep(src.slice(i, j + delim.length));
      i = j + delim.length;
      continue;
    }
    out += c;
    i++;
  }
  return { text: out, math, errors };
}

function findClose(s, from, delim) {
  let i = from;
  while (i < s.length) {
    if (s.startsWith(delim, i)) return i;
    if (s[i] === '\\') {
      i += 2;
      continue;
    }
    i++;
  }
  return -1;
}

const WRAP = {
  textbf: ['<strong>', '</strong>'],
  textit: ['<em>', '</em>'],
  emph: ['<em>', '</em>'],
  textsl: ['<em>', '</em>'],
  underline: ['<u>', '</u>'],
  texttt: ['<code>', '</code>'],
  textsc: ['<span class="tex-sc">', '</span>'],
  textsf: ['<span class="tex-sf">', '</span>'],
  textrm: ['<span>', '</span>'],
  textup: ['<span>', '</span>'],
  textnormal: ['<span>', '</span>'],
  text: ['<span>', '</span>'],
  mbox: ['<span>', '</span>'],
};

const SYMBOLS = {
  ldots: '…', dots: '…', textellipsis: '…',
  quad: ' ', qquad: '  ', enspace: ' ', thinspace: ' ',
  newline: '<br>', linebreak: '<br>', par: '<br><br>',
  smallskip: '<br>', medskip: '<br>', bigskip: '<br>',
  textendash: '–', textemdash: '—',
  S: '§', P: '¶', copyright: '©', textdegree: '°',
  textasciitilde: '~', textasciicircum: '^', textbar: '|',
  textless: '&lt;', textgreater: '&gt;',
  LaTeX: 'LaTeX', TeX: 'TeX', hfill: ' ',
};

const IGNORE = new Set([
  'noindent', 'indent', 'centering', 'raggedright', 'raggedleft',
  'tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize',
  'large', 'Large', 'LARGE', 'huge', 'Huge', 'vfill', 'null', 'relax',
]);

const IGNORE_WITH_ARG = { vspace: '', 'vspace*': '', hspace: ' ', label: '' };

const ACCENTS = { "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃', '=': '̄', '.': '̇' };

const LETTER_ACCENTS = { H: '̋', v: '̌', u: '̆', c: '̧', r: '̊' };

const BLOCK_ENVS = {
  center: ['<div class="tex-center">', '</div>'],
  flushleft: ['<div class="tex-left">', '</div>'],
  flushright: ['<div class="tex-right">', '</div>'],
  quote: ['<blockquote>', '</blockquote>'],
};

class TextConverter {
  constructor(s, ctx) {
    this.s = s;
    this.i = 0;
    this.ctx = ctx;
  }

  run() {
    return this.seq(false);
  }

  seq(inGroup) {
    const s = this.s;
    let out = '';
    while (this.i < s.length) {
      const c = s[this.i];
      if (c === '}') {
        this.i++;
        if (inGroup) return out;
        this.ctx.error('Unmatched } in text.');
        continue;
      }
      if (c === '{') {
        this.i++;
        out += this.seq(true);
        continue;
      }
      if (c === '\\') {
        out += this.command();
        continue;
      }
      if (c === '~') { out += '&nbsp;'; this.i++; continue; }
      if (c === PAR) { out += '<br><br>'; this.i++; continue; }
      if (s.startsWith('---', this.i)) { out += '—'; this.i += 3; continue; }
      if (s.startsWith('--', this.i)) { out += '–'; this.i += 2; continue; }
      if (s.startsWith('``', this.i)) { out += '“'; this.i += 2; continue; }
      if (s.startsWith("''", this.i)) { out += '”'; this.i += 2; continue; }
      if (c === '`') { out += '‘'; this.i++; continue; }
      if (c === "'") { out += '’'; this.i++; continue; }
      out += escapeHtml(c);
      this.i++;
    }
    if (inGroup) this.ctx.error('Missing } in text.');
    return out;
  }

  // Argument in braces, converted to HTML.
  arg() {
    this.skipSpaces();
    if (this.s[this.i] === '{') {
      this.i++;
      return this.seq(true);
    }
    return '';
  }

  // Argument in braces, as raw text.
  rawArg() {
    this.skipSpaces();
    const g = readGroup(this.s, this.i);
    if (!g) return '';
    this.i = g.end;
    return g.content;
  }

  skipSpaces() {
    while (this.s[this.i] === ' ') this.i++;
  }

  command() {
    const s = this.s;
    this.i++; // the backslash
    const n = s[this.i];
    if (n === undefined) return '';

    if (!/[A-Za-z]/.test(n)) {
      this.i++;
      if (ACCENTS[n]) {
        let ch;
        if (s[this.i] === '{') ch = this.rawArg();
        else ch = s[this.i++] ?? '';
        return escapeHtml((ch + ACCENTS[n]).normalize('NFC'));
      }
      switch (n) {
        case '\\':
          if (s[this.i] === '[') {
            const b = readBracket(s, this.i);
            if (b) this.i = b.end;
          }
          return '<br>';
        case '$': return '\\$'; // MathJax turns \$ into a literal $
        case ' ': return ' ';
        case ',': return ' ';
        case '-': case '/': return '';
        default: return escapeHtml(n); // \% \& \# \_ \{ \}
      }
    }

    const name = /^[A-Za-z]+\*?/.exec(s.slice(this.i))[0];
    this.i += name.length;
    this.skipSpaces();

    if (WRAP[name]) {
      const [open, close] = WRAP[name];
      return open + this.arg() + close;
    }
    if (LETTER_ACCENTS[name] && this.s[this.i] === '{') {
      const ch = this.rawArg();
      return escapeHtml((ch + LETTER_ACCENTS[name]).normalize('NFC'));
    }
    if (SYMBOLS[name] !== undefined) return SYMBOLS[name];
    if (IGNORE.has(name)) return '';
    if (IGNORE_WITH_ARG[name] !== undefined) {
      this.rawArg();
      return IGNORE_WITH_ARG[name];
    }
    if (name === 'textcolor') {
      const color = this.rawArg().trim();
      const body = this.arg();
      if (/^[A-Za-z]+$/.test(color)) return `<span style="color:${color}">${body}</span>`;
      this.ctx.warn(`\\textcolor only supports named colors like red or blue (got "${color}").`);
      return body;
    }
    if (name === 'url') return `<code>${escapeHtml(this.rawArg())}</code>`;
    if (name === 'begin') return this.environment();
    if (name === 'end') {
      this.ctx.warn(`Unexpected \\end{${this.rawArg()}}.`);
      return '';
    }
    if (name === 'item') {
      this.ctx.warn('\\item used outside of itemize or enumerate.');
      return '• ';
    }

    if (this.ctx.macroNames.has(name)) {
      this.ctx.warn(`\\${name} is one of your macros, but macros only work inside math. Put it inside $...$.`);
    } else {
      this.ctx.warn(`Unknown command \\${name} in text; it will be shown as typed.`);
    }
    return escapeHtml('\\' + name);
  }

  environment() {
    const name = this.rawArg().trim();
    const body = this.envBody(name);

    if (name === 'itemize' || name === 'enumerate') {
      const tag = name === 'itemize' ? 'ul' : 'ol';
      const items = splitItems(body).map((item) => {
        let src = item;
        if (src.startsWith('[')) {
          const b = readBracket(src, 0);
          if (b) src = src.slice(b.end);
        }
        return `<li>${new TextConverter(src.trim(), this.ctx).run()}</li>`;
      });
      return `<${tag}>${items.join('')}</${tag}>`;
    }
    const inner = new TextConverter(body.trim(), this.ctx).run();
    if (BLOCK_ENVS[name]) return BLOCK_ENVS[name][0] + inner + BLOCK_ENVS[name][1];
    this.ctx.warn(`Environment ${name} isn't supported in clues; only its contents are shown.`);
    return inner;
  }

  // Text up to the matching \end{name}; leaves this.i after it.
  envBody(name) {
    const s = this.s;
    const b = `\\begin{${name}}`;
    const e = `\\end{${name}}`;
    let depth = 1;
    let j = this.i;
    while (j < s.length) {
      if (s.startsWith(b, j)) {
        depth++;
        j += b.length;
      } else if (s.startsWith(e, j)) {
        depth--;
        if (depth === 0) {
          const body = s.slice(this.i, j);
          this.i = j + e.length;
          return body;
        }
        j += e.length;
      } else {
        j++;
      }
    }
    this.ctx.error(`\\begin{${name}} is never closed with ${e}.`);
    const body = s.slice(this.i);
    this.i = s.length;
    return body;
  }
}

// Split a list body at its top-level \item commands.
function splitItems(body) {
  const items = [];
  let depth = 0; // brace depth
  let listDepth = 0;
  let start = -1;
  for (let j = 0; j < body.length; j++) {
    const c = body[j];
    if (c === '\\') {
      if (/^\\begin\{(itemize|enumerate)\}/.test(body.slice(j, j + 20))) listDepth++;
      else if (/^\\end\{(itemize|enumerate)\}/.test(body.slice(j, j + 20))) listDepth--;
      else if (depth === 0 && listDepth === 0 && /^\\item(?![A-Za-z])/.test(body.slice(j, j + 6))) {
        if (start >= 0) items.push(body.slice(start, j));
        start = j + 5;
        j += 4;
        continue;
      }
      j++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  if (start >= 0) items.push(body.slice(start));
  return items;
}

// ---------------------------------------------------------------------------
// Low-level helpers

function stripComments(t) {
  return t
    .split('\n')
    .map((line) => {
      for (let k = 0; k < line.length; k++) {
        if (line[k] === '\\') {
          k++;
          continue;
        }
        if (line[k] === '%') return line.slice(0, k);
      }
      return line;
    })
    .join('\n');
}

function skipWs(s, i) {
  while (i < s.length && /\s/.test(s[i])) i++;
  return i;
}

function readGroup(s, i) {
  if (s[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') {
      j++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return { content: s.slice(i + 1, j), start: i + 1, end: j + 1 };
    }
  }
  return null;
}

function readBracket(s, i) {
  if (s[i] !== '[') return null;
  let depth = 0;
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') {
      j++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === ']' && depth === 0) return { content: s.slice(i + 1, j), end: j + 1 };
  }
  return null;
}

function truncate(s, n = 50) {
  const one = s.replace(/\s+/g, ' ');
  return one.length > n ? one.slice(0, n) + '…' : one;
}
