import { Router } from 'express';
import type { ProductType } from '@98plus/shared';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { listActiveProducts } from '../services/product.service';

export const productsRouter = Router();
productsRouter.use(requireAuth);

// GET /products?type=premium — active products + their active provider prices.
productsRouter.get('/', async (req: AuthRequest, res) => {
  const raw =
    typeof req.query.type === 'string'
      ? req.query.type.trim().toLowerCase()
      : undefined;

  let type: ProductType | undefined;
  let entitlementType: 'PREMIUM' | undefined;
  if (raw) {
    if (raw === 'premium' || raw === 'premium_access') {
      type = 'SUBSCRIPTION';
      entitlementType = 'PREMIUM';
    } else if (raw === 'one_time') {
      type = 'CONSUMABLE';
    } else if (raw === 'subscription') {
      type = 'SUBSCRIPTION';
    } else if (raw === 'consumable') {
      type = 'CONSUMABLE';
    } else if (raw === 'non_consumable') {
      type = 'NON_CONSUMABLE';
    } else {
      res.status(400).json({ error: 'invalid type' });
      return;
    }
  }

  const products = await listActiveProducts({ type, entitlementType });
  res.json({ products });
});
