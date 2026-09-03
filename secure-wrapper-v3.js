'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const OUTER_PORT = Number(process.env.PORT || 3000);
const configuredInner = Number(process.env.SECURE_INNER_PORT || 3101);
const INNER_PORT = configuredInner === OUTER_PORT ? OUTER_PORT + 1 : configuredInner;
const INNER_HOST = '127.0.0.1';
const COOKIE_NAME = '__Host-idrama_stream';
const STORIES_PATH = path.join(__dirname, 'stories.json');

const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://kbanmyaqodtfoqikzwou.supabase.co').replace(/\/$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_7iqItoUm3UU8Vn24VZvC7Q_0AoTUrzo');
const CHECKOUT_FUNCTION = String(process.env.SUPABASE_CHECKOUT_FUNCTION || `${SUPABASE_URL}/functions/v1/idrama-checkout`);

const HOUR = 60 * 60 * 1000;
const STREAM_SESSION_TTL_MS = Math.max(20 * 60 * 1000, Math.min(Number(process.env.STREAM_SESSION_TTL_MS || 2 * HOUR), 6 * HOUR));
const MAX_DEVICES_PER_LINK = 1;
const MAX_IPS_PER_LINK = 2;
const MAX_CONCURRENT_STREAMS = Math.max(1, Math.min(Number(process.env.MAX_CONCURRENT_STREAMS || 3), 5));

const BAKONG_TOKEN = process.env.BAKONG_TOKEN || '';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const derivedAccessSecret = (BAKONG_TOKEN || BOT_TOKEN)
  ? crypto.createHash('sha256').update(`idramaai|${BAKONG_TOKEN}|${BOT_TOKEN}`).digest('hex')
  : '';
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || derivedAccessSecret;
const SESSION_SECRET = process.env.STREAM_SESSION_SECRET || ACCESS_TOKEN_SECRET || crypto.createHash('sha256').update(`idrama-stream-v3|${ADMIN_PASSWORD}|${process.cwd()}`).digest('hex');
const SESSION_KEY = crypto.createHash('sha256').update(`idrama-stream-session-v3|${SESSION_SECRET}`).digest();

const blockedAgent = /(curl|wget|yt-dlp|youtube-dl|aria2|python-requests|python\/|libwww|go-http-client|ffmpeg|vlc|postman|insomnia|httpie|powershell|okhttp|axios)/i;
const browserAgent = /(mozilla\/5\.0|applewebkit|chrome|safari|firefox|edg\/|opr\/)/i;
const activationMap = new Map();
const rateMap = new Map();
const activeStreams = new Map();

function sha256(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex'); }
function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}
function fingerprint(req) { return sha256(`${req.headers['user-agent'] || ''}|${req.headers['accept-language'] || ''}`); }
function sameOriginRequest(req) {
  const host = String(req.headers.host || '').toLowerCase();
  const origin = String(req.headers.origin || '');
  const referer = String(req.headers.referer || '');
  const site = String(req.headers['sec-fetch-site'] || '');
  if (site && !['same-origin', 'same-site', 'none'].includes(site)) return false;
  try { if (origin && new URL(origin).host.toLowerCase() !== host) return false; } catch { return false; }
  try { if (referer && new URL(referer).host.toLowerCase() !== host) return false; } catch { return false; }
  return true;
}
function looksLikeBrowser(req) {
  const ua = String(req.headers['user-agent'] || '');
  if (blockedAgent.test(ua)) return false;
  return browserAgent.test(ua);
}
function rateAllowed(key, max, windowMs) {
  const now = Date.now();
  const current = rateMap.get(key);
  if (!current || current.reset <= now) {
    rateMap.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= max;
}
function pruneMaps() {
  const now = Date.now();
  for (const [key, value] of rateMap) if (value.reset <= now) rateMap.delete(key);
  for (const [key, value] of activationMap) if (value.expires <= now) activationMap.delete(key);
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function sealSession(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SESSION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}
function openSession(req) {
  try {
    const raw = parseCookies(req)[COOKIE_NAME];
    if (!raw) return null;
    const [ivRaw, tagRaw, encryptedRaw] = raw.split('.');
    if (!ivRaw || !tagRaw || !encryptedRaw) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', SESSION_KEY, Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    const json = Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64url')), decipher.final()]).toString('utf8');
    const session = JSON.parse(json);
    if (!session.exp || Date.now() > Number(session.exp)) return null;
    if (!session.token || !session.storyId || !session.fp || !session.userId) return null;
    if (!safeEqual(session.fp, fingerprint(req))) return null;
    return session;
  } catch { return null; }
}
function sessionCookie(session) {
  const maxAge = Math.max(60, Math.floor((session.exp - Date.now()) / 1000));
  return `${COOKIE_NAME}=${encodeURIComponent(sealSession(session))}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}
function clearSessionCookie() { return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`; }

function loadStories() {
  try {
    const rows = JSON.parse(fs.readFileSync(STORIES_PATH, 'utf8'));
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}
function storyById(id) { return loadStories().find(story => String(story.id) === String(id)); }
function episodeList(story) {
  if (String(story?.content_type || '') !== 'series' || !Array.isArray(story?.episodes)) return [];
  return story.episodes
    .map((ep, index) => ({
      id: String(ep?.id || `ep-${index + 1}`),
      title: String(ep?.title || `ភាគ ${index + 1}`),
      fileId: String(ep?.file_id || ep?.video_file_id || ''),
      url: String(ep?.url || ep?.video_url || '')
    }))
    .filter(ep => ep.fileId || ep.url);
}
function publicEpisodeList(story) { return episodeList(story).map(ep => ({ id: ep.id, title: ep.title })); }
function classifyMedia(fileId) {
  for (const story of loadStories()) {
    if (story.full_video_file_id && String(story.full_video_file_id) === fileId) return 'full';
    if (episodeList(story).some(ep => ep.fileId === fileId)) return 'full';
    if (story.preview_video_file_id && String(story.preview_video_file_id) === fileId) return 'trailer';
    if (story.cover_file_id && String(story.cover_file_id) === fileId) return 'cover';
  }
  return 'unknown';
}
function playbackInfo(story) {
  const isSeries = String(story?.content_type || '') === 'series';
  const episodes = isSeries ? publicEpisodeList(story) : [];
  return {
    contentType: isSeries ? 'series' : 'movie',
    episodes,
    firstVideoUrl: isSeries && episodes[0]
      ? `/secure/video/${encodeURIComponent(story.id)}?episode=${encodeURIComponent(episodes[0].id)}`
      : `/secure/video/${encodeURIComponent(story.id)}`
  };
}

function maskIdentity(user) {
  const rawPhone = user?.user_metadata?.login_phone || user?.user_metadata?.display_phone || user?.phone || '';
  if (rawPhone) {
    const digits = String(rawPhone).replace(/\D/g, '');
    return digits.length > 4 ? `+${digits.slice(0, 3)}••••••${digits.slice(-3)}` : 'Phone account';
  }
  const email = String(user?.email || '');
  if (email.includes('@')) {
    const [name, domain] = email.split('@');
    return `${name.slice(0, 2)}•••@${domain}`;
  }
  return `User ${String(user?.id || '').slice(0, 8)}`;
}
async function validateSupabaseUser(accessToken) {
  if (!accessToken || !SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
    if (!response.ok) return null;
    const user = await response.json();
    return user?.id ? user : null;
  } catch { return null; }
}
async function userOwnsStory(accessToken, storyId) {
  try {
    const response = await fetch(CHECKOUT_FUNCTION, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'library' }),
      cache: 'no-store'
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => ({}));
    const purchases = Array.isArray(data.purchases) ? data.purchases : [];
    return purchases.some(item => String(item.story_id || item.storyId || '') === String(storyId));
  } catch { return false; }
}
function verifyServerWatchToken(token) {
  if (!ACCESS_TOKEN_SECRET) return { payload: null, verified: false };
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return { payload: null, verified: true };
    const expected = crypto.createHmac('sha256', ACCESS_TOKEN_SECRET).update(body).digest('base64url');
    if (!safeEqual(sig, expected)) return { payload: null, verified: true };
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > Number(payload.exp)) return { payload: null, verified: true };
    if (payload.kind !== 'watch' && !payload.orderId) return { payload: null, verified: true };
    return { payload, verified: true };
  } catch { return { payload: null, verified: true }; }
}
function allowActivation(token, req, userId) {
  pruneMaps();
  const key = sha256(token);
  const fp = fingerprint(req);
  const ip = clientIp(req);
  let record = activationMap.get(key);
  if (!record) {
    record = { userId, devices: new Set(), ips: new Set(), expires: Date.now() + STREAM_SESSION_TTL_MS };
    activationMap.set(key, record);
  }
  if (record.userId !== userId) return false;
  if (!record.devices.has(fp) && record.devices.size >= MAX_DEVICES_PER_LINK) return false;
  if (!record.ips.has(ip) && record.ips.size >= MAX_IPS_PER_LINK) return false;
  record.devices.add(fp);
  record.ips.add(ip);
  return true;
}

function setSecurityHeaders(res, protectedContent = false) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), display-capture=(), payment=(), usb=(), bluetooth=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; worker-src 'self' blob:;");
  if (protectedContent) {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  }
}
function sendJson(res, status, data, extraHeaders = {}) {
  res.statusCode = status;
  setSecurityHeaders(res, true);
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}
function copyHeaders(upstream, res, protectedContent = false) {
  const skip = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','server','set-cookie']);
  for (const [name, value] of Object.entries(upstream.headers)) {
    if (!skip.has(name.toLowerCase()) && value !== undefined) res.setHeader(name, value);
  }
  setSecurityHeaders(res, protectedContent);
  if (protectedContent) { res.setHeader('Content-Disposition', 'inline'); res.setHeader('Accept-Ranges', 'bytes'); }
}
function proxyStream(req, res, targetPath, protectedContent = false, onDone = null) {
  const headers = { ...req.headers, host: `${INNER_HOST}:${INNER_PORT}` };
  delete headers.connection;
  const upstreamReq = http.request({ host: INNER_HOST, port: INNER_PORT, method: req.method, path: targetPath, headers }, upstream => {
    res.statusCode = upstream.statusCode || 502;
    copyHeaders(upstream, res, protectedContent);
    upstream.pipe(res);
    upstream.on('end', () => onDone?.());
    upstream.on('close', () => onDone?.());
  });
  upstreamReq.on('error', error => {
    console.error('[security-proxy-v3]', error.message);
    onDone?.();
    if (!res.headersSent) sendJson(res, 502, { error: 'Service temporarily unavailable.' }); else res.destroy();
  });
  req.on('aborted', () => onDone?.());
  req.pipe(upstreamReq);
}
function proxyBufferedGet(req, targetPath) {
  return new Promise((resolve, reject) => {
    const headers = { ...req.headers, host: `${INNER_HOST}:${INNER_PORT}` };
    delete headers.connection;
    delete headers['content-length'];
    const upstreamReq = http.request({ host: INNER_HOST, port: INNER_PORT, method: 'GET', path: targetPath, headers }, upstream => {
      const chunks = [];
      let size = 0;
      upstream.on('data', chunk => {
        size += chunk.length;
        if (size > 1024 * 1024) { upstream.destroy(); reject(new Error('Upstream response too large.')); return; }
        chunks.push(chunk);
      });
      upstream.on('end', () => resolve({ status: upstream.statusCode || 502, body: Buffer.concat(chunks) }));
    });
    upstreamReq.on('error', reject);
    upstreamReq.end();
  });
}

async function handleAccess(req, res, url) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });
  if (!sameOriginRequest(req) || !looksLikeBrowser(req)) return sendJson(res, 403, { error: 'Protected playback request blocked.' });
  if (!rateAllowed(`access:${clientIp(req)}`, 20, 60 * 1000)) return sendJson(res, 429, { error: 'Too many playback requests.' });
  const token = String(url.searchParams.get('token') || '');
  if (!token) return handleSessionAccess(req, res);

  const auth = String(req.headers.authorization || '');
  const accessToken = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const user = await validateSupabaseUser(accessToken);
  if (!user) return sendJson(res, 401, { error: 'សូម Login គណនីរបស់អ្នក ហើយបើករឿងពី My Library ម្តងទៀត។' });
  const checked = verifyServerWatchToken(token);
  if (checked.verified && !checked.payload) return sendJson(res, 401, { error: 'Watch link មិនត្រឹមត្រូវ ឬផុតកំណត់។' });

  try {
    const upstream = await proxyBufferedGet(req, `/api/access?token=${encodeURIComponent(token)}`);
    const data = JSON.parse(upstream.body.toString('utf8') || '{}');
    if (upstream.status !== 200) return sendJson(res, upstream.status, { error: data.error || 'Access denied.' });
    const storyId = String(data.story?.id || checked.payload?.storyId || '');
    const story = storyById(storyId);
    if (!story) return sendJson(res, 404, { error: 'Story not found.' });
    if (checked.payload && String(checked.payload.storyId) !== storyId) return sendJson(res, 401, { error: 'Access mismatch.' });
    const owns = await userOwnsStory(accessToken, storyId);
    if (!owns) return sendJson(res, 403, { error: 'គណនីនេះមិនមានសិទ្ធិមើលរឿងនេះនៅក្នុង My Library ទេ។' });
    if (!allowActivation(token, req, user.id)) return sendJson(res, 403, { error: 'Watch link នេះត្រូវបានភ្ជាប់ជាមួយគណនី ឬឧបករណ៍ផ្សេងរួចហើយ។' });

    const session = {
      sid: crypto.randomBytes(16).toString('base64url'),
      storyId,
      orderId: String(data.orderId || checked.payload?.orderId || ''),
      userId: String(user.id),
      viewer: maskIdentity(user),
      token,
      fp: fingerprint(req),
      exp: Date.now() + STREAM_SESSION_TTL_MS
    };
    const playback = playbackInfo(story);
    return sendJson(res, 200, {
      story: { id: storyId, title: story.title || data.story?.title || '', contentType: playback.contentType },
      episodes: playback.episodes,
      orderId: session.orderId,
      viewer: session.viewer,
      sessionId: session.sid.slice(0, 10),
      sessionExpiresAt: session.exp,
      videoUrl: playback.firstVideoUrl
    }, { 'Set-Cookie': sessionCookie(session) });
  } catch (error) {
    console.error('[secure-access-v3]', error.message);
    return sendJson(res, 502, { error: 'Unable to establish protected playback session.' });
  }
}
function handleSessionAccess(req, res) {
  const session = openSession(req);
  if (!session) return sendJson(res, 401, { error: 'Playback session ផុតកំណត់។ សូមបើករឿងពី My Library ម្តងទៀត។' }, { 'Set-Cookie': clearSessionCookie() });
  const story = storyById(session.storyId);
  if (!story) return sendJson(res, 404, { error: 'Story not found.' });
  const playback = playbackInfo(story);
  return sendJson(res, 200, {
    story: { id: String(story.id), title: story.title || '', contentType: playback.contentType },
    episodes: playback.episodes,
    orderId: session.orderId || '',
    viewer: session.viewer || '',
    sessionId: String(session.sid || '').slice(0, 10),
    sessionExpiresAt: session.exp,
    videoUrl: playback.firstVideoUrl
  });
}
function handleSecureVideo(req, res, storyId, url) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });
  if (!sameOriginRequest(req) || !looksLikeBrowser(req)) return sendJson(res, 403, { error: 'Protected stream blocked.' });
  const session = openSession(req);
  if (!session || String(session.storyId) !== String(storyId)) return sendJson(res, 401, { error: 'Playback session expired.' });
  const story = storyById(storyId);
  if (!story) return sendJson(res, 404, { error: 'Story not found.' });
  const isSeries = String(story.content_type || '') === 'series';
  const requestedEpisode = String(url.searchParams.get('episode') || '');
  if (isSeries) {
    const episodes = episodeList(story);
    if (!requestedEpisode || !episodes.some(ep => ep.id === requestedEpisode)) return sendJson(res, 404, { error: 'Episode not found.' });
  }
  if (!rateAllowed(`video:${session.sid}:${clientIp(req)}`, 700, 10 * 60 * 1000)) return sendJson(res, 429, { error: 'Playback request limit reached.' });

  const current = Number(activeStreams.get(session.sid) || 0);
  if (current >= MAX_CONCURRENT_STREAMS) return sendJson(res, 429, { error: 'Too many simultaneous stream connections.' });
  activeStreams.set(session.sid, current + 1);
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    const next = Math.max(0, Number(activeStreams.get(session.sid) || 1) - 1);
    if (next) activeStreams.set(session.sid, next); else activeStreams.delete(session.sid);
  };
  const episodePart = isSeries ? `&episode=${encodeURIComponent(requestedEpisode)}` : '';
  return proxyStream(req, res, `/api/video/${encodeURIComponent(storyId)}?token=${encodeURIComponent(session.token)}${episodePart}`, true, done);
}
function handleMedia(req, res, fileId) {
  const kind = classifyMedia(fileId);
  if (kind === 'full' || kind === 'unknown') return sendJson(res, 404, { error: 'Media not found.' });
  if (kind === 'trailer') {
    if (!sameOriginRequest(req) || !looksLikeBrowser(req)) return sendJson(res, 403, { error: 'Trailer request blocked.' });
    if (!rateAllowed(`trailer:${clientIp(req)}`, 240, 10 * 60 * 1000)) return sendJson(res, 429, { error: 'Too many media requests.' });
  }
  return proxyStream(req, res, req.url, kind === 'trailer');
}
function handleAdmin(req, res) {
  if (!sameOriginRequest(req) || !looksLikeBrowser(req)) return sendJson(res, 403, { error: 'Admin request blocked.' });
  if (!rateAllowed(`admin:${clientIp(req)}`, 160, 10 * 60 * 1000)) return sendJson(res, 429, { error: 'Too many admin requests.' });
  return proxyStream(req, res, req.url, true);
}

const childEnv = { ...process.env, PORT: String(INNER_PORT) };
const child = spawn(process.execPath, [path.join(__dirname, 'app.js')], { env: childEnv, stdio: 'inherit' });
child.on('exit', (code, signal) => {
  console.error(`[security-gateway-v3] Internal app stopped (code=${code}, signal=${signal || 'none'}).`);
  setTimeout(() => process.exit(code || 1), 100);
});

const server = http.createServer((req, res) => {
  pruneMaps();
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  setSecurityHeaders(res, pathname === '/watch.html' || pathname.startsWith('/secure/') || pathname.startsWith('/api/access'));

  if (pathname === '/health') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: true, securityGateway: 'v3-account-bound-series' }));
  }
  if (pathname === '/api/access') return handleAccess(req, res, url);
  if (pathname === '/secure/access') return handleSessionAccess(req, res);
  if (pathname.startsWith('/secure/video/')) return handleSecureVideo(req, res, decodeURIComponent(pathname.slice('/secure/video/'.length)), url);
  if (pathname.startsWith('/api/video/')) return sendJson(res, 404, { error: 'Not found.' });
  if (pathname.startsWith('/api/media/')) return handleMedia(req, res, decodeURIComponent(pathname.slice('/api/media/'.length)));
  if (pathname.startsWith('/api/admin/')) return handleAdmin(req, res);
  if (pathname === '/watch.html') res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
  return proxyStream(req, res, req.url || '/', pathname === '/watch.html');
});

server.listen(OUTER_PORT, '0.0.0.0', () => {
  console.log(`[security-gateway-v3] Public :${OUTER_PORT} -> internal ${INNER_HOST}:${INNER_PORT}`);
  console.log(`[security-gateway-v3] Movie + Series protected playback enabled; session ${Math.round(STREAM_SESSION_TTL_MS / 60000)} minutes`);
});
function shutdown(signal) {
  console.log(`[security-gateway-v3] ${signal} received.`);
  try { child.kill('SIGTERM'); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
