import { mockProvider } from "./mock_provider.js";
import { metaProvider } from "./meta_provider.js";
import env from "../../../config/env.js";

/**
 * Resolves appropriate WhatsAppProvider instance based on connection settings and environment.
 * @param {string} [providerType="META"]
 * @returns {import("./whatsapp_provider.interface.js").WhatsAppProviderInterface}
 */
export function getWhatsAppProvider(providerType = "META") {
  if (providerType === "MOCK" || env.NODE_ENV === "test" || env.NODE_ENV === "development") {
    return mockProvider;
  }
  return metaProvider;
}

export default getWhatsAppProvider;
