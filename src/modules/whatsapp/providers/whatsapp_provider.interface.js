
export class WhatsAppProviderInterface {

  verifySignature(rawBody, signature, secret) {
    throw new Error("verifySignature must be implemented by Provider");
  }

  async sendMessage({ to, text, type = "TEXT" }) {
    throw new Error("sendMessage must be implemented by Provider");
  }

  handleVerification(query, expectedToken) {
    throw new Error("handleVerification must be implemented by Provider");
  }
}

export default WhatsAppProviderInterface;
