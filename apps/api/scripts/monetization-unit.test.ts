/**
 * Run: npm run test:monetization-unit -w @98plus/api
 */
import assert from 'node:assert/strict';
import { paymentConfirmedEventKey } from '../src/config/monetization-events';
import {
  ProviderConfirmationValidationError,
  validateProviderConfirmationAgainstPayment,
} from '../src/services/payment-provider-validation';

const payment = {
  amount: 299,
  currency: 'RUB',
  provider: 'SBP' as const,
  productId: 'prod_1',
};

assert.equal(
  paymentConfirmedEventKey('pay_abc'),
  'payment-confirmed:pay_abc',
);

assert.throws(
  () =>
    validateProviderConfirmationAgainstPayment(
      payment,
      'TELEGRAM_STARS',
    ),
  ProviderConfirmationValidationError,
);

assert.throws(
  () =>
    validateProviderConfirmationAgainstPayment(payment, 'SBP', {
      amount: 100,
      currency: 'RUB',
    }),
  ProviderConfirmationValidationError,
);

assert.throws(
  () =>
    validateProviderConfirmationAgainstPayment(payment, 'SBP', {
      amount: 299,
      currency: 'USD',
    }),
  ProviderConfirmationValidationError,
);

validateProviderConfirmationAgainstPayment(payment, 'SBP', {
  amount: 299,
  currency: 'RUB',
});

validateProviderConfirmationAgainstPayment(
  payment,
  'SBP',
  { amount: 299, currency: 'RUB' },
  { amount: 299, currency: 'RUB' },
);

assert.throws(
  () =>
    validateProviderConfirmationAgainstPayment(
      payment,
      'SBP',
      { amount: 299, currency: 'RUB' },
      { amount: 300, currency: 'RUB' },
    ),
  ProviderConfirmationValidationError,
);

console.log('[monetization-unit.test] validation checks passed');
