# Feature reference

This is the user-visible capability matrix for TinyPaste.

**Status:** ✅ implemented and covered · ◐ implemented with an operational or testing limitation ·
No: intentionally unsupported · ◌ planned.

## Authoring

| Capability | Status | Behaviour |
| --- | :---: | --- |
| Code mode | ✅ | Monaco editor with language-aware editing and cursor position |
| Plain-text mode | ✅ | Monaco without syntax highlighting; language is fixed to plain text |
| Document mode | ✅ | Tiptap editor with validated structured output |
| Title | ✅ | Optional, trimmed, maximum 120 characters |
| Payload size | ✅ | Maximum 1 MiB, measured as UTF-8 bytes or encrypted payload bytes |
| Languages | ✅ | 32 manually selected code/text languages |
| Automatic language detection | ◌ | Not implemented; manual selection is deterministic |
| JSON formatting | ✅ | Explicit action in code mode; content is never reformatted silently |
| Mode switching before creation | ✅ | Code/text converts to document paragraphs; documents flatten to text |
| Drag-and-drop files | ◌ | Not implemented |

### Document formatting

Document mode supports paragraphs; headings 1–3; bold, italic, underline, strike, and inline code;
bulleted and numbered lists; blockquotes; code blocks; horizontal rules; safe links; left, centre,
right, and justified alignment; text colour; highlights; hard breaks; undo; and redo.

Documents are stored as a closed ProseMirror JSON subset. Node count, nesting, attributes, link
schemes, and CSS colours are validated before plaintext documents are stored. Encrypted documents
are validated in the browser before encryption and again after decryption.

## Lifetime and access

| Capability | Status | Behaviour |
| --- | :---: | --- |
| Expiration | ✅ | 10 min, 1 h, 1 d, 7 d, 30 d, or never; default is 7 d |
| Custom expiration | ◌ | Not implemented; the API accepts only the closed option set |
| Link-only access | ✅ | Anyone with the unguessable URL can read |
| Password protection | ✅ | bcrypt cost 12; unlock attempts are rate limited |
| Burn after reading | ✅ | Explicit reveal; one atomic winner; payload wiped on consumption |
| Browser encryption | ✅ | AES-256-GCM; key lives in the URL fragment |
| Password + browser encryption | No | Mutually exclusive in the current storage format |
| Edit a burn paste | No | Disallowed because its payload is designed to disappear |

Creating a burn paste does not consume it. The creator first sees a warning; a reader must choose
**Reveal and destroy**. Raw and download routes refuse burn pastes rather than consuming them.

## Reading and sharing

| Capability | Status | Behaviour |
| --- | :---: | --- |
| Syntax highlighting | ✅ | Shiki token output rendered as React elements |
| Line numbers | ✅ | Sticky gutter with horizontal scrolling for long lines |
| Rich-document rendering | ✅ | Validated JSON is walked directly into React elements |
| Copy | ✅ | Source text, plain text, or rich HTML with a plain-text fallback |
| Copy link | ✅ | Preserves the fragment key for encrypted pastes |
| Raw route | ✅ | Available for unprotected code/text; inert `text/plain` response |
| Download route | ✅ | Available for unprotected code/text; attachment with safe filename |
| Document export | ✅ | Browser-generated HTML and Markdown; raw/download server routes refuse documents |
| Fork | ✅ | Starts a new paste from content already revealed or decrypted |
| QR code | ✅ | Generated locally; the complete encrypted URL never reaches a QR service |
| View count | ✅ | Aggregate integer only; no per-view application records |
| Timestamps | ✅ | Stored in UTC, shown in the visitor's local timezone |
| Rendered Markdown mode | ◌ | Document mode is the rich-format path; Markdown code stays source |
| Diff/version history | ◌ | Not implemented |

## Ownership without accounts

| Capability | Status | Behaviour |
| --- | :---: | --- |
| Edit token | ✅ | 256 random bits; returned once; SHA-256 digest stored server-side |
| Edit | ✅ | Title, content, language where applicable, and renewed expiration |
| Edit encrypted content | ✅ | Decrypts and re-encrypts locally with the fragment key |
| Change content type after creation | No | Fixed to prevent reinterpretation of stored bytes |
| Change security mode after creation | No | Fixed to prevent downgrade and recovery ambiguity |
| Delete | ✅ | Confirmation plus server-side edit-token verification |
| Delete expired/burned record | ✅ | Owner deletion bypasses read state but never token verification |
| Recent pastes | ✅ | Maximum 200 entries in the current browser's local storage |
| Forget local entry | ✅ | Does not delete the server paste |
| Clear local history | ✅ | Removes browser records after confirmation |
| Accounts and synchronised history | ◌ | Not implemented |

Clearing site data or changing browsers loses edit access. There is no recovery channel because the
raw token is not stored by the server.

## Interface and accessibility

| Capability | Status | Behaviour |
| --- | :---: | --- |
| Themes | ✅ | Light, dark, and system; pre-paint bootstrap avoids a theme flash |
| Responsive layout | ✅ | Desktop, tablet, and mobile layouts |
| Create shortcut | ✅ | `Ctrl/Cmd + Enter` |
| Copy shortcut | ✅ | `Ctrl/Cmd + Shift + C` where the paste action is available |
| Command palette | ✅ | `Ctrl/Cmd + K` |
| Loading/error states | ✅ | Duplicate actions disabled; typed user-facing failures |
| Keyboard focus | ✅ | Visible focus styles, labelled controls, skip-to-content link |
| Real screen-reader audit | ◐ | Semantic implementation exists; no documented assistive-tech audit yet |

## Security and privacy

| Capability | Status | Behaviour |
| --- | :---: | --- |
| Non-executable paste content | ✅ | No user HTML is injected in code or document read paths |
| Server validation | ✅ | Zod at request boundaries plus database constraints |
| Central read policy | ✅ | Expiry, password, and burn rules converge in the service layer |
| Safe exports | ✅ | Inert content types, strict export CSP, sanitised filenames |
| Row Level Security | ✅ | Enabled and forced; browser roles have no policies or table privileges |
| Rate limiting | ✅ | Local fixed-window implementation |
| Distributed rate limiting | ◐ | Upstash adapter activates only when its credentials are configured |
| Secure metadata | ✅ | Paste pages are `noindex`; titles are excluded from page metadata |
| Redacted logging | ✅ | Sensitive field names are removed; payloads are not passed to logs |
| Analytics/third-party scripts | ✅ | None; CSP restricts connections to the same origin |
| Abuse reporting | ◐ | Configurable email link, not a moderation queue |
| Nonce-based CSP | ◌ | Current Next.js-compatible policy permits inline scripts/styles |

The detailed guarantees and exclusions are in [SECURITY.md](SECURITY.md).

## Operations and quality

| Capability | Status | Behaviour |
| --- | :---: | --- |
| Supabase storage | ✅ | Server-only service-role repository |
| In-memory storage | ✅ | Development/E2E fallback with a visible warning |
| Production memory guard | ✅ | Refuses volatile storage without explicit opt-in |
| Expired-row cleanup | ✅ | Authenticated POST route and a direct PostgreSQL helper |
| Schema migrations | ✅ | Base schema plus content-type migration |
| Stable public API | ◌ | Internal JSON endpoints exist but carry no compatibility promise |
| Unit suite | ✅ | 272 tests across 12 files at this revision |
| End-to-end suite | ✅ | 65 Chromium tests across 5 files at this revision |
| Cross-browser E2E | ◐ | Playwright currently runs Chromium only |
| Load testing | ◌ | Not implemented |

## Roadmap

Potential future work includes accounts, synchronised collections, API keys and a versioned public
API, a CLI, browser extensions, custom expirations and domains, file sharing, diffs and revisions,
webhooks, collaborative editing, a moderation workflow, cross-browser coverage, and load testing.

Roadmap items are directions, not commitments.
