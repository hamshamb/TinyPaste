-- TinyPaste — content types (code / plaintext / document).
--
-- Adds the column the richer editor needs to tell a Monaco-authored paste
-- apart from a Tiptap document, without touching 0001_init.sql or anything it
-- already guarantees. Run after 0001, with `supabase db push` or the SQL
-- editor — see docs/SUPABASE_SETUP.md.
--
-- Backward compatible by construction:
--   * The column is added with a default, so the ALTER never fails on an
--     existing table with rows already in it.
--   * Every existing row is then backfilled from its `language`, which is the
--     only signal the old plaintext-only editor ever recorded — a paste whose
--     language was literally "plaintext" becomes a plaintext paste, and every
--     other existing row (actual code, or a language nobody bothered to set)
--     becomes a code paste. Both are already exactly what the application did
--     with them before this migration existed, so no existing paste changes
--     behaviour.
--   * `content` and `encrypted_content` are untouched — a document paste's
--     serialized JSON lives in the same columns a code paste's source always
--     has, distinguished only by this new column. There is no new payload
--     column, so the pastes_payload_shape constraint from 0001 keeps applying
--     unchanged to every row regardless of content type.

alter table public.pastes
  add column if not exists content_type text not null default 'code';

update public.pastes
   set content_type = 'plaintext'
 where content_type = 'code'
   and language = 'plaintext';

alter table public.pastes
  add constraint pastes_content_type_shape
  check (content_type in ('code', 'plaintext', 'document'));

------------------------------------------------------------------------------
-- Defence in depth for document pastes.
--
-- The application is the authority on the document schema (node types, mark
-- types, link scheme, colour values — see lib/document/schema.ts): this check
-- only asks Postgres to confirm `content` is syntactically valid JSON, not
-- that it matches that schema. It costs nothing for the code/plaintext rows
-- that make up the rest of the table (short-circuited by content_type), and
-- for a document row it means a hand-crafted INSERT that bypasses the
-- application entirely still cannot leave behind a content_type='document'
-- row whose content cannot even be parsed.
--
-- Both `is_encrypted` branches are exempted deliberately: an encrypted
-- document's `content` column is null (its payload lives in
-- encrypted_content, as ciphertext, which by definition cannot be validated
-- as JSON here or anywhere else on the server), and a burned document has had
-- its content wiped to null already. pastes_payload_shape from 0001 continues
-- to be the constraint responsible for which of those columns must be null.
------------------------------------------------------------------------------
alter table public.pastes
  add constraint pastes_document_content_is_json
  check (
    content_type <> 'document'
    or is_encrypted
    or content is null
    or content::json is not null
  );
