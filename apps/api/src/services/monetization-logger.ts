type MonetizationLogFields = {
  paymentId?: string;
  eventId?: string;
  provider?: string;
  productCode?: string;
  attempt?: number;
  status?: string;
};

function emit(event: string, fields: MonetizationLogFields): void {
  console.log(`[monetization] ${event}`, fields);
}

export const monetizationLog = {
  paymentConfirmStarted: (fields: MonetizationLogFields) =>
    emit('PAYMENT_CONFIRM_STARTED', fields),
  paymentConfirmIdempotent: (fields: MonetizationLogFields) =>
    emit('PAYMENT_CONFIRM_IDEMPOTENT', fields),
  paymentConfirmSucceeded: (fields: MonetizationLogFields) =>
    emit('PAYMENT_CONFIRM_SUCCEEDED', fields),
  eventClaimed: (fields: MonetizationLogFields) =>
    emit('MONETIZATION_EVENT_CLAIMED', fields),
  eventProcessed: (fields: MonetizationLogFields) =>
    emit('MONETIZATION_EVENT_PROCESSED', fields),
  eventRetry: (fields: MonetizationLogFields) =>
    emit('MONETIZATION_EVENT_RETRY', fields),
  entitlementGranted: (fields: MonetizationLogFields) =>
    emit('ENTITLEMENT_GRANTED_FROM_PAYMENT', fields),
};
