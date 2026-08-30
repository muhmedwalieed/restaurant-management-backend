import { mockProvider } from "./mock_provider.js";
import { metaProvider } from "./meta_provider.js";
import env from "../../../config/env.js";

export function getWhatsAppProvider(providerType = "META") {
  if (providerType === "MOCK") {
    return mockProvider;
  }
  return metaProvider;
}

export default getWhatsAppProvider;
