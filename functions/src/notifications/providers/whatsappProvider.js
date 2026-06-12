export class WhatsAppProvider {
  async send(_notificationJob) {
    throw new Error('WhatsApp provider send() is not implemented.');
  }
}

export class DisabledWhatsAppProvider extends WhatsAppProvider {
  async send() {
    throw new Error(
      'WhatsApp sending is disabled. Configure Cloud API, Twilio, Green API, WATI, or 360dialog.',
    );
  }
}

export const createWhatsAppProvider = (providerName = 'disabled') => {
  if (providerName === 'disabled') return new DisabledWhatsAppProvider();
  throw new Error(`Unsupported WhatsApp provider: ${providerName}`);
};
