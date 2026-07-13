import { Router } from 'express';
import { z } from 'zod';
import { PAYMENT_PROVIDERS, type PaymentProvider } from '@98plus/shared';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import {
  createPaymentIntent,
  PaymentServiceError,
} from '../services/payment.service';
import { getPaymentStatusForOwner } from '../services/payment-status.service';

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

const intentSchema = z.object({
  productCode: z.string().min(1).max(100),
  provider: z.enum(
    PAYMENT_PROVIDERS as unknown as [PaymentProvider, ...PaymentProvider[]],
  ),
  idempotencyKey: z.string().min(8).max(200),
});

// POST /payments/intents — create Payment + provider checkout (Stars invoice link).
paymentsRouter.post('/intents', async (req: AuthRequest, res) => {
  const parsed = intentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const result = await createPaymentIntent({
      userId: req.userId!,
      productCode: parsed.data.productCode,
      provider: parsed.data.provider,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof PaymentServiceError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[payments] intent failed', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /payments/:paymentId/status — owner-only post-checkout status.
paymentsRouter.get('/:paymentId/status', async (req: AuthRequest, res) => {
  const paymentId =
    typeof req.params.paymentId === 'string' ? req.params.paymentId.trim() : '';
  if (!paymentId) {
    res.status(400).json({ error: 'invalid paymentId' });
    return;
  }

  try {
    const status = await getPaymentStatusForOwner(paymentId, req.userId!);
    if (!status) {
      res.status(404).json({ error: 'Payment not found' });
      return;
    }
    res.json(status);
  } catch (err) {
    console.error('[payments] status failed', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
