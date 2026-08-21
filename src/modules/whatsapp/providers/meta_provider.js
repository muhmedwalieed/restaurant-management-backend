import crypto from "node:crypto";
import { WhatsAppProviderInterface } from "./whatsapp_provider.interface.js";
import { ExternalServiceError, AuthorizationError } from "../../../shared/errors/index.js";
import env from "../../../config/env.js";

export class MetaProvider extends WhatsAppProviderInterface {
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
    const apiToken = process.env.WHATSAPP_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!apiToken || !phoneNumberId) {
      throw new ExternalServiceError("WhatsApp Cloud API credentials not configured in environment");
    }

    try {
      const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: false, body: text },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ExternalServiceError(`Meta Cloud API Error: ${errorData?.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const providerMessageId = data?.messages?.[0]?.id || `wamid_${Date.now()}`;
      return { providerMessageId };
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError(`Failed to communicate with Meta Cloud API: ${error.message}`);
    }
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

export const metaProvider = new MetaProvider();
export default metaProvider;
