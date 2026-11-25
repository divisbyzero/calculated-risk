// Game files on the server: finding a game's pictures, and downloading a
// game as a .zip. Used by the host page and the landing page.

import { imagesUsed } from './texparser.js';
import { zip } from './zip.js';

// ---------------------------------------------------------------------------
// Images. Each \includegraphics path maps to { url } or { error }. A path
// without an extension tries these, in order (like pdflatex does).

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'];
export const IMAGE_ACCEPT = /\.(png|jpe?g|svg|gif|webp)$/i;

export function imageCandidates(path) {
  if (/\.[A-Za-z0-9]+$/.test(path)) return [path];
  return IMAGE_EXTS.map((x) => `${path}.${x}`);
}

export function imageFormatError(path) {
  if (/\.pdf$/i.test(path)) {
    return `${path} is a PDF. Browsers can't show PDF images; save a PNG copy and use that (pdflatex can use the PNG too).`;
  }
  if (/\.(eps|ps)$/i.test(path)) return `${path} can't be shown in a browser; save a PNG copy and use that.`;
  return null;
}

// Built-in games: images live next to the game file on the server.
export async function findImagesOnServer(text, gamePath) {
  const dir = gamePath.slice(0, gamePath.lastIndexOf('/') + 1);
  const images = new Map();
  await Promise.all(imagesUsed(text).map(async (path) => {
    const bad = imageFormatError(path);
    if (bad) return images.set(path, { error: bad });
    for (const c of imageCandidates(path)) {
      try {
        const res = await fetch(dir + c, { method: 'HEAD', cache: 'no-cache' });
        if (res.ok) return images.set(path, { url: dir + c });
      } catch {
        /* try the next one */
      }
    }
    images.set(path, { error: `Image not found: ${dir}${path}${/\.[A-Za-z0-9]+$/.test(path) ? '' : ' (tried .png, .jpg, .svg, .gif and .webp)'}.` });
  }));
  return images;
}

// Resolve "." and ".." in a path inside a zip.
export function normalizePath(path) {
  const out = [];
  for (const part of path.split('/')) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}

// ---------------------------------------------------------------------------
// Downloads

// Download a built-in game (a path inside games/, like
// "my-game/my-game.tex") as a .zip of its folder: the .tex file, the
// pictures it uses, and a copy of calculatedrisk.sty. In this repository the games
// share one master calculatedrisk.sty in games/ (\usepackage{../calculatedrisk}); the
// download puts the copy next to the .tex file and changes that line to
// \usepackage{calculatedrisk}, so the folder compiles on its own. The same .zip
// can be loaded back into the app (it accepts either form, and ignores
// calculatedrisk.sty). Returns the pictures that couldn't be found.
export async function downloadGame(file) {
  const folder = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
  const get = async (url) => {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
  const text = new TextDecoder().decode(await get(`games/${file}`));
  const entries = [
    { path: file, data: text.replace(/^([^%\n]*\\usepackage\s*(?:\[[^\]]*\])?\s*\{)\.\.\/calculatedrisk\}/gm, '$1calculatedrisk}') },
    { path: `${folder}calculatedrisk.sty`, data: await get('games/calculatedrisk.sty') },
  ];
  const seen = new Set(entries.map((e) => e.path));
  const missing = [];
  for (const [path, r] of await findImagesOnServer(text, `games/${file}`)) {
    if (!r.url) {
      missing.push(path);
      continue;
    }
    const rel = normalizePath(folder + r.url.slice(`games/${folder}`.length));
    if (seen.has(rel)) continue;
    seen.add(rel);
    entries.push({ path: rel, data: await get(`games/${rel}`) });
  }
  const name = (folder ? folder.slice(0, -1) : file.replace(/\.tex$/i, '')).replace(/^.*\//, '');
  saveBlob(zip(entries), `${name}.zip`);
  return missing;
}

// Run downloadGame from a button: show progress on the button and report
// problems with alert().
export async function downloadGameFromButton(file, btn) {
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Preparing…';
  try {
    const missing = await downloadGame(file);
    if (missing.length) alert(`The download is missing these pictures: ${missing.join(', ')}.`);
  } catch (err) {
    alert(`Couldn’t download the game: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = label;
  }
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
