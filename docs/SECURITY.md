# Security

## Threat model

### What TinyPaste defends against

| Adversary | Capability | Defence |
| --- | --- | --- |
| A visitor viewing a paste | Puts arbitrary bytes in front of other readers | Content is rendered as React text nodes, never markup; export routes are inert |
| Someone guessing links | Enumerates slugs | 8 characters over a 57-symbol alphabet from CSPRNG rejection sampling; no listing API; rate limits |
| Someone without the edit token | Tries to change or delete a paste | 256-bit token, SHA-256 at rest, constant-time comparison, verified server-side on every mutation |
| Someone without the password | Tries to read a protected paste | Body never sent before bcrypt verification; tight rate limit on attempts |
| A curious operator or a database leak | Reads rows at rest | Browser-encrypted pastes are ciphertext the server cannot decrypt |
| A leaked anon key | Queries Supabase directly | RLS enabled with zero policies; `REVOKE ALL` from `anon` and `authenticated` |
| A hostile site | Drives a logged-in user's browser (CSRF) | No ambient credential authorises any mutation; same-origin check; `form-action 'self'` |
| A crawler or link preview bot | Indexes or consumes pastes | `noindex` on paste pages, generic metadata, burn requires an explicit POST |

### What it does not defend against

- **Anyone holding the link.** A slug is a bearer capability, not an identity check.
- **A malicious operator, for non-encrypted pastes.** The server necessarily holds the plaintext.
- **A reader who copies the content** before expiry or burn.
- **Traffic analysis or infrastructure logs.** A host, CDN or proxy may log IPs and paths.
- **A compromised client.** If the browser is compromised, fragment-held keys are compromised.
- **Targeted brute force on a weak paste password**, if an attacker can spread attempts across many
  source addresses. bcrypt cost 12 and rate limiting raise the cost; they do not eliminate it.

## Cross-site scripting

This is the central risk for a pastebin, and it is handled structurally rather than by filtering.

- **Highlighting uses `codeToTokens`, not `codeToHtml`.** Each token becomes a React element with a
  text child, so React escapes it. There is no string of HTML anywhere in the render path, and
  therefore no injection point. Pasting `<script>alert(1)</script>` displays those characters.
- **`dangerouslySetInnerHTML` appears once in the codebase**, in `app/layout.tsx`, for the theme
  bootstrap script. Its content is a compile-time constant with no user data.
- **The raw route** serves `text/plain; charset=utf-8` with `X-Content-Type-Options: nosniff` and
  its own `Content-Security-Policy: default-src 'none'; sandbox`. Even if a browser were persuaded
  to treat the response as a document, it would have a null origin and no script execution.
- **The download route** serves `application/octet-stream` as an attachment, so an HTML paste cannot
  be opened as a live document in this origin.
- **Filenames are sanitised** before they reach `Content-Disposition` (see below).

Covered by `tests/e2e/paste.spec.ts` (XSS payload rendered as text, no dialog fires, no `script` or
`img` element is created) and `tests/unit/validation.test.ts`.

## SQL injection

All database access goes through the Supabase PostgREST client's parameterised builder, or through
SQL functions taking typed parameters. No query is assembled by string concatenation anywhere in the
codebase.

## CSRF

Mutations carry no ambient credential — there is no session cookie, and an edit token is only ever
sent explicitly in a header. A cross-site form post therefore cannot authorise anything. On top of
that, `guardMutation` rejects requests whose `Origin` is a different host (honouring
`x-forwarded-host` behind a proxy), and the CSP sets `form-action 'self'`.

A request with **no** `Origin` header is allowed, because that is a non-browser client such as
`curl`, which carries no ambient credentials and so is not a CSRF vector.

## Passwords

- **bcrypt, cost 12.** Argon2id would be preferable on a long-running server, but it needs a native
  module; bcryptjs is pure JavaScript and runs unchanged on Vercel's serverless runtime with no
  build step. Cost 12 is a deliberate trade-off against serverless cold starts.
- The plaintext exists only for the duration of one request and is never written to storage or a log.
- It arrives in a **request body**, never a query string, so it cannot appear in an access log.
- A wrong password, an expired paste and a non-existent paste each produce their own message, and
  none of them reveals anything about the password itself. There is no partial-match feedback.
- `verifyPassword` returns `false` rather than throwing on a malformed hash, so callers cannot
  distinguish "bad stored hash" from "wrong password".

## Edit tokens

- 32 bytes (256 bits) from the Web Crypto CSPRNG, encoded base64url.
- Stored as a **SHA-256 digest**. A plain hash is the right primitive here: unlike a user-chosen
  password, a 256-bit random token is not guessable or dictionary-attackable, so the per-request
  cost of a KDF would buy nothing.
- Compared with `timingSafeEqual`, so response timing cannot be used to recover a token byte by byte.
- Sent in the `x-tinypaste-edit-token` header, never in a URL.
- Held in `localStorage`. Clearing site data loses it permanently — stated in the UI at creation
  time and on `/privacy`.
- The server re-verifies on every mutation. The client-side ownership check only decides which
  buttons to draw.

## Encryption design

| Property | Value |
| --- | --- |
| Algorithm | AES-GCM |
| Key length | 256 bits |
| IV | 96 bits, fresh per encryption |
| Tag | 128 bits |
| Key derivation | none — the random key *is* the secret |
| Key transport | URL fragment, `#k:<base64url>` |
| Version field | `encryption_version`, currently `1` |

The key is generated with `crypto.subtle.generateKey`, exported once for the fragment, and never
transmitted. `CURRENT_ENCRYPTION_VERSION` is stored with every ciphertext so the format can change
later while old pastes stay readable; an unsupported version produces an explicit error rather than
a decryption failure.

Failure modes are deliberately indistinguishable: AES-GCM authenticates, so a wrong key and a
tampered ciphertext both fail the tag check and both surface as *"Unable to decrypt this paste."*
A missing fragment is a different, actionable message. There is **no** fallback to server-side
plaintext, because for an encrypted paste none exists.

### Key handling rules, and how they are verified

The key must never appear in a request body, a query string, a cookie, a header, or a log. This is
verified rather than asserted — `tests/e2e/encryption.spec.ts` records every network request the
browser makes during creation and decryption, then asserts the key appears in none of their URLs,
bodies or headers, and that the plaintext appears in no request body. A second test fetches the
paste through the API and asserts the response contains ciphertext and no plaintext.

Manual verification, as of the last review:

1. Created an encrypted paste with a recognisable marker string in the content.
2. Inspected the `POST /api/pastes` payload: it contained `encryptedContent`, `encryptionIv`,
   `encryptionVersion`, title, language and expiry — no plaintext, no key.
3. Read the row back through `GET /api/pastes/<slug>`: ciphertext only.
4. Opened the full URL: decrypted in the browser.
5. Removed the fragment: *"Encryption key missing from this URL."*
6. Substituted another paste's key: *"Unable to decrypt this paste."*

`Referrer-Policy: no-referrer` is set site-wide as a second line of defence — even though browsers
already strip fragments from `Referer`, no referrer is sent at all, so slugs do not leak either.

### Why encryption and passwords are mutually exclusive

Version 1 forbids combining them. A server-side password protects against someone who has the link;
the fragment key protects against the server itself. Stacking them would create two independent
secrets guarding one payload, each with different loss and recovery semantics, for no additional
protection against either adversary. Security correctness beat feature-count. The rule is enforced
in three places: the UI disables one checkbox when the other is checked, the Zod schema refuses the
combination, and a `CHECK` constraint enforces it in the database.

## Expiration

`isExpired()` in `lib/paste/expiration.ts` is the single predicate, and `loadPasteRecord()` in the
service is the single gate every read path passes through — the paste page, the raw route, the
download route and every API route. A route physically cannot skip it, because none of them touch
the repository directly.

Boundary behaviour is explicit and tested: a paste is expired *at* its expiry instant, not after it.
An unparseable timestamp is treated as not expired, which fails in the safe direction (it does not
silently destroy access) while the row is still removed by cleanup.

Expiry is enforced in application code, so correctness never depends on the cleanup job running.
`POST /api/cleanup` only stops expired rows lingering at rest, and is disabled unless
`CLEANUP_SECRET` is set.

## Burn after reading

See the README for the full behavioural specification. The security-relevant points:

- **Consumption requires an explicit `POST`.** A GET-triggered burn would let a prefetch, a
  link-preview bot or a crawler destroy a paste before its recipient ever saw it.
- **The claim is atomic.** Postgres: `SELECT … FOR UPDATE` with `burned_at IS NULL`, then wipe in
  the same transaction. Exactly one of N concurrent readers wins. Tested with 20 simultaneous
  service-level claims and with two simultaneous HTTP reveals.
- **The password check precedes the burn**, so a wrong guess cannot destroy someone's paste.
- **Raw and download refuse burn pastes** instead of consuming them, and the refusal itself does not
  consume.
- **The payload is nulled**, not just flagged, so a later database leak does not expose a burned
  paste's content.

## Rate limiting

| Action | Default | Window |
| --- | --- | --- |
| Create | 20 | 60 s |
| Unlock (password attempts) | 10 | 300 s |
| Edit / delete | 30 | 60 s |

Unlock is tightest because it is the only online-guessable secret in the product. All three are
overridable with `RATE_LIMIT_CREATE`, `RATE_LIMIT_UNLOCK` and `RATE_LIMIT_MUTATE`.

Two implementations behind one `RateLimiter` interface:

- **`MemoryRateLimiter`** (default) — a per-instance fixed window. Correct on a single server, but
  **serverless runs many isolated instances, so the effective limit is multiplied by the instance
  count.** Adequate for development; not sufficient for a public production deployment.
- **`UpstashRateLimiter`** — Upstash Redis over its REST API (no SDK dependency, works on
  serverless). `INCR` + `EXPIRE NX` + `TTL` in one pipeline call keeps the window atomic across
  instances. Enabled by setting `RATE_LIMIT_REDIS_URL` and `RATE_LIMIT_REDIS_TOKEN`.

If Upstash is unreachable, the limiter falls back to the local counter rather than failing the
request — availability is preserved and the endpoint stays protected on that instance.

The client identifier comes from `x-forwarded-for` / `x-real-ip` / `cf-connecting-ip`. These headers
are attacker-controlled behind a misconfigured proxy, so this is a speed bump, not authentication.
The IP is used transiently as a bucket key and is never persisted or logged.

## Secrets

`SUPABASE_SERVICE_ROLE_KEY` is read only through `lib/config/env.ts`, which is imported exclusively
by server modules. `lib/paste/service.ts` and the Supabase repository are marked `server-only`, so a
client component importing them fails the build rather than shipping the key. No secret is prefixed
`NEXT_PUBLIC_`.

Grep checks worth keeping in review: `NEXT_PUBLIC_.*SERVICE`, `SERVICE_ROLE` outside `lib/config`,
and any `process.env` reference inside `components/`.

## Row Level Security

```sql
alter table public.pastes enable row level security;
alter table public.pastes force row level security;

revoke all on table public.pastes from public, anon, authenticated;
grant select, insert, update, delete on table public.pastes to service_role;
```

RLS is enabled with **no policies at all**, which denies every request made with the anon or
authenticated key. The application reaches the table only through server-side routes using the
service-role key, which bypasses RLS. The consequence: a leaked anon key — the one that legitimately
ships to browsers in many Supabase apps — cannot read a single paste.

Table privileges are revoked as a **second, independent layer**. RLS alone would be undone by
anyone who later adds a permissive policy; with the grants removed, those roles still hold no
`SELECT`/`INSERT`/`UPDATE`/`DELETE` to exercise.

### Why the revokes name PUBLIC

This detail is easy to get wrong. PostgreSQL grants `EXECUTE` on every new function to the `PUBLIC`
pseudo-role by default, and **every role inherits PUBLIC**. Revoking only from `anon` and
`authenticated` therefore leaves them able to call the function through PUBLIC — the revoke looks
correct and changes nothing.

So each function revokes from PUBLIC as well, and `service_role` is granted back explicitly:

```sql
revoke execute on function public.consume_burn_paste(text) from public, anon, authenticated;
grant  execute on function public.consume_burn_paste(text) to service_role;
```

The same applies to `increment_paste_views` and `delete_expired_pastes`. The functions are
`security invoker`, so a caller without table privileges could not have done damage through them
anyway — but the intent is now explicit in the schema rather than implied by a second mechanism.

## Input validation

Zod schemas run at every server boundary. Client-side checks exist only to give fast feedback; the
server never trusts them.

- Content must be non-empty and within **1 MiB measured in UTF-8 bytes**, not string length — so
  multi-byte characters count fully and cannot be used to exceed the limit.
- Titles are capped at 120 characters and trimmed; blank becomes `null`.
- Language and expiration are closed enums, so a client cannot supply an arbitrary expiry timestamp.
- Encrypted payloads must be base64, with a recognised `encryptionVersion`.
- A discriminated union makes "encrypted *and* carrying plaintext" unrepresentable.
- The update schema has no `password` or `burnAfterRead` field at all, so an edit cannot change a
  paste's security mode. Unknown keys are dropped rather than applied.

## Filenames and path safety

`sanitizeFilenameBase()` removes path separators, backslashes, drive colons, shell metacharacters,
quotes, commas, semicolons and every C0/C1 control character (including CR and LF); collapses
whitespace; strips leading dots and hyphens so `..` and dotfiles cannot survive; truncates to 64
characters; and falls back to `tinypaste-<slug>` when nothing usable remains or the result is a
reserved Windows device name (`CON`, `NUL`, `LPT1`, …).

`Content-Disposition` carries both an ASCII-only quoted fallback and an RFC 5987 encoded form, so a
non-ASCII title survives without a raw quote or newline ever entering the header. Header injection
through a paste title is covered by unit tests and by an E2E test that creates a paste titled
`../../etc/passwd`.

## Security headers

Applied site-wide from `next.config.ts`:

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

The raw and download routes get a **stricter** policy that replaces the app's:
`default-src 'none'; sandbox`, plus `Cross-Origin-Resource-Policy: same-origin`. They are listed
after the site-wide rule in `headers()` on purpose — for a header key matched by more than one rule,
the later rule wins, so the export policy replaces rather than supplements the app policy. This was
found by an E2E test that asserts the raw response's CSP contains `sandbox`.

**Known limitation:** `script-src` needs `'unsafe-inline'` because the App Router emits inline
bootstrap and flight-payload scripts. A nonce-based policy would require middleware on every
request. Since no user content ever becomes markup, the inline allowance does not open an injection
path here — but it does mean the CSP is not a second line of defence against XSS, only the first
line is.

## Logging

`lib/security/logger.ts` emits an operation name, an error class and message, a timestamp and an
optional request id. It never receives paste bodies, passwords, encryption keys, edit tokens or
decrypted plaintext. Its `redact()` helper additionally drops object keys matching
`password|token|key|secret|content|plaintext|ciphertext`, so a careless future caller cannot leak
one by accident. ESLint's `no-console` (allowing only `warn`/`error`) keeps ad-hoc logging out of
application code.

Clients receive a generic message plus a request id for correlation — never a stack trace.

## Abuse

Groundwork only. The footer carries a "Report abuse" link, which becomes a `mailto:` when
`ABUSE_CONTACT_EMAIL` is set and otherwise points at a documented placeholder on `/about`. A real
report queue and moderation dashboard are on the roadmap, not implemented — `/about` says so rather
than implying a process that does not exist.

## Review checklist

Run before each release:

- [ ] `npm run lint && npm run typecheck && npm run test && npm run build`
- [ ] `npm run test:e2e`
- [ ] `npm audit` — record anything unresolved and why
- [ ] `grep -rn "dangerouslySetInnerHTML" app components lib` — one hit, the theme script
- [ ] `grep -rn "SERVICE_ROLE" --include=*.tsx components app` — no hits
- [ ] `grep -rn "console.log" app components lib` — no hits
- [ ] Confirm no route calls `getRepository()` without going through the service
- [ ] Confirm `toMetadata()` still lists fields explicitly

## Known unresolved items

- CSP requires `'unsafe-inline'` for scripts (above).
- The default rate limiter does not coordinate across serverless instances (above).
- Supabase point-in-time backups, if enabled by the operator, may retain deleted or burned content
  for their retention period. This is outside the application's control and is stated on `/privacy`.
- Abuse handling is a mailto link, not a workflow.

## Reporting a vulnerability

Set `ABUSE_CONTACT_EMAIL` for this deployment and use that address, or open a private report with
whoever operates the instance. Please do not file security issues in a public tracker.
