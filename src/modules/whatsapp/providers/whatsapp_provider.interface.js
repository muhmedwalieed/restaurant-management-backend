/**
 * Base abstract class defining WhatsApp Provider Interface.
 */
export class WhatsAppProviderInterface {
  /**
   * Verifies incoming webhook HMAC signature.
   * @param {string|Buffer} rawBody
   * @param {string} signature
   * @param {string} secret
   * @returns {boolean}
   */
  verifySignature(rawBody, signature, secret) {
    throw new Error("verifySignature must be implemented by Provider");
  }

  /**
   * Sends outgoing WhatsApp message.
   * @param {object} params - { to, text, type }
   * @returns {Promise<{ providerMessageId: string }>}
   */
  async sendMessage({ to, text, type = "TEXT" }) {
    throw new Error("sendMessage must be implemented by Provider");
  }

  /**
   * Handles GET webhook verification handshake (hub.mode, hub.verify_token, hub.challenge).
   * @param {object} query - { mode, token, challenge }
   * @param {string} expectedToken
   * @returns {string} challenge
   */
  handleVerification(query, expectedToken) {
    throw new Error("handleVerification must be implemented by Provider");
  }
}

export default WhatsAppProviderInterface;
