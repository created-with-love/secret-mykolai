// Таємний Миколай — Cloudflare Worker + D1

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

const SESSION_DAYS = 60;
const PBKDF2_ITER = 100000;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await route(req, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Щось пішло не так. Спробуй ще раз.' }, 500);
    }
  },
};

async function route(req, env, url) {
  const p = url.pathname;
  const m = req.method;
  if (p === '/api/register' && m === 'POST') return register(req, env);
  if (p === '/api/login' && m === 'POST') return login(req, env);
  if (p === '/api/logout' && m === 'POST') return logout(req, env);
  if (p === '/api/me' && m === 'GET') return getMe(req, env);
  if (p === '/api/me' && m === 'PUT') return updateMe(req, env);
  if (p === '/api/admin/status' && m === 'GET') return adminStatus(req, env);
  if (p === '/api/admin/draw' && m === 'POST') return adminDraw(req, env, url);
  if (p === '/api/admin/reset' && m === 'POST') return adminReset(req, env);
  throw new HttpError(404, 'Не знайдено');
}

// ---------- helpers ----------

async function body(req) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Некоректний запит');
  }
}

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const randomToken = (n = 32) => b64(crypto.getRandomValues(new Uint8Array(n))).replace(/[+/=]/g, '');

async function hashPassword(password, saltB64) {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256);
  return b64(bits);
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function getCookie(req, name) {
  const c = req.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

function sessionCookie(token, maxAge) {
  return `sid=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function createSession(env, userId) {
  const token = randomToken();
  const expires = Date.now() + SESSION_DAYS * 86400 * 1000;
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').bind(token, userId, expires).run();
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token, SESSION_DAYS * 86400) });
}

async function requireUser(req, env) {
  const token = getCookie(req, 'sid');
  if (!token) throw new HttpError(401, 'Потрібно увійти');
  const user = await env.DB.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?'
  ).bind(token, Date.now()).first();
  if (!user) throw new HttpError(401, 'Сесія завершилась, увійди знову');
  return user;
}

function requireAdmin(req, env) {
  const key = req.headers.get('x-admin-key') || '';
  if (!env.ADMIN_KEY || !safeEqual(key, env.ADMIN_KEY)) throw new HttpError(403, 'Немає доступу');
}

const normUsername = (u) => String(u || '').trim().toLowerCase();
const expected = (env) => parseInt(env.EXPECTED_PARTICIPANTS || '6', 10);

async function isDrawn(env) {
  const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'drawn_at'").first();
  return row ? Number(row.value) : null;
}

function parseLinks(s) {
  try {
    const v = JSON.parse(s || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// ---------- auth ----------

async function register(req, env) {
  const { username, password, invite } = await body(req);
  if (!env.INVITE_CODE || !safeEqual(String(invite || '').trim(), env.INVITE_CODE)) {
    throw new HttpError(403, 'Невірний код запрошення');
  }
  const uname = normUsername(username);
  if (!/^[\p{L}\p{N}._-]{2,30}$/u.test(uname)) {
    throw new HttpError(400, 'Логін: 2–30 символів, літери, цифри, «.», «_» або «-»');
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 200) {
    throw new HttpError(400, 'Пароль має містити щонайменше 6 символів');
  }
  if (await isDrawn(env)) throw new HttpError(409, 'Жеребкування вже відбулося — реєстрацію закрито');
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
  if (n >= expected(env)) throw new HttpError(409, 'Усі місця вже зайняті');
  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(uname).first();
  if (exists) throw new HttpError(409, 'Такий логін уже зайнятий');

  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await hashPassword(password, salt);
  const res = await env.DB.prepare('INSERT INTO users (username, pass_hash, salt, created_at) VALUES (?, ?, ?, ?)')
    .bind(uname, hash, salt, Date.now()).run();
  return createSession(env, res.meta.last_row_id);
}

async function login(req, env) {
  const { username, password } = await body(req);
  const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(normUsername(username)).first();
  if (!user || !safeEqual(await hashPassword(String(password || ''), user.salt), user.pass_hash)) {
    throw new HttpError(401, 'Невірний логін або пароль');
  }
  return createSession(env, user.id);
}

async function logout(req, env) {
  const token = getCookie(req, 'sid');
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
}

// ---------- profile ----------

async function getMe(req, env) {
  const me = await requireUser(req, env);
  const { results } = await env.DB.prepare('SELECT id, display_name, partner_id, profile_done FROM users ORDER BY id').all();
  const drawnAt = await isDrawn(env);

  let assignment = null;
  if (drawnAt) {
    const r = await env.DB.prepare(
      'SELECT u.display_name, u.wishes, u.links FROM assignments a JOIN users u ON u.id = a.receiver_id WHERE a.giver_id = ?'
    ).bind(me.id).first();
    if (r) assignment = { name: r.display_name, wishes: r.wishes, links: parseLinks(r.links) };
  }

  return json({
    me: {
      id: me.id,
      username: me.username,
      displayName: me.display_name,
      partnerId: me.partner_id,
      wishes: me.wishes,
      links: parseLinks(me.links),
      profileDone: !!me.profile_done,
    },
    participants: results.map((u) => ({
      id: u.id,
      name: u.display_name || null,
      partnerId: u.partner_id,
      profileDone: !!u.profile_done,
    })),
    expected: expected(env),
    drawnAt,
    assignment,
  });
}

async function updateMe(req, env) {
  const me = await requireUser(req, env);
  const data = await body(req);

  const displayName = String(data.displayName || '').trim();
  if (displayName.length < 1 || displayName.length > 40) throw new HttpError(400, "Вкажи своє ім'я (до 40 символів)");

  const wishes = String(data.wishes || '').trim();
  if (wishes.length > 3000) throw new HttpError(400, 'Побажання задовгі (максимум 3000 символів)');

  const rawLinks = Array.isArray(data.links) ? data.links : [];
  if (rawLinks.length > 15) throw new HttpError(400, 'Максимум 15 посилань');
  const links = [];
  for (const l of rawLinks) {
    const urlStr = String(l?.url || '').trim();
    const title = String(l?.title || '').trim().slice(0, 100);
    if (!urlStr) continue;
    let u;
    try {
      u = new URL(urlStr);
    } catch {
      throw new HttpError(400, `Некоректне посилання: ${urlStr.slice(0, 60)}`);
    }
    if (!['http:', 'https:'].includes(u.protocol) || urlStr.length > 1000) {
      throw new HttpError(400, `Некоректне посилання: ${urlStr.slice(0, 60)}`);
    }
    links.push({ title, url: u.toString() });
  }

  const partnerId = data.partnerId == null || data.partnerId === '' ? null : Number(data.partnerId);
  const stmts = [];

  if (partnerId !== me.partner_id) {
    if (await isDrawn(env)) throw new HttpError(409, 'Після жеребкування змінити пару вже не можна');
    if (partnerId !== null) {
      if (partnerId === me.id) throw new HttpError(400, 'Не можна бути в парі з собою 🙂');
      const partner = await env.DB.prepare('SELECT id, partner_id FROM users WHERE id = ?').bind(partnerId).first();
      if (!partner) throw new HttpError(400, 'Такого учасника немає');
      if (partner.partner_id !== null && partner.partner_id !== me.id) {
        throw new HttpError(409, 'Ця людина вже в парі з кимось іншим');
      }
    }
    // Розірвати стару пару
    if (me.partner_id !== null) {
      stmts.push(env.DB.prepare('UPDATE users SET partner_id = NULL WHERE id = ? AND partner_id = ?').bind(me.partner_id, me.id));
    }
    // Пара завжди взаємна
    if (partnerId !== null) {
      stmts.push(env.DB.prepare('UPDATE users SET partner_id = ? WHERE id = ?').bind(me.id, partnerId));
    }
  }

  stmts.push(
    env.DB.prepare(
      'UPDATE users SET display_name = ?, partner_id = ?, wishes = ?, links = ?, profile_done = 1 WHERE id = ?'
    ).bind(displayName, partnerId, wishes, JSON.stringify(links), me.id)
  );
  await env.DB.batch(stmts);
  return json({ ok: true });
}

// ---------- admin ----------

async function readiness(env) {
  const { results: users } = await env.DB.prepare('SELECT id, display_name, partner_id, profile_done FROM users ORDER BY id').all();
  const byId = new Map(users.map((u) => [u.id, u]));
  const problems = [];
  if (users.length !== expected(env)) problems.push(`Зареєстровано ${users.length} з ${expected(env)}`);
  for (const u of users) {
    const name = u.display_name || `user#${u.id}`;
    if (!u.profile_done) problems.push(`${name}: не заповнив(ла) профіль`);
    else if (u.partner_id === null) problems.push(`${name}: не вказав(ла) половинку`);
    else if (byId.get(u.partner_id)?.partner_id !== u.id) problems.push(`${name}: пара не взаємна`);
  }
  return { users, problems };
}

async function adminStatus(req, env) {
  requireAdmin(req, env);
  const { users, problems } = await readiness(env);
  const byId = new Map(users.map((u) => [u.id, u]));
  return json({
    drawnAt: await isDrawn(env),
    ready: problems.length === 0,
    problems,
    participants: users.map((u) => ({
      name: u.display_name || `user#${u.id}`,
      partner: u.partner_id ? byId.get(u.partner_id)?.display_name || null : null,
      profileDone: !!u.profile_done,
    })),
  });
}

function randomInt(n) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / n) * n;
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Кожен дарує комусь, хто не він сам і не його половинка.
function makeAssignment(users) {
  const partnerOf = new Map(users.map((u) => [u.id, u.partner_id]));
  const ids = users.map((u) => u.id);
  for (let attempt = 0; attempt < 100000; attempt++) {
    const receivers = shuffle(ids);
    const ok = ids.every((g, i) => receivers[i] !== g && receivers[i] !== partnerOf.get(g));
    if (ok) return ids.map((g, i) => [g, receivers[i]]);
  }
  throw new HttpError(500, 'Не вдалося знайти розподіл');
}

async function adminDraw(req, env, url) {
  requireAdmin(req, env);
  const force = url.searchParams.get('force') === '1';
  if ((await isDrawn(env)) && !force) {
    throw new HttpError(409, 'Жеребкування вже відбулося. Для повтору використай redraw.');
  }
  const { users, problems } = await readiness(env);
  if (problems.length) return json({ error: 'Ще не всі готові', problems }, 409);

  const pairs = makeAssignment(users);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM assignments'),
    ...pairs.map(([g, r]) => env.DB.prepare('INSERT INTO assignments (giver_id, receiver_id) VALUES (?, ?)').bind(g, r)),
    env.DB.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('drawn_at', ?)").bind(String(Date.now())),
  ]);
  // Навмисно не повертаємо, хто кому дарує — таємниця!
  return json({ ok: true, participants: pairs.length });
}

async function adminReset(req, env) {
  requireAdmin(req, env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM assignments'),
    env.DB.prepare("DELETE FROM meta WHERE key = 'drawn_at'"),
  ]);
  return json({ ok: true });
}
