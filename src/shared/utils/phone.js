/**
 * Returns all possible variations of a phone number for flexible matching across
 * local formats (010...), international formats with plus (+2010...), and raw digits (2010...).
 *
 * @param {string} phone
 * @returns {string[]}
 */
export function getPhoneVariants(phone) {
  if (!phone || typeof phone !== "string") return [];
  const trimmed = phone.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");
  const variants = new Set([trimmed, digitsOnly, `+${digitsOnly}`]);

  // Egyptian numbers handling
  if (digitsOnly.startsWith("20") && digitsOnly.length === 12) {
    const local = "0" + digitsOnly.slice(2);
    variants.add(local);
    variants.add("+" + digitsOnly);
    variants.add(digitsOnly);
  } else if (digitsOnly.startsWith("01") && digitsOnly.length === 11) {
    const intl = "20" + digitsOnly.slice(1);
    variants.add(intl);
    variants.add("+" + intl);
    variants.add(digitsOnly);
  }

  return Array.from(variants).filter(Boolean);
}

/**
 * Normalizes phone number to international E.164 format (+2010...) or standard digits.
 *
 * @param {string} phone
 * @returns {string}
 */
export function normalizePhone(phone) {
  if (!phone || typeof phone !== "string") return "";
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("01") && trimmed.length === 11) {
    return `+2${trimmed}`;
  }
  if (trimmed.startsWith("20") && trimmed.length === 12) {
    return `+${trimmed}`;
  }
  return trimmed;
}

export default {
  getPhoneVariants,
  normalizePhone,
};
