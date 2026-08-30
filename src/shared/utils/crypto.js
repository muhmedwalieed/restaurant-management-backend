import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM

function deriveKey(rawKey) {
  const secret = rawKey || process.env.ENCRYPTION_KEY || "default_development_encryption_key_32bytes!!";
  if (typeof secret === "string" && /^[0-9a-fA-F]{64}$/.test(secret)) {
    return Buffer.from(secret, "hex");
  }
  return crypto.createHash("sha256").update(String(secret)).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM
 * @param {string} text - Plaintext to encrypt
 * @param {string} [customKey] - Optional custom encryption key
 * @returns {string|null} Encrypted string in format `iv:authTag:ciphertext` (hex)
 */
export function encrypt(text, customKey) {
  if (text === null || text === undefined || text === "") {
    return text;
  }

  const keyBuffer = deriveKey(customKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  let encrypted = cipher.update(String(text), "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string
 * @param {string} cipherText - Encrypted string in format `iv:authTag:ciphertext`
 * @param {string} [customKey] - Optional custom encryption key
 * @returns {string|null} Decrypted plaintext string
 */
export function decrypt(cipherText, customKey) {
  if (cipherText === null || cipherText === undefined || cipherText === "") {
    return cipherText;
  }

  if (typeof cipherText !== "string") {
    return cipherText;
  }

  const parts = cipherText.split(":");
  if (parts.length !== 3) {
    // If not in `iv:authTag:ciphertext` format, return as-is for backward compatibility
    return cipherText;
  }

  const [ivHex, authTagHex, encryptedHex] = parts;

  try {
    const keyBuffer = deriveKey(customKey);
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      keyBuffer,
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

export default {
  encrypt,
  decrypt,
};
