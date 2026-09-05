'use strict';

// iDrama.ai resilient media storage.
// - Cover/Poster: plain GitHub-backed files (public artwork only).
// - Protected video: Telegram first, encrypted GitHub fallback when Telegram is unavailable.
// - Encrypted GitHub blobs are never playable directly; the server decrypts them in memory.

const crypto = require('crypto');

const originalFetch = globalThis.fetch.bind(globalThis);
const GITHUB_TOKEN = String(process.env.GITHUB_TOKEN || '').trim();
const GITHUB_REPO = String(process.env.GITHUB_REPO || 'lensbykai-bit/iDramame').trim();
const GITHUB_BRANCH = String(process.env.GITHUB_BRANCH || 'main').trim();
const ORIGINAL_BOT_TOKEN = String(process.env.BOT_TOKEN || '').trim();
const ORIGINAL_STORAGE_CHAT_ID = String(process.env.TELEGRAM_STORAGE_CHAT_ID || process.env.ADMIN_TELEGRAM_ID || '').trim();
const COVER_PREFIX = 'ghcover:';
const ENCRYPTED_PREFIX = 'ghenc:';
const COVER_MARKER = '__idrama_github_cover__';
const ENCRYPTED_MARKER = '__idrama_github_encrypted__';
const MAX_COVER_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
const CACHE_MAX_BYTES = 128 * 1024 * 1024;
const CACHE_TTL_MS = 10 * 60 * 1000;

const secretMaterial = String(
  process.env.MEDIA_ENCRYPTION_SECRET ||
  process.env.STREAM_SESSION_SECRET ||
  process.env.ACCESS_TOKEN_SECRET ||
  [process.env.ADMIN_PASSWORD || '', GITHUB_TOKEN, process.env.BAKONG_TOKEN || '', 'idrama-media-v1'].join('|')
).trim();
const MEDIA_KEY = secretMaterial ? crypto.createHash('sha256').update(secretMaterial).digest() : null;
const encryptedFallbackReady = Boolean(GITHUB_TOKEN && MEDIA_KEY);

// server-v3 checks that BOT_TOKEN/chat-id are non-empty before calling fetch().
// Supply child-process-only placeholders so encrypted GitHub fallback can still work
// when Telegram has not been configured at all. app.js restores them before telegram.js starts.
if (encryptedFallbackReady && !ORIGINAL_BOT_TOKEN) process.env.BOT_TOKEN = '__IDRAMA_GITHUB_MEDIA_FALLBACK__';
if (encryptedFallbackReady && !ORIGINAL_STORAGE_CHAT_ID) process.env.TELEGRAM_STORAGE_CHAT_ID = '__IDRAMA_GITHUB_MEDIA_FALLBACK__';

const decryptedCache = new Map();
let decryptedCacheBytes = 0;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}
function isTelegramApi(url) { return /^https:\/\/api\.telegram\.org\/bot/i.test(url); }
function isTelegramFile(url) { return /^https:\/\/api\.telegram\.org\/file\/bot/i.test(url); }
function safeName(value = 'media') {
  return String(value || 'media')
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'media';
}
function coverExtension(type = '', name = '') {
  const mime = String(type).toLowerCase();
  const lowerName = String(name).toLowerCase();
  if (mime.includes('png') || lowerName.endsWith('.png')) return 'png';
  if (mime.includes('webp') || lowerName.endsWith('.webp')) return 'webp';
  if (mime.includes('gif') || lowerName.endsWith('.gif')) return 'gif';
  return 'jpg';
}
function encodeCoverPath(filePath) {
  return `${COVER_PREFIX}${Buffer.from(filePath, 'utf8').toString('base64url')}`;
}
function decodeCoverPath(fileId) {
  try {
    const raw = String(fileId || '');
    if (!raw.startsWith(COVER_PREFIX)) return '';
    return Buffer.from(raw.slice(COVER_PREFIX.length), 'base64url').toString('utf8');
  } catch { return ''; }
}
function encodeEncryptedMeta(meta) {
  return `${ENCRYPTED_PREFIX}${Buffer.from(JSON.stringify(meta), 'utf8').toString('base64url')}`;
}
function decodeEncryptedMeta(fileId) {
  try {
    const raw = String(fileId || '');
    if (!raw.startsWith(ENCRYPTED_PREFIX)) return null;
    const meta = JSON.parse(Buffer.from(raw.slice(ENCRYPTED_PREFIX.length), 'base64url').toString('utf8'));
    if (!meta?.p || !meta?.iv || !meta?.tag) return null;
    return meta;
  } catch { return null; }
}
function githubRawUrl(filePath) {
  return `https://raw.githubusercontent.com/${GITHUB_REPO}/${encodeURIComponent(GITHUB_BRANCH)}/${String(filePath).split('/').map(encodeURIComponent).join('/')}`;
}
async function putGitHubFile(filePath, bytes, message) {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not configured for media storage.');
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`;
  const response = await originalFetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'idramaai-media-storage',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message, content: Buffer.from(bytes).toString('base64'), branch: GITHUB_BRANCH })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `GitHub media storage failed (${response.status}).`);
  }
  return filePath;
}
async function putCoverOnGitHub(blob, originalName = 'cover.jpg') {
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (!bytes.length) throw new Error('Cover file is empty.');
  if (bytes.length > MAX_COVER_BYTES) throw new Error('Cover Image ធំពេក។ សូមប្រើរូបក្រោម 8 MB។');
  const ext = coverExtension(blob.type, originalName);
  const unique = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  const filePath = `public/uploads/covers/${unique}-${safeName(originalName)}.${ext}`;
  await putGitHubFile(filePath, bytes, `Upload cover: ${safeName(originalName)}`);
  return { filePath, fileId: encodeCoverPath(filePath) };
}
async function putEncryptedVideoOnGitHub(blob, originalName = 'video.mp4') {
  if (!encryptedFallbackReady) throw new Error('Encrypted backup media storage is not configured.');
  const plain = Buffer.from(await blob.arrayBuffer());
  if (!plain.length) throw new Error('Video file is empty.');
  if (plain.length > MAX_VIDEO_BYTES) throw new Error('Video File ធំពេក។ សូមប្រើ File ក្រោម 45 MB។');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MEDIA_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const unique = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
  const month = new Date().toISOString().slice(0, 7);
  const filePath = `private-media/${month}/${unique}-${safeName(originalName)}.idrama`;
  await putGitHubFile(filePath, encrypted, `Store protected media: ${safeName(originalName)}`);

  const meta = {
    v: 1,
    p: filePath,
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
    mime: String(blob.type || 'video/mp4').slice(0, 80),
    size: plain.length
  };
  return { filePath, fileId: encodeEncryptedMeta(meta) };
}
function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of decryptedCache) {
    if (entry.expires <= now) {
      decryptedCache.delete(key);
      decryptedCacheBytes -= entry.bytes.length;
    }
  }
  while (decryptedCacheBytes > CACHE_MAX_BYTES && decryptedCache.size) {
    const firstKey = decryptedCache.keys().next().value;
    const entry = decryptedCache.get(firstKey);
    decryptedCache.delete(firstKey);
    decryptedCacheBytes -= entry?.bytes?.length || 0;
  }
}
async function loadDecryptedVideo(meta) {
  pruneCache();
  const cacheKey = `${meta.p}|${meta.iv}|${meta.tag}`;
  const cached = decryptedCache.get(cacheKey);
  if (cached) {
    decryptedCache.delete(cacheKey);
    decryptedCache.set(cacheKey, cached);
    cached.expires = Date.now() + CACHE_TTL_MS;
    return cached.bytes;
  }

  const response = await originalFetch(githubRawUrl(meta.p), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Encrypted media source unavailable (${response.status}).`);
  const encrypted = Buffer.from(await response.arrayBuffer());
  const decipher = crypto.createDecipheriv('aes-256-gcm', MEDIA_KEY, Buffer.from(meta.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(meta.tag, 'base64url'));
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  if (meta.size && Number(meta.size) !== plain.length) throw new Error('Encrypted media size validation failed.');

  decryptedCache.set(cacheKey, { bytes: plain, expires: Date.now() + CACHE_TTL_MS });
  decryptedCacheBytes += plain.length;
  pruneCache();
  return plain;
}
function headerValue(headersLike, name) {
  try {
    const headers = new Headers(headersLike || {});
    return headers.get(name) || '';
  } catch {
    const obj = headersLike || {};
    return String(obj[name] || obj[name.toLowerCase()] || '');
  }
}
function rangedVideoResponse(bytes, mime, rangeHeader) {
  const total = bytes.length;
  const common = {
    'content-type': mime || 'video/mp4',
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff'
  };
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader || '').trim());
  if (!match) {
    return new Response(bytes, { status: 200, headers: { ...common, 'content-length': String(total) } });
  }
  let start = match[1] ? Number(match[1]) : NaN;
  let end = match[2] ? Number(match[2]) : NaN;
  if (!Number.isFinite(start) && Number.isFinite(end)) {
    const suffix = Math.max(0, end);
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    if (!Number.isFinite(start)) start = 0;
    if (!Number.isFinite(end) || end >= total) end = total - 1;
  }
  if (start < 0 || end < start || start >= total) {
    return new Response(null, { status: 416, headers: { ...common, 'content-range': `bytes */${total}` } });
  }
  const slice = bytes.subarray(start, end + 1);
  return new Response(slice, {
    status: 206,
    headers: {
      ...common,
      'content-length': String(slice.length),
      'content-range': `bytes ${start}-${end}/${total}`
    }
  });
}
function friendlyTelegramError(status, originalDescription = '') {
  const description = status === 401
    ? 'Telegram Media Storage មិនអាចចូលបាន។ ប្រព័ន្ធនឹងប្រើ Encrypted Backup Storage ដោយស្វ័យប្រវត្តិ។'
    : (originalDescription || `Telegram Media Storage error (${status}).`);
  return jsonResponse({ ok: false, description }, status || 502);
}
function mediaBlobFromForm(form) {
  if (!(form instanceof FormData)) return null;
  return form.get('video') || form.get('document') || null;
}
function isFallbackPlaceholder(url) {
  return url.includes('__IDRAMA_GITHUB_MEDIA_FALLBACK__');
}

globalThis.fetch = async function iDramaMediaFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : String(input?.url || input || '');

  // Resolve pseudo file IDs through the existing Telegram-style media abstraction.
  if (isTelegramApi(url) && /\/getFile(?:\?|$)/i.test(url)) {
    try {
      const parsed = new URL(url);
      const fileId = parsed.searchParams.get('file_id') || '';
      const coverPath = decodeCoverPath(fileId);
      if (coverPath) {
        return jsonResponse({ ok: true, result: { file_path: `${COVER_MARKER}/${Buffer.from(coverPath, 'utf8').toString('base64url')}` } });
      }
      const encryptedMeta = decodeEncryptedMeta(fileId);
      if (encryptedMeta) {
        return jsonResponse({ ok: true, result: { file_path: `${ENCRYPTED_MARKER}/${Buffer.from(JSON.stringify(encryptedMeta), 'utf8').toString('base64url')}` } });
      }
    } catch {}
  }

  // Serve GitHub-backed public covers.
  if (isTelegramFile(url) && url.includes(`/${COVER_MARKER}/`)) {
    try {
      const encoded = url.split(`/${COVER_MARKER}/`)[1]?.split(/[?#]/)[0] || '';
      const coverPath = Buffer.from(encoded, 'base64url').toString('utf8');
      return originalFetch(githubRawUrl(coverPath), init);
    } catch {
      return new Response('Cover unavailable', { status: 404 });
    }
  }

  // Serve encrypted protected media. The encrypted blob itself remains useless outside this server.
  if (isTelegramFile(url) && url.includes(`/${ENCRYPTED_MARKER}/`)) {
    try {
      const encoded = url.split(`/${ENCRYPTED_MARKER}/`)[1]?.split(/[?#]/)[0] || '';
      const meta = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      const bytes = await loadDecryptedVideo(meta);
      return rangedVideoResponse(bytes, meta.mime || 'video/mp4', headerValue(init.headers, 'range'));
    } catch (error) {
      console.error('[encrypted-media-read]', error.message);
      return new Response('Protected media unavailable', { status: 502 });
    }
  }

  // Cover uploads never depend on Telegram when GitHub persistence is available.
  if (isTelegramApi(url) && /\/sendPhoto(?:\?|$)/i.test(url) && init?.body instanceof FormData && GITHUB_TOKEN) {
    try {
      const photo = init.body.get('photo');
      if (photo && typeof photo.arrayBuffer === 'function') {
        const stored = await putCoverOnGitHub(photo, photo.name || 'cover.jpg');
        return jsonResponse({
          ok: true,
          result: {
            message_id: 0,
            photo: [{ file_id: stored.fileId, file_unique_id: stored.fileId, width: 0, height: 0, file_size: Number(photo.size || 0) }]
          }
        });
      }
    } catch (error) {
      console.error('[cover-github-storage]', error.message);
      return jsonResponse({ ok: false, description: `Cover upload failed: ${error.message}` }, 502);
    }
  }

  // Protected videos: try Telegram first; if Telegram is missing/broken, transparently
  // store an AES-256-GCM encrypted blob in GitHub and return a pseudo Telegram file ID.
  if (isTelegramApi(url) && /\/(?:sendVideo|sendDocument)(?:\?|$)/i.test(url) && init?.body instanceof FormData) {
    const media = mediaBlobFromForm(init.body);
    if (media && typeof media.arrayBuffer === 'function') {
      let telegramResponse = null;
      if (!isFallbackPlaceholder(url)) {
        try { telegramResponse = await originalFetch(input, init); } catch {}
        if (telegramResponse?.ok) return telegramResponse;
      }

      if (encryptedFallbackReady) {
        try {
          const stored = await putEncryptedVideoOnGitHub(media, media.name || 'video.mp4');
          const field = /\/sendDocument(?:\?|$)/i.test(url) ? 'document' : 'video';
          return jsonResponse({
            ok: true,
            result: {
              message_id: 0,
              [field]: {
                file_id: stored.fileId,
                file_unique_id: stored.fileId,
                file_name: media.name || 'video.mp4',
                mime_type: media.type || 'video/mp4',
                file_size: Number(media.size || 0)
              }
            }
          });
        } catch (error) {
          console.error('[encrypted-media-storage]', error.message);
          return jsonResponse({ ok: false, description: `Protected media backup failed: ${error.message}` }, 502);
        }
      }

      if (telegramResponse) {
        const body = await telegramResponse.json().catch(() => ({}));
        return friendlyTelegramError(telegramResponse.status, body.description || '');
      }
    }
  }

  const response = await originalFetch(input, init);
  if (isTelegramApi(url) && response.status === 401) {
    return friendlyTelegramError(401);
  }
  return response;
};

function restoreTelegramEnvironment() {
  if (!ORIGINAL_BOT_TOKEN) delete process.env.BOT_TOKEN;
  else process.env.BOT_TOKEN = ORIGINAL_BOT_TOKEN;
  if (!ORIGINAL_STORAGE_CHAT_ID) delete process.env.TELEGRAM_STORAGE_CHAT_ID;
  else process.env.TELEGRAM_STORAGE_CHAT_ID = ORIGINAL_STORAGE_CHAT_ID;
}

module.exports = {
  restoreTelegramEnvironment,
  encryptedFallbackReady,
  storageMode: encryptedFallbackReady ? 'telegram+encrypted-github-fallback' : 'telegram-only'
};

console.log(`[media-storage] Covers: ${GITHUB_TOKEN ? 'GitHub' : 'Telegram'} • Protected video: ${encryptedFallbackReady ? 'Telegram + encrypted GitHub fallback' : 'Telegram only'}`);
