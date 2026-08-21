import whatsAppRepository from "./whatsapp.repository.js";
import getWhatsAppProvider from "./providers/provider_factory.js";
import { AuthenticationError, NotFoundError } from "../../shared/errors/index.js";

/**
 * Public Webhook Middleware verifying Meta WhatsApp HMAC Signature.
 */
export async function verifyWhatsAppSignature(req, res, next) {
  try {
    const signature = req.headers["x-hub-signature-256"] || req.headers["x-hub-signature"] || "";
    const payload = req.body || {};

    const entry = payload?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const providerPhoneNumberId = change?.metadata?.phone_number_id || payload?.providerPhoneNumberId;

    if (!providerPhoneNumberId) {
      throw new NotFoundError("Target WhatsApp phone_number_id missing from webhook payload");
    }

    const connection = await whatsAppRepository.findConnectionByPhoneNumberId(providerPhoneNumberId);
    if (!connection || connection.status !== "ACTIVE") {
      throw new NotFoundError("No active WhatsApp connection for target phone_number_id");
    }

    const provider = getWhatsAppProvider(connection.provider);
    const secret = connection.webhookSecret || process.env.WHATSAPP_WEBHOOK_SECRET || "default_mock_secret";

    const rawBody = req.rawBody || JSON.stringify(payload);
    const isValid = provider.verifySignature(rawBody, signature, secret);

    if (!isValid) {
      throw new AuthenticationError("Invalid WhatsApp webhook signature");
    }

    req.whatsappConnection = connection;
    req.tenantContext = { restaurantId: connection.restaurantId };
    next();
  } catch (error) {
    next(error);
  }
}

export default verifyWhatsAppSignature;
