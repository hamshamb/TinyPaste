# Deployment

Target: **Vercel** for the app, **Supabase** for the database. Nothing in the codebase is
Vercel-specific — any Node host that can run `next start` works, and the notes at the end cover that.

## 1. Push the repository to GitHub

```bash
git init
```

```bash
git add -A && git commit -m "Initial commit"
```

```bash
git remote add origin git@github.com:YOUR_NAME/tinypaste.git && git push -u origin main
```

Before pushing, confirm no secrets are staged:

```bash
git ls-files | grep -E "^\.env" && echo "STOP: env file staged" || echo "clean"
```

Only `.env.example` should ever be tracked.

## 2. Create the Supabase project

Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) steps 1–4 and note the project URL, anon key and
service-role key. Use a **separate project** for production if you already have one for development
— pastes are user data, and a shared database blurs that line.

## 3. Apply the migration

SQL editor or CLI, as in [SUPABASE_SETUP.md](SUPABASE_SETUP.md) step 6. Then verify Row Level
Security with step 8 **before** the app goes live. The anon `curl` check matters most:

```bash
curl -s "https://YOUR_REF.supabase.co/rest/v1/pastes?select=*" -H "apikey: YOUR_ANON_KEY"
```

An empty array or a permission error is correct. Rows means anyone with the anon key can read every
paste — fix it before deploying.

## 4. Import the repository into Vercel

1. <https://vercel.com/new> → import the GitHub repository.
2. Framework preset: **Next.js** (auto-detected).
3. Build command, output directory and install command: leave as detected.
4. Do **not** deploy yet — add the environment variables first.

## 5. Configure environment variables

**Project Settings → Environment Variables.** Add these to Production (and Preview, if you want
previews to work):

| Name | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR_REF.supabase.co` | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key | |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key | **Secret.** Never `NEXT_PUBLIC_` |
| `APP_URL` | `https://your-domain.com` | No trailing slash |
| `RATE_LIMIT_REDIS_URL` | Upstash REST URL | Recommended — see step 6 |
| `RATE_LIMIT_REDIS_TOKEN` | Upstash REST token | Recommended |
| `ABUSE_CONTACT_EMAIL` | your contact address | Turns the footer link into a `mailto:` |
| `CLEANUP_SECRET` | a long random string | Enables the cleanup route |

Generate the cleanup secret locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Do **not** set `TINYPASTE_ALLOW_MEMORY_DB` in production. Leaving it unset is what makes the app
refuse to start with volatile storage if the database configuration is ever wrong — that failure is
deliberate and much better than silently losing every paste.

## 6. Configure rate limiting (recommended)

The default limiter counts per serverless instance, so on Vercel the effective limit is multiplied
by however many instances are warm. For a public deployment, use Upstash so the window is shared:

1. Create a Redis database at <https://console.upstash.com>.
2. Copy the **REST URL** and **REST token** (not the Redis protocol URL).
3. Set `RATE_LIMIT_REDIS_URL` and `RATE_LIMIT_REDIS_TOKEN`.

No code change is needed — `getRateLimiter()` picks the Upstash adapter as soon as both are present,
and falls back to the local counter if Upstash is ever unreachable, so an outage cannot take the
site down.

## 7. Deploy

**Deploy.** The build runs `next build`, which also type-checks. Watch for:

- A TypeScript error — fix locally, push again.
- `STORAGE_UNAVAILABLE` at runtime — the Supabase variables did not reach the build.

## 8. Set `APP_URL` to the real domain

`APP_URL` is used to build the share link returned by the create API. If you added a custom domain
after the first deploy, update `APP_URL` to match and **redeploy** — environment variables are read
at build and boot time.

```
APP_URL=https://paste.example.com
```

Getting this wrong produces links pointing at `vercel.app` (or `localhost`) instead of your domain.

## 9. Schedule cleanup

Add `vercel.json` at the repository root:

```json
{
  "crons": [
    { "path": "/api/cleanup", "schedule": "0 * * * *" }
  ]
}
```

Vercel Cron sends a GET, but the route is a POST guarded by `CLEANUP_SECRET`, so the simplest robust
option is the Supabase `pg_cron` job in [SUPABASE_SETUP.md](SUPABASE_SETUP.md) instead, or any
external scheduler that can send:

```bash
curl -X POST https://your-domain.com/api/cleanup -H "Authorization: Bearer $CLEANUP_SECRET"
```

Either way, this is housekeeping. Expiry is enforced on every read, so a missed run never exposes an
expired paste.

## 10. Verify production

Work through this against the live site.

**Plain paste**

- [ ] Create a paste; the link opens and survives a reload.
- [ ] `Copy`, `Raw` and `Download` work. Raw returns `text/plain`; download is an attachment.
- [ ] A JavaScript paste is highlighted, and the raw output matches the original exactly.

**Expiry**

- [ ] Create a 10-minute paste; the header reads "Expires in 10 minutes".
- [ ] Check the row in Supabase: `expires_at` is ten minutes after `created_at`, in UTC.

**Password**

- [ ] A protected paste shows the gate, and **View Source** contains no paste content.
- [ ] A wrong password is rejected; the right one reveals the content.
- [ ] `/p/<slug>/raw` returns 401.

**Burn after reading**

- [ ] After creating, the creator sees the warning, not the content.
- [ ] Open the link in a private window and reveal it — the content appears.
- [ ] Reload: "This paste is no longer available."
- [ ] In Supabase, the row's `content` is `NULL` and `burned_at` is set.

**Encryption — the important one**

- [ ] Create an encrypted paste. In DevTools → Network, open the `POST /api/pastes` payload and
      confirm it contains `encryptedContent` and **no plaintext**.
- [ ] Confirm the key (everything after `#k:`) appears in no request URL, body or header.
- [ ] In Supabase, `content` is `NULL` and `encrypted_content` is base64 you cannot read.
- [ ] Opening the full URL decrypts in the browser.
- [ ] Removing the fragment gives "Encryption key missing from this URL."
- [ ] A different paste's key gives "Unable to decrypt this paste."

**Ownership**

- [ ] Edit and delete work in the creating browser.
- [ ] A private window shows neither button, and a forged token is rejected by the API.

**Security**

- [ ] Paste `<script>alert('xss')</script>` — it renders as text and no dialog appears.
- [ ] `curl -sI https://your-domain.com | grep -i content-security-policy` shows the policy.
- [ ] `curl -s "https://YOUR_REF.supabase.co/rest/v1/pastes?select=*" -H "apikey: ANON"` returns no rows.
- [ ] Paste pages carry `<meta name="robots" content="noindex">`.

**Privacy**

- [ ] `/privacy` and `/about` load and read correctly.
- [ ] The footer "Report abuse" link opens your configured address.

## Deploying elsewhere

TinyPaste needs the **Node.js runtime** (bcryptjs and `node:crypto`), not an edge-only runtime.

```bash
npm ci && npm run build && npm run start
```

Set the same environment variables in the host's configuration. Behind a reverse proxy, make sure it
forwards `X-Forwarded-For` (so rate limiting sees real clients) and `X-Forwarded-Host` (so the
same-origin check works). Terminate TLS at the proxy; the CSP sets `upgrade-insecure-requests`, and
the clipboard API requires a secure context.

Docker is deliberately not provided: for a single Next.js app with a hosted database it adds a
build surface without solving a problem the platform does not already handle.

## Rolling back

Vercel keeps previous deployments — promote an earlier one from the dashboard. Note that a rollback
does **not** revert database migrations. This release has a single additive migration, so a rollback
is safe; keep that property in mind for future ones.
