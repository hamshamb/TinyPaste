# Supabase setup

TinyPaste can run locally without a database, but durable storage requires Supabase PostgreSQL.
This guide creates a project, applies both migrations, and verifies that browser-facing roles cannot
read paste rows.

## What you need

- A Supabase account and a new or disposable project.
- Access to the project's SQL Editor, or the Supabase CLI.
- The TinyPaste repository installed locally.

Keep development and production in separate Supabase projects. Paste rows are user data; sharing a
database across environments makes testing, retention, and incident response unnecessarily risky.

## 1. Create the project

1. Open <https://supabase.com/dashboard> and choose **New project**.
2. Select an organisation, project name, and a region close to users.
3. Generate a strong database password and save it in a password manager.
4. Wait for provisioning to finish.

TinyPaste uses Supabase's server-side client rather than a direct connection string, but the
database password remains important for CLI and emergency administration.

## 2. Collect credentials

In project settings, copy:

| Setting | TinyPaste variable | Sensitivity |
| --- | --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | Public identifier |
| Anon/public key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public, but intentionally powerless |
| Service-role/secret key | `SUPABASE_SERVICE_ROLE_KEY` | **Secret; bypasses RLS** |

Supabase dashboard labels can vary between legacy and newer key formats. Use the key documented as
server-side/secret/service-role, not a publishable key, for `SUPABASE_SERVICE_ROLE_KEY`.

Never:

- prefix the service-role variable with `NEXT_PUBLIC_`;
- paste it into browser code or a public issue;
- commit it to the repository;
- reuse a production service-role key in preview deployments you do not trust.

## 3. Configure local environment

```bash
cp .env.example .env.local
```

Fill the values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_OR_SECRET_KEY
APP_URL=http://localhost:3000
```

The app chooses Supabase automatically when the URL and service-role key are both present. If
`TINYPASTE_DB_DRIVER` is set, either remove it or set it to `supabase`.

Restart the development server after changing environment variables.

## 4. Apply migrations

Apply every SQL file in `supabase/migrations/` in filename order:

1. `0001_init.sql`: base table, indexes, constraints, RLS, privileges, atomic burn, view counter,
   and cleanup function.
2. `0002_content_types.sql`: code/plain-text/document discriminator, legacy backfill, and document
   JSON syntax constraint.

### Option A: dashboard SQL Editor

For each file in order:

1. Open **SQL Editor → New query**.
2. Paste the complete file.
3. Choose **Run** and confirm success before continuing.

Do not apply only `0002`; it alters the table created by `0001`.

### Option B: Supabase CLI

With the CLI available:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

`YOUR_PROJECT_REF` is the subdomain in the project URL. `db push` applies pending migrations in
order and records their versions.

## 5. Verify schema and migrations

Confirm the table and content-type column:

```sql
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'pastes'
 order by ordinal_position;
```

Confirm both migration versions through the CLI:

```bash
npx supabase migration list
```

Confirm the helper functions:

```sql
select routine_name
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in (
     'consume_burn_paste',
     'increment_paste_views',
     'delete_expired_pastes'
   )
 order by routine_name;
```

Expected: three rows.

Check the critical constraints:

```sql
select conname
  from pg_constraint
 where conrelid = 'public.pastes'::regclass
 order by conname;
```

The result should include payload-shape, encryption/password, burn-state, content-type, and document
JSON constraints.

## 6. Verify Row Level Security

This is a release blocker. TinyPaste intentionally creates no browser-readable policies.

```sql
select relrowsecurity, relforcerowsecurity
  from pg_class
 where oid = 'public.pastes'::regclass;
```

Both values must be `true`.

```sql
select count(*)
  from pg_policies
 where schemaname = 'public'
   and tablename = 'pastes';
```

Expected: `0`.

RLS is reinforced by table privileges:

```sql
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name = 'pastes'
 order by grantee, privilege_type;
```

`anon` and `authenticated` must not appear. `service_role` should have SELECT, INSERT, UPDATE,
and DELETE.

Finally, verify helper-function execution:

```sql
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
       has_function_privilege('public', p.oid, 'execute') as public_can_execute,
       has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (
     'consume_burn_paste',
     'increment_paste_views',
     'delete_expired_pastes'
   )
 order by p.proname;
```

Each row should read `false, false, false, true` across the four role checks. PostgreSQL grants
function execution to `PUBLIC` by default, which is why the migration explicitly revokes it.

## 7. Test the browser-facing key

From a terminal, substitute your project URL and anon/publishable key:

```bash
curl -i "https://YOUR_PROJECT_REF.supabase.co/rest/v1/pastes?select=*" \
  -H "apikey: YOUR_ANON_OR_PUBLISHABLE_KEY"
```

An empty result or permission error is acceptable. Returned paste rows are not; stop deployment and
reapply/review the RLS and privilege block in `0001_init.sql`.

## 8. Start TinyPaste

```bash
npm run dev
```

Open <http://localhost:3000>. The **Temporary storage** banner should be absent. If it remains:

1. confirm both required Supabase variables are spelled correctly;
2. confirm `.env.local` is at the repository root;
3. check whether `TINYPASTE_DB_DRIVER=memory` is forcing the fallback;
4. restart the server.

## 9. Functional verification

Create one paste for each important storage path:

- [ ] **Code:** row has `content_type = 'code'`; raw/download work.
- [ ] **Plain text:** row has `content_type = 'plaintext'`.
- [ ] **Document:** row has `content_type = 'document'`; `content` is valid JSON; document export
      works while raw/download are refused.
- [ ] **Password:** `password_hash` starts with a bcrypt prefix and plaintext password is absent.
- [ ] **Encrypted:** `content IS NULL`, ciphertext/IV are populated, and the complete link decrypts
      in the browser.
- [ ] **Encrypted document:** database contains ciphertext rather than readable document JSON.
- [ ] **Burn:** first explicit reveal succeeds; reload is unavailable; payload columns are null and
      `burned_at` is populated.
- [ ] **Ownership:** `edit_token_hash` is a 64-character hex digest; the creating browser can edit
      and delete.
- [ ] **Durability:** restart the app and confirm a normal paste still opens.

## 10. Schedule expired-row cleanup

Expiry checks do not depend on cleanup, but expired data should not remain at rest indefinitely.
The simplest scheduler is PostgreSQL itself.

Enable the `pg_cron` extension in **Database → Extensions**, then run:

```sql
select cron.schedule(
  'tinypaste-delete-expired',
  '0 * * * *',
  $$ select public.delete_expired_pastes(); $$
);
```

Verify the schedule:

```sql
select jobid, jobname, schedule, command, active
  from cron.job
 where jobname = 'tinypaste-delete-expired';
```

Alternatively, set `CLEANUP_SECRET` and use an external scheduler that can send an authenticated
`POST /api/cleanup`. Standard Vercel Cron requests are GET requests, so they cannot call this POST
route directly without an intermediary.

## Troubleshooting

| Symptom | Likely cause | Resolution |
| --- | --- | --- |
| Temporary-storage banner remains | Variables not loaded or memory driver forced | Correct `.env.local`, remove forced driver, restart |
| `STORAGE_UNAVAILABLE` | Supabase driver lacks usable credentials | Set URL + service role together |
| `relation public.pastes does not exist` | Base migration missing | Apply `0001_init.sql` |
| `column content_type does not exist` | Second migration missing | Apply `0002_content_types.sql` |
| Missing burn/view/cleanup function | Partial base migration | Reapply the complete `0001` migration |
| Payload-shape constraint failure | Request tried to store plaintext and ciphertext together | Inspect the caller and validation path |
| Content-type constraint failure | Unknown content type or stale custom client | Send `code`, `plaintext`, or `document` |
| Document JSON constraint failure | Plaintext document payload is not valid JSON | Use the product editor/API schema |
| Permission denied for `pastes` | Server is using anon key | Correct `SUPABASE_SERVICE_ROLE_KEY` |
| Anon REST request returns rows | RLS/privileges are unsafe | Take the app offline and restore the migration security block |
