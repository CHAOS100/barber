# Notification jobs

`notificationJobs` is the durable Firestore queue for OST BARBER business notifications.

## Active production channel

- `channel: "push"` is the only active business-notification delivery channel.
- Push jobs must include a stable `customerId`, a type, title/body, status, and `scheduledFor`.
- Job IDs are deterministic for appointment reminders and release batches so retries do not create duplicate delivery jobs.
- The processor verifies token ownership against the target Firebase Auth UID before sending.
- Successful, skipped, and failed attempts are written back to the same Firestore job.

## WhatsApp and SMS

- Legacy WhatsApp job builders remain only for compatibility with old stored job shapes and tests.
- `LEGACY_WHATSAPP_JOBS_ENABLED` is `false`; production triggers do not enqueue them.
- The WhatsApp provider is deliberately disabled and throws if called. No code reports a WhatsApp message as sent.
- SMS is reserved for Firebase Phone Auth OTP. There is no business-reminder SMS sender.

## Adding a real WhatsApp provider later

1. Select and approve a provider and privacy/data-retention terms.
2. Add secrets through Firebase/Google Secret Manager, never client environment variables.
3. Implement a provider adapter that returns the provider message ID and a classified retry result.
4. Add consent/preferences and an approved message-template mapping per notification type.
5. Add idempotency using the existing deterministic job document ID.
6. Test with the Firebase emulator and a provider sandbox.
7. Enable the channel only after explicit deployment approval.

No provider configuration, Function deployment, rules deployment, or external message sending is performed by the local implementation.
