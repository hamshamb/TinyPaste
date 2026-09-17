# Security model

TinyPaste treats pasted content as hostile input. Its primary strategy is structural: content stays
data throughout validation, storage, rendering, copying, and export. This document states what the
application protects, what it cannot protect, and what an operator must configure.

## Security summary

| Concern | Control |
| --- | --- |
| Paste XSS | React text/token rendering; closed document JSON; no user-supplied HTML injection |
| Link guessing | CSPRNG slugs, no listing endpoint, rate-limited creation |
| Unauthorised mutation | 256-bit edit token; SHA-256 at rest; constant-time comparison |
| Password guessing | bcrypt cost 12; rate-limited POST body attempts |
| Operator/database visibility | Optional browser-side AES-256-GCM encryption |
| Burn races | Row lock and wipe in one PostgreSQL transaction |
| Expired access | One central predicate on every read path |
| Direct Supabase access | Forced RLS, no policies, revoked browser-role privileges |
| CSRF | No ambient auth, same-origin mutation guard, restrictive form policy |
| Unsafe files | Sanitised names, inert content types, attachment responses |
| Metadata leaks | Generic page metadata, `noindex`, no-referrer policy |
| Secret logging | Narrow logger input plus key-name redaction |

## Threat model

### In scope

- A visitor submits scripts, markup, malformed document trees, unsafe links, control characters, or
  header-injection strings.
- Someone guesses paste URLs or attempts online password guessing.
- A visitor without an edit token attempts to edit or delete a paste.
- Multiple readers race to consume one burn-after-reading paste.
- A leaked browser-facing Supabase key is used against the REST API.
- A hostile site attempts cross-origin mutations.
- A crawler, prefetcher, or link-preview bot follows a paste URL.
- The database or operator is curious about a browser-encrypted payload.

### Out of scope

- A person who already has the complete link, and the password when applicable.
- A reader copying or photographing content before expiration or burn.
- A compromised browser, device, extension, build pipeline, server runtime, or service-role key.
- Traffic analysis, network metadata, host/CDN logs, and provider backups.
- Recovery of a lost edit token, password, or encryption fragment.
- Availability under large-scale denial-of-service attacks.
- Strong anonymity. TinyPaste does not add an anonymity network or control infrastructure logging.

## Untrusted-content rendering

### Code and plain text

Shiki's token API returns token data, not an HTML string. TinyPaste maps tokens to React elements,
so React escapes their text. Copy uses the original source string, not highlighted markup.

The raw route returns `text/plain; charset=utf-8` with `nosniff` and a sandboxed
`default-src 'none'` policy. The download route returns `application/octet-stream` as an
attachment. An HTML-looking paste therefore does not become an executable same-origin document.

### Documents

Document mode never stores arbitrary HTML. It stores a closed ProseMirror JSON subset accepted by
`lib/document/schema.ts`. Validation rejects:

- unknown nodes, marks, and attributes;
- dangerous or unsupported link schemes;
- unsupported CSS colour values;
- oversized text/arrays, excessive nesting, and excessive node counts;
- malformed JSON for plaintext document rows.

The reader walks that structure into a fixed React element set and rechecks links and colours while
rendering. External HTTP(S) links open with `noopener noreferrer nofollow`. HTML export is generated
fresh in the browser from validated JSON and the known Tiptap extension set; it is never a stored
HTML blob. Markdown export escapes control characters before applying marks.

### Known inline-script constraint

The site-wide Content Security Policy permits inline scripts/styles because the Next.js App Router
emits bootstrap/flight scripts and the app uses a pre-paint theme bootstrap. This means CSP is not
the sole XSS defence. The primary defence is that user content never enters an HTML injection sink.
Moving to a nonce-based policy would require per-request nonce propagation.

## Browser-side encryption

| Property | Value |
| --- | --- |
| Algorithm | AES-GCM |
| Key | 256 random bits |
| IV | Fresh 96 random bits per encryption |
| Authentication tag | 128 bits |
| Derivation | None; the random key is the secret |
| Transport | URL fragment, `#k:<base64url>` |
| Stored format version | `1` |

The browser encrypts before building the create/update request. The request contains ciphertext, IV,
format version, and non-secret metadata. The key is exported into the URL fragment. Browsers do not
send fragments in HTTP requests, so the application server cannot recover it.

AES-GCM authenticates the ciphertext. A wrong key and modified payload both fail closed with the
same decryption error. A missing fragment gets a separate message because the remedy is to obtain
the complete URL. There is no server-plaintext fallback.

Encrypted documents receive the same confidentiality: the serialized document JSON is encrypted
before upload. The server can still see metadata such as title, language/content type, size,
timestamps, expiration, and burn state.

### Key-handling invariants

The key must not enter a request URL, body, header, cookie, server log, database column, or local
history record. End-to-end tests inspect creation and read traffic for key and plaintext leaks.
`Referrer-Policy: no-referrer` prevents even the slug from being sent to outbound links.

### Why passwords and browser encryption are exclusive

A server password gates access for people who possess the URL, but the server eventually receives
plaintext. A fragment key hides plaintext from the server but grants access to anyone with the
complete URL. Combining the two creates independent secrets and ambiguous loss/recovery behaviour
without improving either individual guarantee. The current format rejects the combination in the
UI, Zod schema, and database constraint.

## Passwords

- Passwords must contain 6–200 characters.
- bcryptjs hashes them with cost 12 for consistent Node/serverless deployment.
- Plaintext is accepted only in a POST body, used for one comparison, and never stored or logged.
- Unlock attempts default to 10 per five minutes per best-effort client identity.
- Malformed stored hashes fail verification rather than exposing a distinct error.

Passwords protect against casual link possession and online guessing within configured rate limits.
They do not hide plaintext from the application server or database.

## Edit tokens and browser ownership

Creation produces 32 random bytes encoded as base64url. The server stores a SHA-256 digest and sends
the raw token once. The browser keeps it with local history and transmits it in the
`x-tinypaste-edit-token` header for edit/delete operations.

A plain digest is appropriate because this token has 256 bits of machine-generated entropy; a slow
password KDF would add cost without addressing a plausible dictionary attack. Verification uses a
constant-time comparison. Client-side possession only controls whether owner UI appears; the server
authorises every mutation independently.

Clearing site storage destroys ownership capability. There is no account or server-side recovery.

## Expiration and deletion

`loadPasteRecord()` is the central readable-record gate. It validates the slug, fetches the row,
checks expiration, and checks burn state. Page, API, raw, download, unlock, and reveal flows converge
on this service boundary rather than querying storage independently.

A paste expires at its exact expiry instant. Cleanup is not part of access correctness; it only
removes rows already made unreadable. The cleanup route is disabled without `CLEANUP_SECRET`.

Owner deletion of expired/burned records deliberately bypasses the readable-record state while
still requiring the edit token. That lets owners remove residual metadata without making content
readable again.

## Burn after reading

- The initial GET returns metadata and a gate, not the payload.
- Consumption requires an explicit POST initiated by the reader.
- Password verification, when present, happens before consumption.
- PostgreSQL locks, captures, marks, and wipes the row atomically.
- Raw/download routes refuse burn pastes without consuming them.
- Exactly one concurrent caller can receive the payload.
- For encrypted burns, the winning caller receives ciphertext and decrypts locally.

Burn is not copy prevention. The first reader can retain whatever the browser receives.

## Database isolation

Supabase is accessed server-side with the service-role key. The migrations:

1. enable and force Row Level Security on `public.pastes`;
2. create no RLS policies for browser roles;
3. revoke table privileges from `PUBLIC`, `anon`, and `authenticated`;
4. grant only the required table operations to `service_role`;
5. revoke helper-function execution from public/browser roles and grant it back to
   `service_role`.

RLS and privilege revocation are independent layers. The service-role key bypasses RLS and must
remain server-only. Never add `NEXT_PUBLIC_` to its variable name or import it into client code.

Database constraints mirror critical invariants: plaintext/ciphertext exclusivity, password and
encryption incompatibility, valid content types, document JSON syntax, burn state, title/slug shape,
and non-negative size.

## Request security and abuse resistance

Mutations do not use cookies or sessions. Edit tokens are explicit headers, so a cross-site form has
no ambient credential to reuse. `guardMutation` also rejects mismatched `Origin` values while
allowing requests without an Origin (for non-browser clients). Reverse proxies must forward the
original host correctly.

Default fixed-window limits:

| Action | Limit | Window |
| --- | ---: | ---: |
| Create | 20 | 60 seconds |
| Password unlock | 10 | 300 seconds |
| Edit/delete | 30 | 60 seconds |

The memory limiter is per process. Configure Upstash REST credentials for a shared serverless limit.
If Upstash is unavailable, the app logs the failure and falls back locally; availability wins over
global enforcement during that outage. These limits are abuse friction, not full DDoS protection.

## Security headers

The app applies:

- a same-origin default CSP with objects, frames, and cross-origin connections blocked;
- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY` and `frame-ancestors 'none'`;
- `Referrer-Policy: no-referrer`;
- restrictive camera, microphone, geolocation, and tracking-topic permissions;
- `Cross-Origin-Opener-Policy: same-origin`;
- `upgrade-insecure-requests`.

Raw/download routes replace the app CSP with `default-src 'none'; sandbox` and add same-origin
resource policy. Header behaviour is covered end to end.

## Filenames and response headers

Download names remove path components, control characters, separators, quotes, and leading
dots/hyphens; cap length; reject Windows device names; and fall back to a slug-based name. The
`Content-Disposition` header includes both a safe ASCII fallback and an RFC 5987 encoded filename.

## Logging and metadata

Application logs receive operation names, error class/message, timestamp, and optional request ID.
They do not receive bodies, passwords, keys, edit tokens, or decrypted content. The redactor drops
keys matching sensitive terms as a second line of defence.

Paste pages use generic social/page metadata and `noindex`; user titles do not become preview
metadata. The application includes no analytics or third-party scripts. Hosting infrastructure can
still record IPs and paths.

## Operator checklist

Before a public release:

- [ ] Run `npm run check` and `npm run test:e2e`.
- [ ] Run `npm audit`; document any accepted findings.
- [ ] Apply every migration and verify forced RLS plus zero browser policies.
- [ ] Confirm anon/authenticated roles have no table or helper-function privileges.
- [ ] Confirm the service-role value exists only in server environment configuration.
- [ ] Configure shared rate limiting for multi-instance hosting.
- [ ] Use HTTPS and set the exact canonical `APP_URL`.
- [ ] Configure an abuse contact and an expired-row cleanup schedule.
- [ ] Test encryption in browser network tools: no plaintext and no fragment key in requests.
- [ ] Search `dangerouslySetInnerHTML`; only compile-time application bootstraps may use it.
- [ ] Search route code for direct repository access and review every exception.

Useful repository checks:

```bash
rg -n "dangerouslySetInnerHTML" app components lib
rg -n "SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE" app components
rg -n "console\.log" app components lib
```

## Residual risks

- The CSP currently permits inline scripts/styles.
- Local rate limits do not coordinate without Upstash.
- Provider backups may retain expired, deleted, or burned data for their retention period.
- Abuse reporting is an email link, not a case-management system.
- End-to-end coverage currently exercises Chromium only.
- A malicious operator can read every non-encrypted paste.

## Reporting a vulnerability

Contact the operator through the configured abuse/security address and include reproduction steps,
impact, and affected paths. Avoid posting secrets or exploit details in a public issue. If no contact
is configured, report privately to the repository owner.
