import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { hashPassword, validPassword, verifyPassword } from '../passwords.mjs';
import { createMailer } from '../mail.mjs';
import { idOf } from './sync.mjs';

const hour = 3600000,
  day = 24 * hour;
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const tokenValid = (token) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 &&
    !email.startsWith('.') &&
    !email.includes('..') &&
    !email.includes('.@') &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      email,
    )
    ? email
    : null;
}
const publicUser = (user) => ({ id: user.id, email: user.email, verified: !!user.verified_at });

export function createAccountService({ storage, env = {}, mailer = createMailer(env) }) {
  const db = storage.accounts;
  let base;
  try {
    base = new URL(env.PUBLIC_URL || 'http://localhost:3000');
    if (
      base.protocol !== 'https:' &&
      !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
    )
      base = null;
    if (
      base &&
      (base.username || base.password || base.pathname !== '/' || base.search || base.hash)
    )
      base = null;
  } catch {
    base = null;
  }
  const secure = base?.protocol === 'https:';
  const cookieName = secure ? '__Host-deckhand_session' : 'deckhand_session';
  const ready = !!(mailer.ready && base);
  const pendingMail = new Set();
  const result = (status, json, headers) => ({ status, json, headers });
  const error = (status, code) => result(status, { ok: false, error: code });
  const cookie = (token, age = (30 * day) / 1000) =>
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const readCookie = (req) => {
    const matches = String(req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.startsWith(cookieName + '='));
    const value = matches.length === 1 ? matches[0].slice(cookieName.length + 1) : '';
    return tokenValid(value) ? value : null;
  };
  const session = (req) => {
    const raw = readCookie(req);
    return raw ? db.session(tokenHash(raw), Date.now()) : null;
  };
  const csrfValid = (req, user) => {
    const value = req.headers['x-csrf-token'];
    return (
      typeof value === 'string' &&
      Buffer.byteLength(value) === Buffer.byteLength(user.csrf) &&
      timingSafeEqual(Buffer.from(value), Buffer.from(user.csrf))
    );
  };
  const limited = (key, max, window) => !db.limit(key, max, window, Date.now());
  const clientIp = (req) => {
    const peer = req.socket.remoteAddress || '';
    // Trust the tunnel's visitor header only on the internal Docker network.
    const internal = /^(?:::ffff:)?172\.(1[6-9]|2\d|3[01])\./.test(peer);
    const cf = req.headers['cf-connecting-ip'];
    return env.TRUST_CLOUDFLARE_PROXY === '1' && internal && typeof cf === 'string' && isIP(cf)
      ? cf
      : peer;
  };
  function sendLink(user, kind) {
    const token = randomBytes(32).toString('hex'),
      hash = tokenHash(token);
    db.addToken(hash, user.id, kind, Date.now() + (kind === 'reset' ? 30 * 60000 : day));
    const url = base.origin + '/#account-' + kind + '=' + token;
    const job = Promise.resolve()
      .then(() => mailer.send({ to: user.email, kind, url }))
      .catch(() => {
        db.removeToken(hash);
        console.warn('Account email delivery failed. Check the server email configuration.');
      })
      .finally(() => pendingMail.delete(job));
    pendingMail.add(job);
  }
  return {
    session,
    authorize(req) {
      const user = session(req);
      if (!user) return { failure: error(401, 'signin_required') };
      if (!csrfValid(req, user)) return { failure: error(403, 'csrf') };
      if (!user.verified_at) return { failure: error(403, 'email_unverified') };
      return { user };
    },
    async flush() {
      await Promise.all([...pendingMail]);
    },
    async handle(req, body) {
      if (req.method === 'GET') {
        const user = session(req);
        return result(200, {
          ok: true,
          user: user ? publicUser(user) : null,
          csrf: user?.csrf || null,
          emailReady: ready,
          minPassword: 15,
        });
      }
      const op = body?.op,
        ip = tokenHash(clientIp(req));
      if (limited('request:' + ip, 100, 15 * 60000)) return error(429, 'rate_limited');
      if (op === 'logout' || op === 'migrate') {
        const auth = this.authorize(req);
        if (auth.failure) return auth.failure;
        if (op === 'logout') {
          const raw = readCookie(req);
          if (raw) db.removeSession(tokenHash(raw));
          return result(200, { ok: true }, { 'set-cookie': cookie('', 0) });
        }
        const hash = idOf(body.code);
        if (!hash) return error(400, 'code');
        if (storage.sync.probe(hash) === null) {
          const legacy = await storage.store('deckhand-sync').get(hash);
          if (legacy?.keys) storage.sync.migrate(hash, legacy);
        }
        return db.claimLegacy(hash, auth.user.id)
          ? result(200, { ok: true })
          : error(400, 'legacy_unavailable');
      }
      if (op === 'verify' || op === 'reset') {
        if (!tokenValid(body.token)) return error(400, 'invalid_link');
        if (op === 'reset' && !validPassword(body.password)) return error(400, 'password');
        if (!db.token(tokenHash(body.token), op, Date.now())) return error(400, 'invalid_link');
        const password = op === 'reset' ? await hashPassword(body.password) : null;
        const ok = db.consumeToken(tokenHash(body.token), op, Date.now(), password);
        return ok
          ? result(200, { ok: true }, op === 'reset' ? { 'set-cookie': cookie('', 0) } : undefined)
          : error(400, 'invalid_link');
      }
      if (!['register', 'login', 'forgot', 'resend'].includes(op)) return error(400, 'op');
      const email = normalizeEmail(body.email);
      if (!email) return error(400, 'email');
      if (
        limited(
          'email:' + op + ':' + tokenHash(email),
          op === 'login' ? 10 : 3,
          op === 'login' ? 15 * 60000 : hour,
        )
      )
        return error(429, 'rate_limited');
      if (op === 'login') {
        if (limited('login:' + ip, 30, 15 * 60000) || limited('login:global', 300, hour))
          return error(429, 'rate_limited');
        if (typeof body.password !== 'string' || Buffer.byteLength(body.password) > 512)
          return error(400, 'password');
        const user = db.byEmail(email);
        if (!(await verifyPassword(body.password, user?.password_hash)) || !user)
          return error(401, 'credentials');
        if (!user.verified_at) return error(403, 'email_unverified');
        const raw = readCookie(req);
        if (raw) db.removeSession(tokenHash(raw));
        const token = randomBytes(32).toString('hex'),
          csrf = randomBytes(16).toString('hex');
        db.addSession(tokenHash(token), user.id, csrf, Date.now() + 30 * day);
        return result(
          200,
          { ok: true, user: publicUser(user), csrf },
          { 'set-cookie': cookie(token) },
        );
      }
      if (!ready) return error(503, 'email_not_configured');
      if (limited('mail:' + ip, 12, hour) || limited('mail:global', 80, day))
        return error(429, 'rate_limited');
      let user = db.byEmail(email);
      if (op === 'register') {
        if (!validPassword(body.password)) return error(400, 'password');
        if (limited('register:global', 40, day)) return error(429, 'rate_limited');
        const hash = await hashPassword(body.password);
        if (!user) user = db.create(email, hash, Date.now()) || db.byEmail(email);
      }
      if (user && (op === 'forgot' || !user.verified_at))
        sendLink(user, op === 'forgot' ? 'reset' : 'verify');
      // Email is delivered asynchronously so SMTP/provider timing never reveals
      // whether an address is registered. Both cases return the same response.
      return result(202, {
        ok: true,
        message: 'If this email can receive a link, check your inbox and spam folder.',
      });
    },
  };
}
