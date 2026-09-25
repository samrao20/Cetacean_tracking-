// Salted hash of a WhatsApp number. The raw number is never written to any
// table — only this hash, matching the submitter_phone_hash rule in
// CLAUDE.md ("submitter_phone_hash is never rendered on the public site").
// We go a step further here and never even store the raw number at rest.
export async function hashPhone(rawNumber: string, salt: string): Promise<string> {
  const enc = new TextEncoder().encode(salt + ":" + rawNumber.replace(/\D/g, ""));
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
