import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.mjs';
import { idOf } from '../server/services/sync.mjs';
import { normalizeEmail } from '../server/services/accounts.mjs';
import { createMailer } from '../server/mail.mjs';
import syncRecords from '../shared/sync-records.cjs';

const password = 'My very long testing password!';
const digest = (value) => createHash('sha256').update(value).digest('hex');

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'deckhand-accounts-'));
  const messages = [];
  const app = createApp({
    databasePath: join(directory, 'app.sqlite'),
    dataDirectory: directory,
    env: { PUBLIC_URL: 'https://mtgdeckhand.com' },
    mailer: {
      ready: true,
      async send(message) {
        messages.push(message);
      },
    },
    ...options,
  });
  const close = app.close.bind(app);
  let closed = false;
  app.close = async () => {
    if (!closed) {
      closed = true;
      await close();
    }
  };
  await new Promise((done) => app.server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const call = async (body, session, path = '/api/account', headers = {}) => {
    const response = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(body ? { 'content-type': 'application/json', origin: base } : {}),
        ...(session ? { cookie: session.cookie, 'x-csrf-token': session.csrf } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  const token = (kind, email) =>
    new URL(messages.findLast((message) => message.kind === kind && message.to === email).url).hash
      .split('=')
      .at(-1);
  const register = async (email) => {
    assert.equal((await call({ op: 'register', email, password })).status, 202);
    await app.storage.accounts.byEmail(email);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await call({ op: 'verify', token: token('verify', email) })).status, 200);
    return login(email);
  };
  const login = async (email, value = password) => {
    const result = await call({ op: 'login', email, password: value });
    assert.equal(result.status, 200);
    return {
      cookie: result.headers.get('set-cookie').split(';')[0],
      csrf: result.body.csrf,
      user: result.body.user,
    };
  };
  return { app, directory, base, messages, call, token, register, login };
}

test('authenticated sync accepts both values of the collection-price preference without blocking decks or collection', async (t) => {
  const f = await fixture(t);
  const session = await f.register('boolean-settings@example.test');
  const deck = { id: 'boolean-settings-deck', name: 'Pending deck', cards: [], maybeboard: [] };
  const item = { name: 'Pending collection card', qty: 3, set: 'tst', cn: '1', cond: 'NM' };
  const itemKey = syncRecords.syncItemKey(item);
  const changes = {
    ['deck:' + deck.id]: { t: 1, v: JSON.stringify(deck) },
    [itemKey]: { t: 1, v: JSON.stringify(item) },
    'setting:hideCollectionFolderPrices': { t: 1, v: 'false' },
    'setting:startupPage': { t: 1, v: '"scan-collection"' },
  };
  const first = await f.call({ op: 'sync', since: 0, changes }, session, '/api/sync');
  assert.equal(first.status, 200);
  assert.equal(first.body.changes['setting:hideCollectionFolderPrices'].v, 'false');
  assert.equal(JSON.parse(first.body.changes['deck:' + deck.id].v).name, 'Pending deck');
  assert.equal(JSON.parse(first.body.changes[itemKey].v).qty, 3);
  const second = await f.call(
    {
      op: 'sync',
      since: first.body.rev,
      changes: { 'setting:hideCollectionFolderPrices': { t: 2, v: 'true' } },
    },
    session,
    '/api/sync',
  );
  assert.equal(second.status, 200);
  const anotherDevice = await f.login('boolean-settings@example.test');
  const saved = await f.call({ op: 'sync', since: 0 }, anotherDevice, '/api/sync');
  assert.equal(saved.body.changes['setting:hideCollectionFolderPrices'].v, 'true');
  assert.equal(JSON.parse(saved.body.changes['deck:' + deck.id].v).name, 'Pending deck');
  assert.equal(JSON.parse(saved.body.changes[itemKey].v).qty, 3);
  assert.equal(
    (
      await f.call(
        { op: 'sync', changes: { 'setting:hideCollectionFolderPrices': { t: 3, v: '"false"' } } },
        session,
        '/api/sync',
      )
    ).status,
    400,
  );
});

test('accounts store salted password hashes, verify email and use protected sessions', async (t) => {
  const f = await fixture(t);
  const result = await f.call({ op: 'register', email: 'First@example.com', password });
  assert.equal(result.status, 202);
  assert.equal(
    (await f.call({ op: 'login', email: 'first@example.com', password })).body.error,
    'email_unverified',
  );
  await new Promise((resolve) => setImmediate(resolve));
  const token = f.token('verify', 'first@example.com');
  assert.equal(f.app.storage.accounts.token(token, 'verify', Date.now()), null);
  assert.ok(f.app.storage.accounts.token(digest(token), 'verify', Date.now()));
  assert.equal((await f.call({ op: 'verify', token })).status, 200);
  assert.equal((await f.call({ op: 'verify', token })).body.error, 'invalid_link');
  const login = await f.call({ op: 'login', email: ' FIRST@EXAMPLE.COM ', password });
  assert.equal(login.status, 200);
  assert.match(
    login.headers.get('set-cookie'),
    /^__Host-deckhand_session=.*HttpOnly; SameSite=Lax; Max-Age=2592000; Secure$/,
  );
  const first = f.app.storage.accounts.byEmail('first@example.com');
  assert.match(first.password_hash, /^scrypt\$131072\$8\$1\$/);
  assert.ok(!first.password_hash.includes(password));
  await f.register('second@example.com');
  assert.notEqual(
    first.password_hash,
    f.app.storage.accounts.byEmail('second@example.com').password_hash,
  );
  const session = await f.login('first@example.com');
  assert.equal((await f.call(null, session)).body.user.email, 'first@example.com');
  assert.equal(
    (await f.call({ op: 'logout' }, session, '/api/account', { 'x-csrf-token': '' })).body.error,
    'csrf',
  );
  assert.equal(
    (await f.call({ op: 'logout' }, session, '/api/account', { 'x-csrf-token': 'é'.repeat(32) }))
      .body.error,
    'csrf',
  );
  assert.equal(
    (await f.call({ op: 'logout' }, session, '/api/account', { origin: 'https://hostile.example' }))
      .status,
    403,
  );
  assert.equal((await f.call({ op: 'logout' }, session)).status, 200);
  assert.equal((await f.call(null, session)).body.user, null);
});

test('sync requires an account and never accepts another account scope or a legacy code as authority', async (t) => {
  const f = await fixture(t);
  const a = await f.register('a@example.com'),
    b = await f.register('b@example.com');
  const changes = {
    'deck:private': { t: 10, v: JSON.stringify({ id: 'private', name: 'Private', cards: [] }) },
  };
  assert.equal((await f.call({ op: 'sync', changes }, a, '/api/sync')).status, 200);
  const otherScope = f.app.storage.accounts.byEmail('a@example.com').sync_space;
  const other = await f.call(
    { op: 'sync', code: otherScope, accountId: a.user.id, since: 0 },
    b,
    '/api/sync',
  );
  assert.deepEqual(other.body.changes, {});
  assert.equal((await f.call({ op: 'probe', code: otherScope }, null, '/api/sync')).status, 401);
  assert.equal((await f.call({ op: 'create' }, null, '/api/sync')).status, 401);
  assert.equal((await f.call({ op: 'probe' }, a, '/api/sync', { 'x-csrf-token': '' })).status, 403);
  assert.equal(
    (await f.call({ op: 'sync', since: 0 }, a, '/api/sync')).body.changes['deck:private'].v,
    changes['deck:private'].v,
  );
});

test('password recovery is generic, expiring, single-use and revokes every existing session', async (t) => {
  const f = await fixture(t);
  const a = await f.register('recover@example.com'),
    b = await f.login('recover@example.com');
  const known = await f.call({ op: 'forgot', email: 'recover@example.com' });
  const unknown = await f.call({ op: 'forgot', email: 'unknown@example.com' });
  assert.deepEqual(known.body, unknown.body);
  await new Promise((resolve) => setImmediate(resolve));
  const token = f.token('reset', 'recover@example.com');
  assert.equal((await f.call({ op: 'reset', token, password: 'short' })).body.error, 'password');
  assert.equal((await f.call(null, a)).body.user.email, 'recover@example.com');
  const newPassword = 'My new long password is different!';
  assert.equal((await f.call({ op: 'reset', token, password: newPassword })).status, 200);
  assert.equal(
    (await f.call({ op: 'reset', token, password: newPassword })).body.error,
    'invalid_link',
  );
  assert.equal((await f.call(null, a)).body.user, null);
  assert.equal((await f.call(null, b)).body.user, null);
  assert.equal(
    (await f.call({ op: 'login', email: 'recover@example.com', password })).body.error,
    'credentials',
  );
  await f.login('recover@example.com', newPassword);
  const expired = randomBytes(32).toString('hex');
  f.app.storage.accounts.addToken(digest(expired), a.user.id, 'reset', Date.now() - 1);
  assert.equal(
    (await f.call({ op: 'reset', token: expired, password: newPassword })).body.error,
    'invalid_link',
  );
});

test('a legacy space is claimed once into an account while its data remains intact', async (t) => {
  const f = await fixture(t);
  const a = await f.register('migrate@example.com'),
    b = await f.register('different@example.com');
  const code = 'ABCD-EFGH-JKLM-NPQR-STUV-WXYZ',
    hash = idOf(code);
  f.app.storage.sync.create(hash);
  const old = {
    'deck:old': { t: 40, v: JSON.stringify({ id: 'old', name: 'Old saved deck', cards: [] }) },
  };
  f.app.storage.sync.exchange(hash, { since: 0, changes: old });
  assert.equal((await f.call({ op: 'migrate', code }, a)).status, 200);
  assert.equal((await f.call({ op: 'migrate', code }, a)).status, 200);
  assert.equal((await f.call({ op: 'migrate', code }, b)).body.error, 'legacy_unavailable');
  assert.equal(
    (await f.call({ op: 'sync', since: 0 }, a, '/api/sync')).body.changes['deck:old'].v,
    old['deck:old'].v,
  );
  assert.equal((await f.call({ op: 'sync', code, since: 0 }, null, '/api/sync')).status, 401);
  assert.equal(
    f.app.storage.sync.exchange(hash, { since: 0, changes: {} }).changes['deck:old'].v,
    old['deck:old'].v,
  );
});

test('passwords, session secrets and reset tokens never appear in stored plaintext', async (t) => {
  const f = await fixture(t);
  const session = await f.register('stored@example.com');
  await f.call({ op: 'forgot', email: 'stored@example.com' });
  await new Promise((resolve) => setImmediate(resolve));
  const reset = f.token('reset', 'stored@example.com');
  const db = new DatabaseSync(join(f.directory, 'app.sqlite'), { readOnly: true });
  try {
    const data = JSON.stringify({
      accounts: db.prepare('SELECT * FROM accounts').all(),
      sessions: db.prepare('SELECT * FROM account_sessions').all(),
      tokens: db.prepare('SELECT * FROM account_tokens').all(),
    });
    assert.ok(data.includes('stored@example.com'));
    assert.ok(!data.includes(password));
    assert.ok(!data.includes(session.cookie.split('=')[1]));
    assert.ok(!data.includes(reset));
  } finally {
    db.close();
  }
});

test('rate limits and account sessions survive a server restart', async (t) => {
  const f = await fixture(t);
  const session = await f.register('restart@example.com');
  for (let i = 0; i < 3; i++)
    assert.equal((await f.call({ op: 'forgot', email: 'restart@example.com' })).status, 202);
  await f.app.close();
  const reopened = createApp({
    databasePath: join(f.directory, 'app.sqlite'),
    dataDirectory: f.directory,
    env: { PUBLIC_URL: 'https://mtgdeckhand.com' },
  });
  await new Promise((done) => reopened.server.listen(0, '127.0.0.1', done));
  t.after(() => reopened.close());
  const origin = `http://127.0.0.1:${reopened.server.address().port}`;
  const status = await (
    await fetch(origin + '/api/account', { headers: { cookie: session.cookie } })
  ).json();
  assert.equal(status.user.email, 'restart@example.com');
  const blocked = await fetch(origin + '/api/account', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'forgot', email: 'restart@example.com' }),
  });
  assert.equal(blocked.status, 429);
});

test('without configured email local use works and signup does not create an unrecoverable account', async (t) => {
  const f = await fixture(t, { mailer: { ready: false } });
  assert.equal((await f.call(null)).body.emailReady, false);
  assert.equal(
    (await f.call({ op: 'register', email: 'offline@example.com', password })).body.error,
    'email_not_configured',
  );
  assert.equal(f.app.storage.accounts.byEmail('offline@example.com'), null);
  assert.equal((await fetch(f.base)).status, 200);
});

test('email normalization rejects invalid input and does not alter plus addresses', () => {
  assert.equal(normalizeEmail(' Person+cards@Example.COM '), 'person+cards@example.com');
  for (const invalid of ['', 'not-an-email', 'bad\r\n@example.com', 'a@localhost', null, 42])
    assert.equal(normalizeEmail(invalid), null);
});

test('mail delivery uses the configured sender and never exposes provider responses', async () => {
  const requests = [];
  const env = { EMAIL_FROM: 'Deckhand <accounts@example.test>', RESEND_API_KEY: 'test-only-key' };
  const mailer = createMailer(env, async (url, options) => {
    requests.push({ url, options });
    return Response.json({ id: 'test-message' });
  });
  await mailer.send({
    to: 'person@example.test',
    kind: 'reset',
    url: 'https://mtgdeckhand.com/#account-reset=test-token',
  });
  assert.equal(requests[0].url, 'https://api.resend.com/emails');
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.from, env.EMAIL_FROM);
  assert.deepEqual(body.to, ['person@example.test']);
  assert.match(body.text, /30 minutes/);
  assert.match(body.html, /#account-reset=test-token/);
  const failed = createMailer(env, async () =>
    Response.json({ message: 'Private provider error' }, { status: 403 }),
  );
  await assert.rejects(
    () =>
      failed.send({ to: 'person@example.test', kind: 'verify', url: 'https://mtgdeckhand.com/' }),
    { message: 'email_delivery' },
  );
});
