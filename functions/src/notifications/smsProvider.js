const normalizeProvider = (value) => String(value || 'none').trim().toLowerCase();

const readConfig = () => ({
  provider: normalizeProvider(process.env.SMS_PROVIDER),
  twilioAccountSid: String(process.env.TWILIO_ACCOUNT_SID || '').trim(),
  twilioAuthToken: String(process.env.TWILIO_AUTH_TOKEN || '').trim(),
  twilioFromNumber: String(process.env.TWILIO_FROM_NUMBER || '').trim(),
});

export const getSmsProviderStatus = () => {
  const config = readConfig();
  const twilioConfigured = Boolean(
    config.twilioAccountSid
    && config.twilioAuthToken
    && config.twilioFromNumber,
  );

  return {
    provider: config.provider,
    configured: config.provider === 'twilio' && twilioConfigured,
    missing: config.provider === 'twilio' && !twilioConfigured
      ? ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER']
        .filter((key) => !String(process.env[key] || '').trim())
      : [],
  };
};

const sendViaTwilio = async ({ to, body }) => {
  const config = readConfig();
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`;
  const form = new URLSearchParams({
    To: to,
    From: config.twilioFromNumber,
    Body: body,
  });
  const authorization = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authorization}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      sent: false,
      provider: 'twilio',
      providerConfigured: true,
      error: payload?.message || `Twilio request failed with HTTP ${response.status}`,
    };
  }

  return {
    sent: true,
    provider: 'twilio',
    providerConfigured: true,
    providerMessageId: payload.sid || null,
  };
};

export const sendSmsNotificationJob = async (notificationJobData) => {
  const status = getSmsProviderStatus();
  if (!status.configured) {
    return {
      sent: false,
      provider: status.provider,
      providerConfigured: false,
      reason: 'SMS provider is not configured.',
      missing: status.missing,
    };
  }

  if (status.provider === 'twilio') {
    return sendViaTwilio({
      to: notificationJobData.phone,
      body: notificationJobData.message,
    });
  }

  return {
    sent: false,
    provider: status.provider,
    providerConfigured: false,
    reason: 'SMS provider is not supported by this deployment.',
  };
};
