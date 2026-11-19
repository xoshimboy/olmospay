import { buildProjectZipBuffer } from '../_zip.js';
import { verifyAdminAccess } from '../_lib.js';

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default function exportZipHandler(req, res) {
  const auth = verifyAdminAccess({
    headers: req.headers,
    initData: String(firstQueryValue(req.query?.initData) || ''),
    adminKey: String(firstQueryValue(req.query?.adminKey) || ''),
    adminToken: String(firstQueryValue(req.query?.adminToken) || ''),
  });

  if (!auth.ok) {
    return res.status(401).json({ ok: false, error: 'ZIP yuklash uchun admin ruxsati kerak' });
  }

  const part = String(firstQueryValue(req.query?.part) || 'all');
  const mode = part === 'bot' ? 'bot' : part === 'site' ? 'site' : 'all';
  const archiveBase = mode === 'bot' ? 'olmos-pay-bot' : mode === 'site' ? 'olmos-pay-sayt' : 'olmos-pay';

  try {
    const archive = buildProjectZipBuffer(process.cwd(), archiveBase, mode);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveBase}.zip"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(archive);
  } catch (error) {
    console.error('[ZIP export error]', error);
    return res.status(500).json({ ok: false, error: 'ZIP faylini tayyorlab bo‘lmadi' });
  }
}
