# Inquiry email setup

The site stays on GitHub Pages. A separate Cloudflare Worker handles email through Resend. Sending is intentionally disabled until configured; previewing and saving selections already work.

## Activate

1. In Cloudflare, create a Turnstile widget for `nioquant.com` and `www.nioquant.com`. Copy its **site key** into `turnstileSiteKey` in `assets/site-config.mjs`. This identifier is designed to be public.
2. Create a Resend account and verify a sending domain you control. Create a sending API key. See [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction).
3. Set `MAIL_FROM` in `backend/wrangler.toml` to an address on that verified domain. It need not be the visitor's email: their address is set as `reply_to`. The recipient is fixed to `info@nioquant.com` in the worker.
4. From `backend/`, authenticate the official Cloudflare Wrangler CLI and store both private values as Worker secrets:

   ```sh
   npx wrangler login
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put TURNSTILE_SECRET_KEY
   npx wrangler deploy
   ```

   Never add the key to the browser, repo, TOML file or chat. See [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
5. Set `inquiryEndpoint` in `assets/site-config.mjs` to the deployed HTTPS Worker URL. Keep the production origins in `ALLOWED_ORIGINS`. The default Worker subdomain is sufficient; a custom domain is optional.
6. Update the contact privacy notice from "currently inactive" to the actual processing setup, and agree retention practices before enabling production sending.
7. Deploy the static files through the existing GitHub Pages workflow. Send a deliberate test inquiry and verify its arrival, reply-to address, canonical selected-items suffix, Turnstile failure state and daily-limit message.

The Worker verifies every Turnstile response server-side, then permits at most **three verified sending attempts per IP per UTC day**. The counter is reserved before the mail provider is called, so a provider failure still consumes one attempt; this is intentional, so retries cannot be used to bypass the sending limit. A SQLite-backed Durable Object supplies the counter, giving atomic increments and deleting the counter after the day ends. It also has a honeypot, bounded request size, an origin allowlist, strict input validation and Resend idempotency for retries. Origin checks are not authentication; the public contact endpoint may need additional spam protection if abuse becomes significant. No message content, raw IP address or API key is logged by this code.

## Publishing catalog changes

The laboratory collection adds `custom-lab-stand`, `lab-flask-stand`, `lab-flask-tube-stand` and `lab-funnel-stand` to the shared catalog. Redeploy the Worker from `backend/` with `npx wrangler deploy` when publishing these frontend changes. The deployment bundles the server-owned catalog; an older deployment will reject these new IDs. Existing secrets and the endpoint do not need to change.

## What is locked

The browser sends name, email, message and selected IDs/licence preferences. It does **not** supply the recipient, product names, descriptions, prices or email suffix. The worker reconstructs that suffix using `assets/catalog.mjs`, which is also used for the read-only preview. Extra client fields such as `body` or edited product names are ignored, and unknown items/licences are rejected.

Visitors can change their chosen items, and local storage is always under their control. "Locked" means the selected-item descriptions cannot be edited through the message field; it does not mean a visitor cannot choose a different valid item. No prices, availability, rights or purchase commitments are inferred from the selection. Coming-soon concepts are explicitly marked as expressions of interest.

There is no `mailto:` checkout fallback: a visitor can edit a mail draft, so it would not satisfy the locked-suffix requirement. The direct email link is a separate contact option.

## Local verification

```sh
node --test tests/*.test.mjs
python3 -m http.server 8765 --bind 127.0.0.1
```

The tests mock the mail provider and do not send mail. To exercise a real deployment, use a staging Worker and explicitly allow only your development origin there. Keep development origins out of production.

## Editing the offer

Authoritative IDs, proposed package scopes and concept descriptions live in `assets/catalog.mjs`. Static cards live in the relevant HTML pages; keep their visible copy consistent with the catalog. Images under `assets/studio/` are AI-generated placeholders. Replace them and the concept disclaimers when real designs are ready. Final licensing terms and prices are deliberately not invented here.
