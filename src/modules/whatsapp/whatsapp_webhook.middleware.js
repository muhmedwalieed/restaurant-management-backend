import whatsAppRepository from "./whatsapp.repository.js";
import getWhatsAppProvider from "./providers/provider_factory.js";
import { decrypt } from "../../shared/utils/crypto.js";
import { AuthenticationError, ExternalServiceError, NotFoundError } from "../../shared/errors/index.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export const verifyWhatsAppSignature = asyncHandler(async (req, res, next) => {
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
  const secret = connection.webhookSecret ? decrypt(connection.webhookSecret) : null;

  if (!secret) {
    throw new AuthenticationError("WhatsApp webhook secret is not configured for this connection");
  }

  const rawBody = req.rawBody || JSON.stringify(payload);
  const isValid = provider.verifySignature(rawBody, signature, secret);

  if (!isValid) {
    throw new AuthenticationError("Invalid WhatsApp webhook signature");
  }

  req.whatsappConnection = connection;
  req.tenantContext = { restaurantId: connection.restaurantId };
  next();
});

export default verifyWhatsAppSignature;
