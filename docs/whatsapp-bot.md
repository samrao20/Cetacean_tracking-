# WhatsApp sighting-report bot

A 24/7 guided WhatsApp conversation on the live bot number (`+960 7257743`)
that collects a sighting (species, location, date, pod size, photos), and
stages it for `scripts/import_sightings.py` to append into
`Koamas ID and Sightings Data Sheet.xlsx` — the same workbook the [Excel
pipeline](data-pipeline.md) already syncs every 3 hours. From there it goes
through the exact same validation, colour-flagging and publish path as a
row typed by hand, plus one extra step: a new **Blue** highlight means
"submitted via WhatsApp — a human hasn't checked it yet."

## Why the bot never touches Excel/Drive directly

`scripts/import_sightings.py` downloads the whole workbook, repaints every
row's highlight, and **re-uploads the whole file** each run. If the bot
also wrote into that file, the two would race and a run could silently
drop whichever write lost. So there is exactly one writer to the workbook:
the importer. The bot only ever writes to two Supabase staging tables
(`bot_conversations`, `bot_submissions` — see
`supabase/migration_add_bot_submissions.sql`), and the importer appends any
pending `bot_submissions` rows into the current year's sheet at the start
of every run, before its normal parse/validate/highlight pass.

## Pipeline

```
WhatsApp user
  → Meta WhatsApp Cloud API
  → Supabase Edge Function  supabase/functions/whatsapp-bot/
      (guided conversation; Claude fills in fields from free text/photos)
      ├─ bot_conversations   (where each chat is mid-flow)
      ├─ bot_submissions     (a completed report, staged)
      └─ Drive "KOAMAS/WhatsApp photos/" (uploaded photos)
  ↓  (every 3h, GitHub Action, existing)
scripts/import_sightings.py
  1. fetch pending bot_submissions
  2. append each as a new row in "Koamas Atoll Sightings <year>",
     Source = "WhatsApp", Photos = Drive links
  3. normal parse/validate: bad coords/species/date → Red/Yellow/Orange/Purple,
     same as any row
  4. otherwise-clean WhatsApp rows → Blue, until Verified = Yes
  5. publish (Supabase + data/sightings.json), same as always
  6. push the highlighted workbook back to Drive
  7. mark those bot_submissions rows imported_at (only after step 6 succeeds,
     so a failed run retries them next time instead of losing them)
```

A WhatsApp row publishes the same way any sheet row does: set **Verified**
to **Yes**. The Blue highlight clears on the next sync, exactly like fixing
a Red/Yellow/Purple row does now.

## Setting up the WhatsApp number

The live number (`+960 7257743`) is already on the WhatsApp Business app.
To let an Edge Function reply automatically, it needs to move onto the
**Meta WhatsApp Cloud API**, under a Meta Business account for Koamas:

1. Create/verify a Meta Business account, add the WhatsApp product.
2. Register `+960 7257743` as a Cloud API number. Use **coexistence**
   ("Business app coexistence" in the Meta docs) so it stays usable in the
   WhatsApp Business app too, for anyone who wants to reply by hand.
3. Business verification can take a few days — start this early, and build
   against Meta's free test number in the meantime (nothing else changes;
   the site's `wa.me` links already point at the real number).
4. In the Meta App dashboard, set the webhook URL to the deployed function
   (`https://<project>.functions.supabase.co/whatsapp-bot`) and the verify
   token to `WA_VERIFY_TOKEN` (below). Subscribe to the `messages` field.

If Meta verification stalls, Twilio's WhatsApp sender is a paid fallback —
only `supabase/functions/whatsapp-bot/whatsapp.ts` would need to change.

## Supabase setup

1. Run `supabase/migration_add_bot_submissions.sql` once (Dashboard → SQL
   Editor → paste → Run). Adds `bot_conversations` / `bot_submissions`,
   both service-role-only (RLS enabled, no policies).
2. Deploy the function:
   ```bash
   supabase functions deploy whatsapp-bot --no-verify-jwt
   ```
   (`--no-verify-jwt` because Meta calls the webhook anonymously; the
   function checks Meta's own `X-Hub-Signature-256` header instead.)
3. Set secrets:
   ```bash
   supabase secrets set \
     WA_VERIFY_TOKEN=... \
     WA_APP_SECRET=... \
     WA_ACCESS_TOKEN=... \
     WA_PHONE_NUMBER_ID=... \
     PHONE_HASH_SALT=$(openssl rand -hex 32) \
     ANTHROPIC_API_KEY=... \
     GDRIVE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)" \
     GDRIVE_BOT_FOLDER_ID=...
   ```
   `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically
   for Edge Functions in the same project — no need to set them by hand.
   `ANTHROPIC_API_KEY` and the two `GDRIVE_*` secrets are optional: without
   them the bot still runs the guided button flow, it just skips free-text
   pre-fill / photo species suggestions, or skips photo uploads.

## Drive photo storage

`scripts/import_sightings.py` already uses a Google **service account** to
read/write the Excel workbook. A plain service account has **no storage
quota of its own** — it can edit a file it's been given access to, but it
can't own new files in someone's personal "My Drive". So the bot's photo
folder (`GDRIVE_BOT_FOLDER_ID`) must be either:

- a folder inside a **Shared Drive** (needs Google Workspace), with the
  service account added as a member, or
- a folder owned by a real Koamas Google account, shared with the service
  account as **Editor** (works on a free/personal Google account, but the
  storage counts against that person's quota, not the service account's).

Either way, share the target folder with the service account's email (the
same one already used for `GDRIVE_SERVICE_ACCOUNT_JSON`) as **Editor**.

## Privacy

The sender's WhatsApp number is **never stored**. `hash.ts` salts and
SHA-256-hashes it into `phone_hash` before anything touches the database —
the same rule `CLAUDE.md` already applies to `submitter_phone_hash` on the
public site. `phone_hash` only tracks a conversation's own state and is
never rendered anywhere.

## Claude's role — always advisory

Claude does two things, and neither is ever published as fact:

- **Free-text pre-fill**: "saw ~20 spinners off Maafushi this morning" +
  photo skips straight to whatever fields it can't read (still confirmed
  by the user before it's saved).
- **Photo species suggestion**: stored in `bot_submissions.ai_suggestions`
  for a reviewer to see, never written as the actual species — the sheet's
  Species column is always the reviewer/recorder's own choice, same as the
  "ambiguous species are flagged, never guessed" rule in `docs/data-pipeline.md`.

## Local testing (no live Meta/Supabase credentials needed)

```bash
python3 scripts/import_sightings.py --dry-run \
  --xlsx /path/to/a/copy/of/Koamas.xlsx \
  --bot-submissions-json test-submissions.json \
  --highlighted-out /tmp/preview.xlsx
```

`test-submissions.json` is a JSON array shaped like `bot_submissions` rows
(`id`, `species_label`, `lat`, `lng`, `atoll`, `sighting_date`
`"YYYY-MM-DD"`, `sighting_time` `"HH:MM"`, `pod_size`, `notes`,
`photo_links`). This appends them into the sheet, runs the normal
validation, and writes a highlighted copy locally — no Drive/Supabase
writes happen in `--dry-run`. Open `/tmp/preview.xlsx` to check the new
rows landed in the right columns and the Blue highlight is on the ones
still needing review.
