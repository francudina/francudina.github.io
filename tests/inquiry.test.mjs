import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { DailyIpLimiter, validateInquiry, buildEmail } from '../backend/inquiry-worker.mjs';
import { normalizeSelection, selectionLines } from '../assets/catalog.mjs';

const valid = () => ({ name: 'Test Visitor', email: 'visitor@example.com', message: 'Please help develop a small desk object.', selection: [{ id: 'prototype-loop' }, { id: 'form-vase', license: 'commercial' }], consent: true, website: '', turnstileToken: 'valid-turnstile-token', requestId: '12345678-1234-4123-8123-123456789abc' });
const env = () => ({
  RESEND_API_KEY: 'mock-key', MAIL_FROM: 'Studio <inquiries@nioquant.com>', TURNSTILE_SECRET_KEY: 'turnstile-secret',
  DAILY_IP_LIMITER: { idFromName: key => key, get: () => ({ fetch: async () => new Response(null, { status: 200 }) }) }
});
const request = (data = valid(), origin = 'https://nioquant.com', method = 'POST') => new Request('https://example.workers.dev/', { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(data) } : {}) });

test('untrusted local selections are filtered and duplicate IDs cannot persist', () => {
  assert.deepEqual(normalizeSelection([{ id: 'form-vase', license: 'commercial', name: 'Fake name' }, { id: 'form-vase', license: 'personal' }, { id: 'unknown' }, { id: 'arc-tray', license: '__proto__' }, null]), [{ id: 'form-vase', license: 'commercial' }]);
  assert.deepEqual(normalizeSelection({ bad: true }), []);
});

test('email ends with server-owned selected items, ignoring forged names/body/recipient', () => {
  const input = valid();
  input.body = 'FORGED BODY'; input.to = 'attacker@example.com';
  input.selection[0].name = 'FORGED ITEM';
  const email = buildEmail(validateInquiry(input), env().MAIL_FROM);
  assert.deepEqual(email.to, ['info@nioquant.com']);
  assert.equal(email.reply_to, input.email);
  assert.ok(email.text.indexOf(input.message) < email.text.indexOf('--- Selected items'));
  assert.match(email.text, /Prototype loop/);
  assert.match(email.text, /Commercial use/);
  assert.match(email.text, /not yet available/);
  assert.doesNotMatch(email.text, /FORGED/);
  assert.ok(email.text.endsWith('not a purchase.'));
});

test('unknown items, invalid licences, duplicate IDs, unsafe name and missing consent are rejected', () => {
  for (const change of [
    { selection: [{ id: 'unknown' }] }, { selection: [{ id: 'form-vase', license: 'anything' }] },
    { selection: [{ id: 'model-sprint' }, { id: 'model-sprint' }] }, { name: 'Test\nBcc: bad@example.com' },
    { email: 'bad\r\n@example.com' }, { consent: false }, { message: ' ' }, { requestId: 'fake' }
  ]) assert.throws(() => validateInquiry({ ...valid(), ...change }));
  assert.equal(selectionLines([]), '');
  assert.match(buildEmail(validateInquiry({ ...valid(), selection: [] }), env().MAIL_FROM).text, /General inquiry/);
});

test('laboratory inquiries reach the server-owned email summary without fictitious licence or product details', () => {
  const ids = ['custom-lab-stand', 'lab-flask-stand', 'lab-flask-tube-stand', 'lab-funnel-stand'];
  const input = { ...valid(), selection:ids.map(id => ({ id, name:'FORGED TITLE', scope:'FORGED SCOPE', license:'commercial' })) };
  const inquiry = validateInquiry(input);
  assert.deepEqual(inquiry.selection, ids.map(id => ({ id })));
  const email = buildEmail(inquiry, env().MAIL_FROM);
  assert.deepEqual(email.to, ['info@nioquant.com']);
  assert.match(email.text, /Custom laboratory stand/);
  assert.match(email.text, /Laboratory flask \+ test tube stand/);
  assert.match(email.text, /Laboratory funnel stand/);
  assert.match(email.text, /agreed in the quote/);
  assert.doesNotMatch(email.text, /FORGED|not yet available|Commercial use/);
});

test('daily IP limiter permits exactly three verified inquiries per UTC day', async () => {
  const values = new Map();
  const ctx = { storage: {
    get: async key => values.get(key), put: async (key, value) => values.set(key, value),
    setAlarm: async () => {}, deleteAll: async () => values.clear()
  } };
  const limiter = new DailyIpLimiter(ctx);
  assert.deepEqual(await (await limiter.fetch(new Request('https://limiter/consume', { method: 'POST' }))).json(), { allowed: true, remaining: 2 });
  assert.equal((await limiter.fetch(new Request('https://limiter/consume', { method: 'POST' }))).status, 200);
  assert.equal((await limiter.fetch(new Request('https://limiter/consume', { method: 'POST' }))).status, 200);
  assert.equal((await limiter.fetch(new Request('https://limiter/consume', { method: 'POST' }))).status, 429);
});

const successfulServices = async (url, options) => {
  if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return Response.json({ success: true, hostname: 'nioquant.com', action: 'contact' });
  if (url === 'https://api.resend.com/emails') return Response.json({ id: 'mock-email-id' });
  throw new Error(`Unexpected URL: ${url}`);
};

test('origin and method checks, missing setup, spam controls and malformed input never call mail provider', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return Response.json({ success: true, hostname: 'nioquant.com', action: 'contact' });
    throw new Error('Must not send');
  });
  assert.equal((await worker.fetch(request(valid(), 'https://evil.example'), env())).status, 403);
  assert.equal((await worker.fetch(request(valid(), 'https://nioquant.com', 'GET'), env())).status, 405);
  assert.equal((await worker.fetch(request(), {})).status, 503);
  assert.equal((await worker.fetch(request({ ...valid(), website: 'spam' }), env())).status, 400);
  assert.equal((await worker.fetch(request({ ...valid(), selection: [{ id: 'fake' }] }), env())).status, 400);
  assert.equal((await worker.fetch(request({ ...valid(), message: 'x'.repeat(25000) }), env())).status, 400);
  const limited = env(); limited.DAILY_IP_LIMITER.get = () => ({ fetch: async () => new Response(null, { status: 429 }) });
  assert.equal((await worker.fetch(request(), limited)).status, 429);
  assert.equal((await worker.fetch(request(valid(), 'https://nioquant.com', 'OPTIONS'), env())).status, 204);
});

test('accepted inquiry uses fixed recipient, safe reply-to and stable retry idempotency', async t => {
  const captured = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return Response.json({ success: true, hostname: 'nioquant.com', action: 'contact' });
    captured.push({ url, ...options }); return Response.json({ id: 'mock-email-id' });
  });
  for (let i = 0; i < 2; i++) {
    const response = await worker.fetch(request(), env());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://nioquant.com');
  }
  assert.equal(captured[0].url, 'https://api.resend.com/emails');
  assert.equal(captured[0].headers['Idempotency-Key'], captured[1].headers['Idempotency-Key']);
  assert.deepEqual(JSON.parse(captured[0].body).to, ['info@nioquant.com']);
  assert.equal(JSON.parse(captured[0].body).reply_to, 'visitor@example.com');
});

test('provider errors and unconfirmed responses cannot produce a success result', async t => {
  for (const provider of [async () => Response.json({ error: 'failure' }, { status: 500 }), async () => { throw new Error('network failure'); }, async () => Response.json({})]) {
    const mock = t.mock.method(globalThis, 'fetch', async (url, options) => url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify' ? Response.json({ success: true, hostname: 'nioquant.com', action: 'contact' }) : provider(url, options));
    const response = await worker.fetch(request(), env());
    assert.equal(response.status, 502); assert.equal((await response.json()).ok, false);
    mock.mock.restore();
  }
});

test('invalid Turnstile tokens never consume a daily limit or call the mail provider', async t => {
  let limiterCalled = false;
  const configured = env(); configured.DAILY_IP_LIMITER.get = () => { limiterCalled = true; throw new Error('must not limit'); };
  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: false }));
  assert.equal((await worker.fetch(request(), configured)).status, 400);
  assert.equal(limiterCalled, false);
});
