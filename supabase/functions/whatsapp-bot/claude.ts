// Claude does two jobs here, both advisory: (1) pull sighting fields out of
// a free-text message so the guided flow can skip steps the user already
// answered, and (2) suggest a species from a photo. Neither result is ever
// written as the final species/coords/etc — it only pre-fills the draft,
// which the user still confirms, and a human still reviews the row (blue
// highlight) before it publishes. See docs/whatsapp-bot.md.

const SPECIES_LABELS = [
  "Spinner", "Bottlenose", "Risso", "Pilot", "Orca", "Cuviers",
  "Unkown Dolphin", "Unkown Whale",
]; // must match the sheet's dropdown / data/species-aliases.json exactly

export type ExtractedFields = {
  species_label?: string;
  atoll?: string;
  pod_size?: string;
  notes?: string;
  date_hint?: string; // free text like "yesterday morning" — the flow still confirms an actual date
};

const EXTRACT_SYSTEM_PROMPT = `You read a WhatsApp message reporting a dolphin/whale sighting in the Maldives and extract structured fields. Only fill a field if the message states it; leave it out otherwise — never guess. species_label must be exactly one of: ${SPECIES_LABELS.join(", ")} (use "Unkown Dolphin"/"Unkown Whale" only if the message says the type but not which species). Respond with ONLY a JSON object with any of these keys: species_label, atoll, pod_size, notes, date_hint. No prose.`;

export async function extractFields(apiKey: string, message: string): Promise<ExtractedFields> {
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: EXTRACT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: message }],
      }),
    });
    if (!resp.ok) {
      console.error("Claude extract failed", resp.status, await resp.text());
      return {};
    }
    const data = await resp.json();
    const text = data.content?.[0]?.text ?? "{}";
    return JSON.parse(text);
  } catch (err) {
    console.error("Claude extract error", err);
    return {}; // never block the flow on an AI failure — worst case we just ask the question
  }
}

export type SpeciesSuggestion = { species_label: string; confidence: "low" | "medium" | "high"; reason: string } | null;

const PHOTO_SYSTEM_PROMPT = `You look at a photo of a cetacean sighting in the Maldives and suggest which dropdown label it most likely is: ${SPECIES_LABELS.join(", ")}. This is only a suggestion for a human reviewer — never state it as fact. Respond with ONLY a JSON object: {"species_label": "...", "confidence": "low"|"medium"|"high", "reason": "one short sentence"}. If you can't tell, respond {"species_label": null, "confidence": "low", "reason": "..."}.`;

export async function suggestSpeciesFromPhoto(
  apiKey: string,
  imageBytes: Uint8Array,
  mimeType: string,
): Promise<SpeciesSuggestion> {
  try {
    const base64 = btoa(String.fromCharCode(...imageBytes));
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-5-5",
        max_tokens: 200,
        system: PHOTO_SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
            { type: "text", text: "What species is this?" },
          ],
        }],
      }),
    });
    if (!resp.ok) {
      console.error("Claude photo suggestion failed", resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    const text = data.content?.[0]?.text ?? "null";
    const parsed = JSON.parse(text);
    return parsed?.species_label ? parsed : null;
  } catch (err) {
    console.error("Claude photo suggestion error", err);
    return null;
  }
}
