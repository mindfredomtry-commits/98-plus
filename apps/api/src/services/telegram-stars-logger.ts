type StarsLogFields = {
  paymentId?: string;
  internalUserId?: string;
  telegramUserId?: number | string;
  productCode?: string;
  amount?: number;
  currency?: string;
  updateId?: number;
  status?: string;
  /** Invoice host after canonization — never a full URL/slug. */
  canonicalHost?: string;
  rawHost?: string | null;
  protocol?: string | null;
  hasInvoiceSlug?: boolean;
};

function emit(event: string, fields: StarsLogFields): void {
  console.log(`[telegram-stars] ${event}`, fields);
}

export const telegramStarsLog = {
  intentCreated: (f: StarsLogFields) =>
    emit('TELEGRAM_STARS_INTENT_CREATED', f),
  invoiceCreated: (f: StarsLogFields) =>
    emit('TELEGRAM_STARS_INVOICE_CREATED', f),
  invoiceOpenFailed: (f: StarsLogFields) =>
    emit('TELEGRAM_STARS_INVOICE_OPEN_FAILED', f),
  preCheckoutReceived: (f: StarsLogFields) =>
    emit('TELEGRAM_STARS_PRECHECKOUT_RECEIVED', f),
  preCheckoutApproved: (f: StarsLogFields) =>
    emit('TELEGRAM_STARS_PRECHECKOUT_APPROVED', f),
  preCheckoutRejected: (f: StarsLogFields) =>
    emit('TELEGRAM_STARS_PRECHECKOUT_REJECTED', f),
  successfulPaymentReceived: (f: StarsLogFields) =>
    emit('TELEGRAM_STARS_SUCCESSFUL_PAYMENT_RECEIVED', f),
  paymentConfirmed: (f: StarsLogFields) =>
    emit('TELEGRAM_STARS_PAYMENT_CONFIRMED', f),
  paymentIdempotent: (f: StarsLogFields) =>
    emit('TELEGRAM_STARS_PAYMENT_IDEMPOTENT', f),
};
