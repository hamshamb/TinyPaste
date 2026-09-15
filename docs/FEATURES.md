# Features

Status key: **Implemented** — working and tested · **Partial** — usable with a documented limit ·
**Planned** — not built.

## Creating

| Feature | Status | Notes |
| --- | --- | --- |
| Paste text, code, logs, config | Implemented | Up to 1 MiB, measured in UTF-8 bytes |
| Optional title | Implemented | 120 characters, trimmed; blank becomes untitled |
| Language selection | Implemented | 32 languages, always manually selectable |
| Automatic language detection | Planned | Deliberately skipped — unreliable detection is worse than a default |
| Expiry | Implemented | 10 min / 1 h / 1 day / 7 days / 30 days / never |
| Custom expiry value | Planned | The closed enum means the server never trusts a client timestamp |
| Password protection | Implemented | bcrypt cost 12, rate limited |
| Burn after reading | Implemented | Atomic, explicit-consent reveal |
| Browser-side encryption | Implemented | AES-GCM 256, key in the URL fragment |
| Encryption **and** password together | Not supported | Deliberate in v1; see SECURITY.md |
| JSON formatting before saving | Implemented | Opt-in button, never automatic |
| Size and character counter | Implemented | Turns red past the limit |
| Drag-and-drop file upload | Planned | |

## Viewing

| Feature | Status | Notes |
| --- | --- | --- |
| Syntax highlighting | Implemented | Shiki tokens as React elements; one grammar loaded per page |
| Line numbers | Implemented | Sticky gutter, horizontal scroll for long lines |
| Copy content | Implemented | Original plaintext, never the highlighted markup |
| Copy link | Implemented | Encrypted links always include the `#key` |
| Raw view | Implemented | Server route for plain pastes; in-page toggle for protected ones |
| Download | Implemented | Server route for plain pastes; local blob for protected ones |
| Fork | Implemented | Only after successful unlock or decryption |
| QR code | Implemented | Generated locally; never sent to a third-party service |
| View counter | Implemented | One integer, no per-view records |
| Relative and absolute timestamps | Implemented | UTC storage, rendered in the visitor's timezone |
| Rendered Markdown preview | Planned | Would need careful sanitisation; source highlighting for now |
| Paste diffing | Planned | |

## Ownership

| Feature | Status | Notes |
| --- | --- | --- |
| Edit token on creation | Implemented | 256 bits, SHA-256 at rest, shown once |
| Edit a paste | Implemented | Title, content, language, expiry |
| Edit an encrypted paste | Implemented | Decrypted and re-encrypted locally with the fragment key |
| Edit a burn-after-read paste | Not supported | Meaningless — the payload is destroyed on first read |
| Change the security mode by editing | Not supported | Prevents an unrecoverable ciphertext → plaintext downgrade |
| Delete a paste | Implemented | Confirmation dialog, server-verified token |
| Delete an expired or burned paste | Implemented | Deletion bypasses the read gate, so a leftover record is never stranded |
| Recent pastes | Implemented | Per browser; there is no server-side listing API at all |
| Forget a paste locally | Implemented | Removes the local record without deleting the paste |
| Clear local history | Implemented | With confirmation |
| Accounts | Planned | |

## Interface

| Feature | Status | Notes |
| --- | --- | --- |
| Light / dark / system themes | Implemented | Inline bootstrap script, no flash |
| Mobile layout | Implemented | Verified at 375, 768 and 1440 px |
| Keyboard shortcuts | Implemented | `Ctrl`/`Cmd`+`Enter` create, `Ctrl`/`Cmd`+`Shift`+`C` copy |
| Command palette | Implemented | `Ctrl`/`Cmd`+`K` |
| Toasts | Implemented | Duplicates collapse rather than stack |
| Loading states | Implemented | Buttons disable during work; no duplicate submissions |
| Error states | Implemented | Not found, expired, burned, locked, wrong password, missing key, decryption failed, rate limited, too large, invalid slug, server error |
| Accessibility | Implemented | Semantic HTML, labelled inputs, visible focus, ARIA only where needed, status never conveyed by colour alone |
| Skip-to-content link | Implemented | |
| Screen-reader audit | Partial | Built to the standards above; not yet tested with a real screen reader |

## Security and privacy

| Feature | Status | Notes |
| --- | --- | --- |
| Pasted content never executes | Implemented | Structural: no HTML string in the render path |
| Inert raw and download responses | Implemented | `nosniff`, `text/plain` / octet-stream, `default-src 'none'; sandbox` |
| Centralised expiry enforcement | Implemented | One gate every read path passes through |
| Atomic burn | Implemented | `SELECT … FOR UPDATE` in Postgres; tested with concurrent claims |
| Password hashing | Implemented | bcrypt cost 12 |
| Edit-token hashing | Implemented | SHA-256, constant-time comparison |
| Server-side validation | Implemented | Zod at every boundary |
| Rate limiting | Implemented | In-memory by default |
| Distributed rate limiting | Partial | Upstash adapter written; needs credentials to activate |
| Security headers | Implemented | CSP, nosniff, frame denial, no-referrer, permissions policy |
| Nonce-based CSP | Planned | Would need per-request middleware; `'unsafe-inline'` for now |
| Row Level Security | Implemented | Enabled with no policies; anon key cannot read anything |
| Safe logging | Implemented | Redacting logger; `no-console` lint rule |
| Filename sanitisation | Implemented | Traversal, control characters and header injection |
| `noindex` on paste pages | Implemented | Plus generic metadata, so link previews leak nothing |
| No analytics or third-party scripts | Implemented | CSP blocks cross-origin connections outright |
| Privacy and About pages | Implemented | Including limits the app cannot guarantee |
| Report abuse | Partial | `mailto:` link; no moderation workflow |

## Operations

| Feature | Status | Notes |
| --- | --- | --- |
| Supabase repository | Implemented | Service-role, server-only |
| In-memory repository | Implemented | Dev and E2E; refused in production without an explicit flag |
| Volatile-storage banner | Implemented | So a demo cannot be mistaken for durable storage |
| Expired-row cleanup | Implemented | `POST /api/cleanup` plus a `pg_cron` recipe |
| Structured JSON API | Implemented | Consistent error shape, closed code set |
| Public documented API | Planned | Endpoints exist but carry no stability guarantee |
| API keys | Planned | |
| Migrations | Implemented | `supabase/migrations/0001_init.sql` |

## Testing

| Area | Status | Notes |
| --- | --- | --- |
| Unit tests | Implemented | 225 tests over slugs, expiry, crypto, filenames, tokens, passwords, validation, rate limiting, headers, repository, service |
| E2E tests | Implemented | 49 tests over create, view, export, fork, password, burn, encryption, ownership, headers, XSS |
| Burn concurrency | Implemented | 20 simultaneous service claims; 2 simultaneous HTTP reveals |
| Encryption leak checks | Implemented | Every request URL, body and header asserted free of key and plaintext |
| Cross-browser E2E | Partial | Chromium only |
| Load testing | Planned | |

## Roadmap

Optional accounts · paste collections · API keys and a documented public API · CLI client · browser
extension · webhooks on creation · collaborative editing · custom expiry values · custom domains ·
encrypted file sharing · paste diffing and version history · report-and-moderation workflow ·
self-hosting guides.
