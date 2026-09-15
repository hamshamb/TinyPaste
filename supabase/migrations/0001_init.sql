-- TinyPaste — initial schema.
--
-- Run with the Supabase SQL editor or `supabase db push`.
-- See docs/SUPABASE_SETUP.md for the full walkthrough.

create extension if not exists "pgcrypto";

create table if not exists public.pastes (
  id                 uuid primary key default gen_random_uuid(),
  slug               text        not null unique,
  title              text,
  -- Exactly one of content / encrypted_content is populated; see the
  -- pastes_payload_shape constraint below.
  content            text,
  encrypted_content  text,
  encryption_iv      text,
  encryption_version integer,
  is_encrypted       boolean     not null default false,
  language           text        not null default 'plaintext',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  expires_at         timestamptz,
  -- bcrypt hash. Plaintext passwords are never sent to or stored by the database.
  password_hash      text,
  burn_after_read    boolean     not null default false,
  burned_at          timestamptz,
  -- SHA-256 of a 256-bit random token. The raw token exists only in the
  -- creator's browser.
  edit_token_hash    text        not null,
  views              bigint      not null default 0,
  content_size       integer     not null default 0,

  constraint pastes_slug_shape check (slug ~ '^[A-Za-z0-9]{4,16}$'),
  constraint pastes_title_length check (title is null or char_length(title) <= 120),
  -- A row is either plaintext or ciphertext, never both and never neither.
  -- The burned_at branches exist because a burn nulls the payload in place;
  -- an *unburned* row must still carry a complete, usable payload, so a
  -- half-written encrypted paste cannot be stored.
  constraint pastes_payload_shape check (
    (
      is_encrypted = false
      and encrypted_content is null
      and encryption_iv is null
      and encryption_version is null
      and (burned_at is not null or content is not null)
    )
    or
    (
      is_encrypted = true
      and content is null
      and encryption_version is not null
      and (
        burned_at is not null
        or (
          encrypted_content is not null
          and encryption_iv is not null
        )
      )
    )
  ),
  -- Version 1 keeps browser encryption and server passwords mutually exclusive.
  constraint pastes_encryption_excludes_password check (
    is_encrypted = false or password_hash is null
  ),
  constraint pastes_content_size_nonnegative check (content_size >= 0),
  -- Only a burn-after-reading paste can ever be in a burned state.
  constraint pastes_burn_state check (burned_at is null or burn_after_read = true)
);

-- Slug lookup is the hot path for every read; the UNIQUE constraint on `slug`
-- already provides the index (named pastes_slug_key), so none is created here.
-- Partial index: the cleanup job only ever scans rows that can actually expire.
create index if not exists pastes_expires_at_idx
  on public.pastes (expires_at)
  where expires_at is not null;

------------------------------------------------------------------------------
-- Row Level Security and table privileges
--
-- Two independent layers, because either alone can be undone by a later change:
--
--   1. RLS is enabled with no policies, which denies every request made with
--      the anon or authenticated key.
--   2. Table privileges are revoked outright, so even if someone later adds a
--      permissive policy, those roles still hold no SELECT/INSERT/UPDATE/DELETE.
--
-- The revoke targets PUBLIC as well as the named roles. Privileges granted to
-- PUBLIC are inherited by every role, so revoking from anon and authenticated
-- alone would leave access in place through PUBLIC.
--
-- The application reaches the table exclusively through server-side routes
-- using the service-role key, which both bypasses RLS and is granted explicitly
-- below. A leaked anon key cannot read a single paste.
------------------------------------------------------------------------------
alter table public.pastes enable row level security;
alter table public.pastes force row level security;

revoke all on table public.pastes from public, anon, authenticated;

grant select, insert, update, delete
  on table public.pastes
  to service_role;

------------------------------------------------------------------------------
-- Atomic burn-after-reading claim.
--
-- SELECT ... FOR UPDATE takes a row lock before anything is modified. A second
-- concurrent caller blocks on that lock; when the first transaction commits,
-- READ COMMITTED re-evaluates the WHERE clause against the updated row, which
-- now fails `burned_at is null`. So exactly one caller ever receives the
-- content, and everyone else gets an empty result.
--
-- Postgres cannot return OLD values from an UPDATE, so the payload is captured
-- into a local record first and the columns are wiped in the same transaction.
------------------------------------------------------------------------------
create or replace function public.consume_burn_paste(p_slug text)
returns table (
  content            text,
  encrypted_content  text,
  encryption_iv      text,
  encryption_version integer
)
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  claimed public.pastes%rowtype;
begin
  select *
    into claimed
    from public.pastes p
   where p.slug = p_slug
     and p.burn_after_read = true
     and p.burned_at is null
     and (p.expires_at is null or p.expires_at > now())
     for update;

  if not found then
    return;
  end if;

  update public.pastes p
     set burned_at         = now(),
         views             = p.views + 1,
         content           = null,
         encrypted_content = null,
         encryption_iv     = null,
         updated_at        = now()
   where p.id = claimed.id;

  return query
    select claimed.content,
           claimed.encrypted_content,
           claimed.encryption_iv,
           claimed.encryption_version;
end;
$$;

------------------------------------------------------------------------------
-- View counter. Best-effort and privacy-preserving: a single integer, with no
-- IP address, user agent or timestamp recorded anywhere.
--
-- The expiry and burn guards mirror the checks the application already makes.
-- They are not a data-leak defence — this function returns nothing — but they
-- keep the counter consistent if application code ever calls it out of order.
------------------------------------------------------------------------------
create or replace function public.increment_paste_views(p_slug text)
returns void
language sql
volatile
security invoker
set search_path = public
as $$
  update public.pastes
     set views = views + 1
   where slug = p_slug
     and burned_at is null
     and (expires_at is null or expires_at > now());
$$;

------------------------------------------------------------------------------
-- Optional housekeeping helper. Expiry is enforced in application code on every
-- read, so this only removes rows at rest — correctness never depends on it.
------------------------------------------------------------------------------
create or replace function public.delete_expired_pastes()
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.pastes
   where expires_at is not null
     and expires_at <= now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;

------------------------------------------------------------------------------
-- Function privileges
--
-- PostgreSQL grants EXECUTE on a new function to PUBLIC by default, and every
-- role inherits PUBLIC. Revoking only from anon and authenticated would
-- therefore leave them able to call these functions through PUBLIC — so the
-- revoke must name PUBLIC, and service_role must then be granted back
-- explicitly. Only the privileged TinyPaste server should reach these.
------------------------------------------------------------------------------
revoke execute on function public.consume_burn_paste(text)
  from public, anon, authenticated;

revoke execute on function public.increment_paste_views(text)
  from public, anon, authenticated;

revoke execute on function public.delete_expired_pastes()
  from public, anon, authenticated;

grant execute on function public.consume_burn_paste(text)
  to service_role;

grant execute on function public.increment_paste_views(text)
  to service_role;

grant execute on function public.delete_expired_pastes()
  to service_role;
