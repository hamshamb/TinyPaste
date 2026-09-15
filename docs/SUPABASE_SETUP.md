# Supabase setup

TinyPaste runs without Supabase — it falls back to a volatile in-memory store and says so in a
banner. This guide switches it to durable storage. Allow about ten minutes.

## 1. Create a project

1. Sign in at <https://supabase.com/dashboard>.
2. **New project**. Pick an organisation, a name (`tinypaste`), and a region close to your users.
3. Set a database password and store it in a password manager. TinyPaste never uses it directly —
   it connects through the REST API — but you need it for `psql` and the CLI.
4. Wait for provisioning (one to two minutes).

## 2. Find the project URL

**Project Settings → Data API → Project URL.**

It looks like `https://abcdefghijklmnopqrst.supabase.co`. This is
`NEXT_PUBLIC_SUPABASE_URL`.

## 3. Find the anon key

**Project Settings → API Keys → `anon` / `public`.**

This is `NEXT_PUBLIC_SUPABASE_ANON_KEY`. TinyPaste does not query the database from the browser, so
it is not strictly required — it is listed for completeness and future use. Row Level Security
denies this key access to the `pastes` table entirely (step 6).

## 4. Find the service role key

**Project Settings → API Keys → `service_role` / `secret`.** Reveal and copy it.

This is `SUPABASE_SERVICE_ROLE_KEY`.

> **This key bypasses Row Level Security.** Treat it like a database password.
> - Never prefix it with `NEXT_PUBLIC_`.
> - Never import it into a client component.
> - Never commit it. `.env.local` is already in `.gitignore`.
>
> In TinyPaste it is read only through `lib/config/env.ts`, which is imported exclusively by
> `server-only` modules, so a client component that tried to reach it would fail the build.

## 5. Fill in the environment file

```bash
cp .env.example .env.local
```

Then edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
APP_URL=http://localhost:3000
```

The app auto-detects Supabase as soon as the URL and service-role key are both present. No further
switch is needed.

## 6. Run the migration

The migration creates the `pastes` table, its indexes and constraints, the atomic burn function, the
view counter, the cleanup helper, and the RLS configuration.

### Option A — SQL editor (no tooling)

1. Open **SQL Editor → New query** in the dashboard.
2. Paste the entire contents of `supabase/migrations/0001_init.sql`.
3. **Run**. It should report success with no rows returned.

### Option B — Supabase CLI

```bash
npm install -D supabase
```

```bash
npx supabase login
```

```bash
npx supabase link --project-ref abcdefghijklmnopqrst
```

```bash
npx supabase db push
```

`--project-ref` is the subdomain from your project URL. `db push` applies everything in
`supabase/migrations/` in filename order.

## 7. Confirm the table exists

**Table Editor → `pastes`.** You should see the columns, with zero rows.

Or from the SQL editor:

```sql
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_name = 'pastes'
 order by ordinal_position;
```

Confirm the functions were created too:

```sql
select routine_name
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('consume_burn_paste', 'increment_paste_views', 'delete_expired_pastes');
```

Three rows.

## 8. Confirm Row Level Security

The migration already configures this; step 8 is verification.

```sql
select relname, relrowsecurity, relforcerowsecurity
  from pg_class
 where relname = 'pastes';
```

Both booleans must be `true`.

```sql
select count(*) from pg_policies where tablename = 'pastes';
```

Must be **0**. That is intentional: RLS on with no policies denies every request made with the anon
or authenticated key. TinyPaste reaches the table only server-side with the service-role key, which
bypasses RLS.

Verify from outside, substituting your project URL and anon key:

```bash
curl -s "https://abcdefghijklmnopqrst.supabase.co/rest/v1/pastes?select=*" -H "apikey: YOUR_ANON_KEY"
```

An empty array or a permission error is correct. If it returns paste rows, **stop** — RLS is not
applied, and anyone with the anon key can read every paste.

## 9. Start the app

```bash
npm run dev
```

Open <http://localhost:3000>. The amber "Temporary storage" banner should be **gone**. If it is
still there, the app did not detect Supabase — check for typos and restart the dev server, since
environment variables are read at startup.

## 10. Verify creation and retrieval

1. Create a paste with a recognisable title.
2. Confirm it opens at its `/p/<slug>` link.
3. In **Table Editor → `pastes`**, confirm the row exists and that `edit_token_hash` is a 64-character
   hex digest — not a token you recognise.
4. Create a password-protected paste. Confirm `password_hash` starts with `$2` and that the password
   itself appears nowhere.
5. Create an encrypted paste. Confirm `content` is `NULL`, `encrypted_content` holds base64 that does
   not resemble your text, and `is_encrypted` is `true`.
6. Create a burn-after-read paste, open the link in a private window, reveal it, then reload.
   The second load should say the paste is no longer available, and the row's `content` should be
   `NULL` with `burned_at` set.
7. Restart the dev server and reopen an earlier paste. It should still be there — that is the
   difference from in-memory mode.

## Optional: scheduled cleanup

Expiry is enforced in application code, so this is housekeeping only — it stops expired rows
lingering at rest.

Enable `pg_cron` under **Database → Extensions**, then:

```sql
select cron.schedule(
  'tinypaste-cleanup',
  '0 * * * *',
  $$ select public.delete_expired_pastes(); $$
);
```

Alternatively, set `CLEANUP_SECRET` and call `POST /api/cleanup` with
`Authorization: Bearer <secret>` from a Vercel Cron job — see [DEPLOYMENT.md](DEPLOYMENT.md).

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Banner still says "Temporary storage" | Variables not loaded | Check `.env.local` spelling; restart the dev server |
| `STORAGE_UNAVAILABLE` on create | `TINYPASTE_DB_DRIVER=supabase` without credentials | Fill both variables, or unset the driver |
| `relation "public.pastes" does not exist` | Migration not run | Redo step 6 |
| `Could not find the function public.consume_burn_paste` | Partial migration | Re-run the whole file; `create or replace` is idempotent |
| `new row violates check constraint "pastes_payload_shape"` | A row with both plaintext and ciphertext | A client bypassing validation; check the API caller |
| `permission denied for table pastes` | Using the anon key server-side | `SUPABASE_SERVICE_ROLE_KEY` is missing or wrong |
| Anon `curl` returns rows | RLS not applied | Re-run the RLS block in the migration immediately |
