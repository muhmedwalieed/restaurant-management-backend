/**
 * Feedback rating parser for customer WhatsApp messages.
 * Handles Arabic digits, English digits, star emojis, star ratings,
 * and text-based sentiments (ممتاز, جيد جدا, مقبول, سيء, سيء جدا).
 */

const ARABIC_DIGITS = { "١": 1, "٢": 2, "٣": 3, "٤": 4, "٥": 5 };

/**
 * Parses rating number (1-5) from customer message text.
 * @param {string} content
 * @returns {number|null}
 */
export function parseFeedbackRating(content) {
  if (!content) return null;
  const trimmed = content.trim();
  const normalized = trimmed.toLowerCase();

  // 1-5 ASCII
  if (/^[1-5]$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  // 1-5 Arabic digits
  if (/^[١-٥]$/.test(trimmed)) {
    return ARABIC_DIGITS[trimmed];
  }

  // Regex patterns: "5/5", "5 نجوم", "5 stars", "5 من 5"
  const digitMatch = trimmed.match(/^([1-5])\s*(\/5|نجوم|نجمات|نجمة|stars?|من\s*5)?$/i);
  if (digitMatch) {
    return parseInt(digitMatch[1], 10);
  }

  const arabicDigitMatch = trimmed.match(/^([١-٥])\s*(\/٥|نجوم|نجمات|نجمة|من\s*٥)?$/);
  if (arabicDigitMatch) {
    return ARABIC_DIGITS[arabicDigitMatch[1]];
  }

  // Customer star rating symbols
  const starCount = (trimmed.match(/⭐/g) || []).length;
  if (starCount >= 1 && starCount <= 5 && trimmed.replace(/⭐/g, "").trim() === "") {
    return starCount;
  }

  // Text sentiments
  if (normalized === "ممتاز" || normalized === "ممتاز جدا" || normalized === "ممتاز جداً") {
    return 5;
  }
  if (normalized === "جيد جدا" || normalized === "جيد جداً") {
    return 4;
  }
  if (normalized === "مقبول" || normalized === "جيد") {
    return 3;
  }
  if (normalized === "سيء" || normalized === "سيئ") {
    return 2;
  }
  if (normalized === "سيء جدا" || normalized === "سيء جداً" || normalized === "سيئ جدا") {
    return 1;
  }

  return null;
}

/**
 * Checks whether the incoming message is an explicit feedback rating attempt.
 * @param {string} content
 * @returns {boolean}
 */
export function isExplicitFeedbackText(content) {
  if (!content) return false;
  const trimmed = content.trim();
  const normalized = trimmed.toLowerCase();

  if (/^⭐{1,5}$/.test(trimmed)) return true;
  if (/^([1-5]|[١-٥])\s*(نجوم|نجمات|نجمة|stars?|\/5|\/٥|من\s*5|من\s*٥)/i.test(trimmed)) return true;
  if (normalized === "ممتاز" || normalized === "ممتاز جدا" || normalized === "ممتاز جداً") return true;
  if (normalized === "جيد جدا" || normalized === "جيد جداً") return true;
  if (normalized === "مقبول") return true;
  if (normalized === "سيء" || normalized === "سيئ" || normalized === "سيء جدا" || normalized === "سيء جداً" || normalized === "سيئ جدا") return true;

  return false;
}

export default {
  parseFeedbackRating,
  isExplicitFeedbackText,
};
