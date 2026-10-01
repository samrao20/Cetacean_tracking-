-- Adds the staging tables the WhatsApp bot writes to and
-- scripts/import_sightings.py reads from. Run once by hand: Supabase
-- dashboard -> SQL Editor -> paste -> Run. See docs/whatsapp-bot.md.
--
-- Safe to re-run: every statement is guarded so this migration is
-- idempotent.

-- One row per in-progress WhatsApp conversation. The bot reads/writes this
-- on every inbound message to know what it's asked for so far.
create table if not exists bot_conversations (
  phone_hash text primary key,
  state text not null default 'menu',
  draft jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table bot_conversations is
  'One row per WhatsApp number mid-conversation with the sighting-report bot. phone_hash is a salted hash of the sender''s number — the raw number is never stored, per the submitter_phone_hash privacy rule in CLAUDE.md.';
comment on column bot_conversations.state is
  'Which step of the guided flow this chat is on (e.g. menu, awaiting_species, awaiting_location, awaiting_date, awaiting_podsize, awaiting_photos, confirming).';
comment on column bot_conversations.draft is
  'Partial sighting fields collected so far this conversation, same shape as a bot_submissions row.';

-- A completed report, staged here until scripts/import_sightings.py appends
-- it into the "Koamas Atoll Sightings <year>" sheet. NOT written to
-- directly by the site or read by anon — service-role only, same as the
-- rest of the Excel-import pipeline.
create table if not exists bot_submissions (
  id uuid primary key default gen_random_uuid(),
  phone_hash text not null,
  species_label text,             -- exact sheet dropdown label, e.g. "Spinner"
  lat double precision,
  lng double precision,
  atoll text,
  sighting_date date,
  sighting_time time,
  pod_size text,
  notes text,
  photo_links text[] not null default '{}',   -- Drive share links
  raw_messages jsonb not null default '[]'::jsonb,  -- transcript, for debugging/audit
  ai_suggestions jsonb,            -- e.g. {"species_guess": "spinner-dolphin", "confidence": 0.8} — never published as-is
  imported_at timestamptz,         -- set by import_sightings.py once appended to the sheet
  created_at timestamptz not null default now()
);

comment on table bot_submissions is
  'Completed WhatsApp sighting reports, staged for scripts/import_sightings.py to append into the Excel sheet. The importer is the only writer to the sheet (it re-uploads the whole workbook each run) — the bot must never write to Excel/Drive directly, or the two would race and drop rows. See docs/whatsapp-bot.md.';
comment on column bot_submissions.phone_hash is
  'Salted hash of the sender''s WhatsApp number. Never rendered on the site, same rule as sightings.submitter_phone_hash.';
comment on column bot_submissions.ai_suggestions is
  'Claude''s best-effort read of free-text/photo submissions (e.g. a species guess). Advisory only — a human reviewer confirms the actual value before the row leaves the "needs review" highlight.';
comment on column bot_submissions.imported_at is
  'Set once this row has been appended into the Excel sheet, so a re-run never appends it twice. Null means "not yet imported".';

create index if not exists bot_submissions_pending_idx
  on bot_submissions (created_at)
  where imported_at is null;

alter table bot_conversations enable row level security;
alter table bot_submissions enable row level security;
-- No policies are created: with RLS enabled and no policy, only the
-- service role (which bypasses RLS) can read or write these tables. The
-- anon key used by the public site has no access, by design.
