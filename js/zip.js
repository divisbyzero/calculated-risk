// A small .zip reader, so a game can be loaded as one file: its .tex file
// plus its pictures. It uses the browser's own DecompressionStream, so no
// library is needed. It reads the zip files that Finder ("Compress"),
// Windows ("Send to > Compressed folder") and the zip command make.

const EOCD_SIG = 0x06054b50; // end of central directory
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

// Returns a list of File objects, one per file in the zip. Each has a
// `path` property with its full path inside the zip ("my-game/rose.png").
// Folders and the extra files macOS adds (__MACOSX/, ._name, .DS_Store) are
// left out.
export async function unzip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // The end-of-central-directory record is in the last 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('it isn’t a zip file, or it is damaged');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  if (p === 0xffffffff) throw new Error('it is too large (zip64 isn’t supported)');

  const files = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== CENTRAL_SIG) throw new Error('it is damaged');
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const nameBytes = buf.subarray(p + 46, p + 46 + nameLen);
    const path = new TextDecoder().decode(nameBytes);
    p += 46 + nameLen + extraLen + commentLen;

    const base = path.slice(path.lastIndexOf('/') + 1);
    if (path.endsWith('/') || !base) continue;
    if (/(^|\/)__MACOSX\//.test(path) || base.startsWith('._') || base === '.DS_Store') continue;
    if (flags & 1) throw new Error(`${path} is password-protected`);

    if (view.getUint32(localOffset, true) !== LOCAL_SIG) throw new Error('it is damaged');
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = buf.subarray(start, start + compSize);

    let data;
    if (method === 0) {
      data = raw;
    } else if (method === 8) {
      data = await inflate(raw);
    } else {
      throw new Error(`${path} uses a compression method this page can’t read`);
    }
    const file = new File([data], base, { type: mimeType(base) });
    file.path = path;
    files.push(file);
  }
  return files;
}

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('this browser can’t unzip files; please update it, or choose the files without zipping them');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function mimeType(name) {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    tex: 'text/x-tex',
    sty: 'text/x-tex',
  }[ext] || 'application/octet-stream';
}
