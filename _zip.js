import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.data',
  '.netlify',
  '.playwright-cli',
  '.aistudio',
]);

const EXCLUDED_FILES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.DS_Store',
]);

function crc32(buf) {
  if (typeof zlib.crc32 === 'function') {
    return zlib.crc32(buf) >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosTimeDate(mtime) {
  const d = mtime instanceof Date ? mtime : new Date();
  const year = Math.max(1980, d.getFullYear());
  const dosTime =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    ((Math.floor(d.getSeconds() / 2)) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0x0f) << 5) |
    (d.getDate() & 0x1f);
  return { dosTime, dosDate };
}

function walkProjectFiles(rootDir, currentDir = rootDir, list = [], options = {}) {
  const { skipBotDir = false, skipDataDir = false, rootPrefix = '' } = options;
  if (!fs.existsSync(currentDir)) return list;
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relPathRaw = path.relative(rootDir, fullPath).replaceAll(path.sep, '/');
    const relPath = rootPrefix ? `${rootPrefix}/${relPathRaw}` : relPathRaw;

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      if (skipBotDir && currentDir === rootDir && entry.name === 'bot') continue;
      if (skipDataDir && entry.name === 'data') continue;
      walkProjectFiles(rootDir, fullPath, list, options);
      continue;
    }

    if (!entry.isFile()) continue;
    if (EXCLUDED_FILES.has(entry.name)) continue;
    if (entry.name.startsWith('.env.') && entry.name !== '.env.example') continue;
    if (entry.name.endsWith('.zip')) continue;

    list.push({ fullPath, relPath });
  }
  return list;
}

/**
 * Creates an in-memory standard PKZIP archive of the clean project source (without .env or node_modules).
 * mode: 'all' (full repo), 'site' (website + mini app without /bot and with DISABLE_BOT_POLLING="true"), 'bot' (standalone /bot folder only)
 */
export function buildProjectZipBuffer(
  rootDir = process.cwd(),
  folderPrefix = 'olmos-pay',
  mode = 'all'
) {
  const botDir = path.join(rootDir, 'bot');
  const files =
    mode === 'bot'
      ? walkProjectFiles(botDir, botDir, [], { skipDataDir: true })
      : walkProjectFiles(rootDir, rootDir, [], { skipBotDir: mode === 'site' });

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    let raw = fs.readFileSync(file.fullPath);
    if (mode === 'site' && file.relPath === '.env.example') {
      const text = raw.toString('utf8');
      const patched = text.includes('DISABLE_BOT_POLLING')
        ? text.replace(/DISABLE_BOT_POLLING=.*/g, 'DISABLE_BOT_POLLING="true"')
        : `${text.trimEnd()}\n\n# Set true when running the standalone website separately from /bot\nDISABLE_BOT_POLLING="true"\n`;
      raw = Buffer.from(patched, 'utf8');
    }
    const stat = fs.statSync(file.fullPath);
    const { dosTime, dosDate } = toDosTimeDate(stat.mtime);
    const compressed = zlib.deflateRawSync(raw, { level: 6 });
    const useDeflate = compressed.length < raw.length;
    const payload = useDeflate ? compressed : raw;
    const method = useDeflate ? 8 : 0;
    const checksum = crc32(raw);

    const entryName = folderPrefix ? `${folderPrefix}/${file.relPath}` : file.relPath;
    const nameBuf = Buffer.from(entryName, 'utf8');

    // Local File Header (30 bytes + name)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, payload);

    // Central Directory Header (46 bytes + name)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}
