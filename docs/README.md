# TinyPaste documentation

This directory is the operating manual for TinyPaste. The root
[README](../README.md) is the product overview and quick start; the guides here explain the
behaviour, trust boundaries, storage setup, and production lifecycle in detail.

## Choose a guide

| If you want to… | Read |
| --- | --- |
| Understand what users can do | [Features](FEATURES.md) |
| Follow a request through the system | [Architecture](ARCHITECTURE.md) |
| Evaluate threats, controls, and known limits | [Security](SECURITY.md) |
| Connect a durable database | [Supabase setup](SUPABASE_SETUP.md) |
| Ship and verify a public instance | [Deployment](DEPLOYMENT.md) |
| Reuse or export the project logo | [Brand assets](assets/README.md) |

## Recommended reading paths

**New contributor:** root README → Features → Architecture → Security.

**Self-hoster:** root README → Supabase setup → Deployment → Security.

**Security reviewer:** Security → Architecture → the two SQL migrations in
`supabase/migrations/`.

## Sources of truth

Documentation should explain the implementation, not compete with it. When values change, update the
corresponding source and this documentation together:

| Concern | Source of truth |
| --- | --- |
| Product limits | `lib/config/constants.ts` |
| Expiration choices | `lib/paste/expiration.ts` |
| Supported languages | `lib/paste/languages.ts` |
| Content types | `lib/paste/content-type.ts` |
| Request validation | `lib/validation/paste.ts` |
| Rich-document format | `lib/document/schema.ts` |
| Access policy | `lib/paste/service.ts` |
| Storage contract | `lib/db/repository.ts` |
| Database invariants | `supabase/migrations/*.sql` |
| Security headers | `lib/security/headers.ts` |
| Runtime configuration | `.env.example` and `lib/config/env.ts` |

## Documentation conventions

- Paths and commands are written from the repository root.
- “Browser encryption” means client-side AES-GCM with a fragment-held key.
- “Document” means the closed, validated Tiptap/ProseMirror JSON format—not arbitrary HTML.
- “Owner” means a browser holding the paste's edit token; TinyPaste has no user accounts.
- “Public” means reachable by link. It does not mean listed or indexed.
