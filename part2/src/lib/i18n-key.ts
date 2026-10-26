/** Dictionary key for a piece of English text: FNV-1a 32-bit hash in base 36. Shared by the app and
 *  scripts/i18n-extract.ts so both always agree. */
export function keyOf(en: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < en.length; i++) {
    h ^= en.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
