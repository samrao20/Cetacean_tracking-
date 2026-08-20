-- One-time schema change to support scripts/import_sightings.py.
--
-- PostgREST (the anon/service-role REST API the site and importer use) does
-- not expose DDL, so this has to be run once by hand: Supabase dashboard ->
-- SQL Editor -> paste -> Run. See docs/data-pipeline.md.
--
-- Safe to re-run: every statement is guarded so this migration is idempotent.

alter table sightings
  add column if not exists source text not null default 'whatsapp',
  add column if not exists source_key text,
  add column if not exists observer text;

-- One row per (source, source_key) — lets the importer upsert on conflict
-- and reconcile (delete rows whose source_key disappeared from the sheet)
-- without ever touching rows from another source (e.g. the WhatsApp bot).
-- Deliberately NOT a partial index (no "where source_key is not null"):
-- Postgres already allows unlimited rows with source_key = NULL under a
-- plain unique index (NULL never equals NULL for uniqueness purposes), and
-- PostgREST's on_conflict upsert can only target a *plain* unique index —
-- it has no way to pass the matching WHERE predicate a partial index would
-- require. Drop+recreate rather than "if not exists" so re-running this
-- migration also repairs a database that already has the old partial
-- version of this index under the same name.
drop index if exists sightings_source_key_uidx;
create unique index sightings_source_key_uidx
  on sightings (source, source_key);

-- species.slug must be unique for the importer's upsert-by-slug to work.
create unique index if not exists species_slug_uidx
  on species (slug);

comment on column sightings.source is
  'Where this row came from: ''whatsapp'' (submitted through the bot, the default) or ''excel'' (synced from the Drive sightings sheet by scripts/import_sightings.py).';
comment on column sightings.source_key is
  'Stable content hash used by the Excel importer to upsert/reconcile. Null for WhatsApp-submitted rows.';
comment on column sightings.observer is
  'Free-text observer name/initials. Populated for Excel-sourced rows; WhatsApp-sourced rows may leave this null per the submitter-privacy rule (submitter_phone_hash is never rendered, see CLAUDE.md).';
