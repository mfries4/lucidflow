const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Identifiant court, unique à l'échelle d'un document. */
export function uid(prefix = ''): string {
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return prefix ? `${prefix}_${out}` : out;
}
