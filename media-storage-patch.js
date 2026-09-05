'use strict';

// iDrama.ai media transport patch.
// Cover/Poster images are stored in the GitHub repo so Draft saves do not depend
// on Telegram Bot availability. Protected videos continue to use private Telegram storage.

const crypto = require('crypto');

const originalFetch = globalThis.fetch.bind(globalThis);
const GITHUB_TOKEN = String(process.env.GITHUB_TOKEN || '').trim();
const GITHUB_REPO = String(process.env.GITHUB_REPO || 'lensbykai-bit/iDramame').trim();
const GITHUB_BRANCH = String(process.env.GITHUB_BRANCH || 'main').trim();
const BOT_TOKEN = String(process.env.BOT_TOKEN || '').trim();
const GITHUB_COVER_PREFIX = 'ghcover:';
const GITHUB_FILE_MARKER = '__idrama_github_cover__';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function coverExtension(type = '') {
  const mime = String(type).toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

function encodeCoverPath(filePath) {
  return `${GITHUB_COVER_PREFIX}${Buffer.from(filePath, 'utf8').toString('base64url')}`;
}

function decodeCoverPath(fileId) {
  try {
    const raw = String(fileId || '');
    if (!raw.startsWith(GITHUB_COVER_PREFIX)) return '';
    return Buffer.from(raw.slice(GITHUB_COVER_PREFIX.length), 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

async function putCoverOnGitHub(blob, originalName = 'cover.jpg') {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not configured for Cover storage.');
  if (!blob || typeof blob.arrayBuffer !== 'function') throw new Error('Cover file is invalid.');

  const ext = coverExtension(blob.type || originalName);
  const safeBase = String(originalName || 'cover')
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'cover';
  const unique = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  const filePath = `public/uploads/covers/${unique}-${safeBase}.${ext}`;
  const bytes = Buffer.from(await blob.arrayBuffer());

  // Keep repository cover files reasonably small. Video files never use this path.
  if (bytes.length > 8 * 1024 * 1024) {
    throw new Error('Cover Image ធំពេក។ សូមប្រើរូបក្រោម 8 MB។');
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
  const response = await originalFetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'idramaai-cover-storage',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: `Upload cover: ${safeBase}`,
      content: bytes.toString('base64'),
      branch: GITHUB_BRANCH
    })
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Cover storage failed (${response.status}).`);
  }

  return { filePath, fileId: encodeCoverPath(filePath) };
}

function isTelegramApi(url) {
  return /^https:\/\/api\.telegram\.org\/bot/i.test(url);
}

function isTelegramFile(url) {
  return /^https:\/\/api\.telegram\.org\/file\/bot/i.test(url);
}

function friendlyTelegramUnauthorized() {
  return jsonResponse({
    ok: false,
    description: 'Telegram Media Storage មិនអាចចូលបាន។ BOT_TOKEN នៅ Render មិនត្រឹមត្រូវ ឬត្រូវបានប្តូរ។'
  }, 401);
}

globalThis.fetch = async function iDramaMediaFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : String(input?.url || input || '');

  // Serve GitHub-backed Cover IDs through the existing Telegram media abstraction.
  if (isTelegramApi(url) && /\/getFile(?:\?|$)/i.test(url)) {
    try {
      const parsed = new URL(url);
      const fileId = parsed.searchParams.get('file_id') || '';
      const coverPath = decodeCoverPath(fileId);
      if (coverPath) {
        return jsonResponse({
          ok: true,
          result: { file_path: `${GITHUB_FILE_MARKER}/${Buffer.from(coverPath, 'utf8').toString('base64url')}` }
        });
      }
    } catch {}
  }

  // When telegramFileUrl() builds a Telegram file URL for a GitHub cover,
  // transparently fetch the public repository file instead.
  if (isTelegramFile(url) && url.includes(`/${GITHUB_FILE_MARKER}/`)) {
    try {
      const encoded = url.split(`/${GITHUB_FILE_MARKER}/`)[1]?.split(/[?#]/)[0] || '';
      const coverPath = Buffer.from(encoded, 'base64url').toString('utf8');
      const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${encodeURIComponent(GITHUB_BRANCH)}/${coverPath.split('/').map(encodeURIComponent).join('/')}`;
      return originalFetch(rawUrl, init);
    } catch {
      return new Response('Cover unavailable', { status: 404 });
    }
  }

  // Cover uploads bypass Telegram entirely when GitHub persistence is available.
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
      // Fall through to Telegram only if GitHub storage could not be used.
    }
  }

  const response = await originalFetch(input, init);

  // Turn Telegram's raw "Unauthorized" into an actionable Admin message.
  if (isTelegramApi(url) && response.status === 401) {
    return friendlyTelegramUnauthorized();
  }

  return response;
};

console.log(`[media-storage-patch] Cover storage: ${GITHUB_TOKEN ? 'GitHub enabled' : 'Telegram fallback'} • Protected videos: Telegram${BOT_TOKEN ? '' : ' (BOT_TOKEN missing)'}`);
