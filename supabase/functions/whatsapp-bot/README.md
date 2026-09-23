# whatsapp-bot

Supabase Edge Function: the WhatsApp Cloud API webhook for the Koamas
sighting-report bot. Full setup, deploy, and design notes:
**[`docs/whatsapp-bot.md`](../../../docs/whatsapp-bot.md)** at the repo root.

Files:
- `index.ts` — webhook entrypoint (Meta verification handshake + inbound messages)
- `flow.ts` — the guided conversation state machine
- `whatsapp.ts` — WhatsApp Cloud API client (send/receive)
- `claude.ts` — free-text field extraction + photo species suggestions (advisory only)
- `drive.ts` — uploads submitted photos to the KOAMAS Drive folder
- `hash.ts` — salts/hashes the sender's number; the raw number is never stored

Deploy: `supabase functions deploy whatsapp-bot --no-verify-jwt`
