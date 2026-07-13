import { Router } from 'express';
import type { PaymentClientContext } from '@98plus/shared';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { listPaymentProviderOptions } from '../services/payment-provider-registry';

export const paymentProvidersRouter = Router();
paymentProvidersRouter.use(requireAuth);

// GET /payment-providers?context=telegram|web — context-aware available methods.
paymentProvidersRouter.get('/', (req: AuthRequest, res) => {
  const context: PaymentClientContext =
    req.query.context === 'web' ? 'web' : 'telegram';
  const providers = listPaymentProviderOptions(context);
  res.json({ providers, context });
});
