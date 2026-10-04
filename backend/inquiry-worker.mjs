import { catalog, normalizeSelection, selectionLines } from '../assets/catalog.mjs';

const MAX_BYTES = 24000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class DailyIpLimiter {
  constructor(ctx) { this.ctx = ctx; }

  async fetch(request) {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    // A Durable Object processes one object's requests serially, so this
    // read/increment/write cannot let concurrent requests exceed the limit.
    const count = (await this.ctx.storage.get('count')) || 0;
    if (count >= 3) return Response.json({ allowed: false, remaining: 0 }, { status: 429 });
    await this.ctx.storage.put('count', count + 1);
    // Every object represents one UTC day. Remove its small counter shortly
    // after that day ends instead of retaining IP-linked state.
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 5, 0, 0);
    await this.ctx.storage.setAlarm(tomorrow.getTime());
    return Response.json({ allowed: true, remaining: 2 - count });
  }

  async alarm() { await this.ctx.storage.deleteAll(); }
}

export function validateInquiry(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid inquiry.');
  const { name, email, message, requestId } = data;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || /[\r\n\u0000-\u001f]/.test(name)) throw new Error('Please provide a valid name.');
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error('Please provide a valid email.');
  if (typeof message !== 'string' || !message.trim() || message.length > 5000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(message)) throw new Error('Please provide a message of up to 5000 characters.');
  if (data.consent !== true) throw new Error('Please confirm the contact privacy notice.');
  if (typeof requestId !== 'string' || !UUID.test(requestId)) throw new Error('Invalid inquiry reference.');
  if (!Array.isArray(data.selection) || data.selection.length > catalog.length) throw new Error('Invalid inquiry list.');
  const selected = normalizeSelection(data.selection);
  // Reject unknown IDs, invalid licences and duplicates; never silently change a submitted list.
  if (selected.length !== data.selection.length) throw new Error('Please refresh your inquiry list.');
  return { name: name.trim(), email: email.trim(), message: message.trim(), selection: selected, requestId };
}

export function buildEmail(inquiry, sender) {
  // Only this server-side catalog supplies names, scopes and licence descriptions.
  const selected = selectionLines(inquiry.selection) || 'General inquiry: no items selected.';
  return {
    from: sender,
    to: ['info@nioquant.com'],
    reply_to: inquiry.email,
    subject: `nioquant inquiry: ${inquiry.name}`,
    text: `From: ${inquiry.name} <${inquiry.email}>\n\n${inquiry.message}\n\n--- Selected items · appended automatically ---\n${selected}\n\nThis is a request for information or a quote, not a purchase.`
  };
}

async function readBoundedJson(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) throw new Error('Inquiry too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Empty inquiry.');
  let total = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { await reader.cancel(); throw new Error('Inquiry too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function verifyTurnstile(token, secret, remoteip, expectedHostname) {
  if (typeof token !== 'string' || !token) return false;
  const body = new FormData();
  body.set('secret', secret);
  body.set('response', token);
  if (remoteip) body.set('remoteip', remoteip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body, signal: AbortSignal.timeout(10000)
  });
  const result = await response.json();
  return response.ok && result.success === true && result.hostname === expectedHostname && result.action === 'contact';
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || 'https://nioquant.com,https://www.nioquant.com').split(',').map(value => value.trim());
    const acceptedOrigin = allowed.includes(origin);
    const headers = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      ...(acceptedOrigin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } : {})
    };
    const respond = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (!acceptedOrigin) return respond(403, { ok: false, error: 'Origin not allowed.' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return respond(405, { ok: false, error: 'Use POST.' });
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return respond(415, { ok: false, error: 'Send a JSON inquiry.' });
    if (!env.RESEND_API_KEY || !env.MAIL_FROM || !env.TURNSTILE_SECRET_KEY || !env.DAILY_IP_LIMITER) return respond(503, { ok: false, error: 'Online sending is not configured yet.' });
    let data;
    try { data = await readBoundedJson(request); }
    catch { return respond(400, { ok: false, error: 'Invalid or oversized inquiry.' }); }
    if (typeof data?.website !== 'string' || data.website !== '') return respond(400, { ok: false, error: 'Invalid inquiry.' });
    let inquiry;
    try { inquiry = validateInquiry(data); }
    catch (error) { return respond(400, { ok: false, error: error.message }); }
    const remoteip = request.headers.get('CF-Connecting-IP') || '';
    try {
      const hostname = new URL(origin).hostname;
      if (!await verifyTurnstile(data.turnstileToken, env.TURNSTILE_SECRET_KEY, remoteip, hostname)) {
        return respond(400, { ok: false, error: 'Verification failed. Please try again.' });
      }
    } catch { return respond(503, { ok: false, error: 'Verification is temporarily unavailable. Please try again.' }); }
    try {
      const day = new Date().toISOString().slice(0, 10);
      const id = env.DAILY_IP_LIMITER.idFromName(`${day}:${remoteip || 'unknown'}`);
      const limit = await env.DAILY_IP_LIMITER.get(id).fetch('https://daily-ip-limiter/consume', { method: 'POST' });
      if (limit.status === 429) return respond(429, { ok: false, error: 'This address has reached the limit of 3 inquiries today. Please try again tomorrow.' });
      if (!limit.ok) throw new Error('Limiter failure');
    } catch { return respond(503, { ok: false, error: 'Online sending is temporarily unavailable. Please try again.' }); }
    const email = buildEmail(inquiry, env.MAIL_FROM);
    // Same UUID + canonical payload means retries cannot create duplicate emails within Resend's 24h window.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(email)));
    const fingerprint = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `nioquant-${inquiry.requestId}-${fingerprint}` },
        body: JSON.stringify(email), signal: AbortSignal.timeout(15000)
      });
      const result = await response.json();
      if (!response.ok || typeof result.id !== 'string') return respond(502, { ok: false, error: 'Sending could not be confirmed. Please retry.' });
      return respond(200, { ok: true });
    } catch { return respond(502, { ok: false, error: 'Sending could not be confirmed. Please retry.' }); }
  }
};
