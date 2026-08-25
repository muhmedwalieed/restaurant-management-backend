import crypto from "node:crypto";
import { WhatsAppProviderInterface } from "./whatsapp_provider.interface.js";
import { ExternalServiceError, AuthorizationError } from "../../../shared/errors/index.js";

let simulateOutageGlobal = false;

export class MockProvider extends WhatsAppProviderInterface {

  static setSimulateOutage(flag) {
    simulateOutageGlobal = Boolean(flag);
  }

  verifySignature(rawBody, signature, secret) {
    if (!signature || !secret) {
      return false;
    }

    const payload = typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody || {});
    const cleanSignature = signature.startsWith("sha256=") ? signature.slice(7) : signature;

    const expectedHmac = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    try {
      return crypto.timingSafeEqual(
        Buffer.from(cleanSignature, "utf8"),
        Buffer.from(expectedHmac, "utf8")
      );
    } catch {
      return false;
    }
  }

  async sendMessage({ to, text, type = "TEXT" }) {
    if (simulateOutageGlobal) {
      throw new ExternalServiceError("WhatsApp provider service is currently unavailable (Mock Outage)");
    }

    const providerMessageId = `mock_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return { providerMessageId };
  }

  handleVerification(query, expectedToken) {
    const mode = query["hub.mode"] || query.mode;
    const token = query["hub.verify_token"] || query.verify_token || query.token;
    const challenge = query["hub.challenge"] || query.challenge;

    if (mode === "subscribe" && token === expectedToken) {
      return challenge;
    }

    throw new AuthorizationError("Verification token mismatch");
  }
}

export const mockProvider = new MockProvider();
export default mockProvider;
