import type { ProductDTO, ProductProviderPriceDTO } from '@98plus/shared';

/** Human price for a provider price row. Stars use ★, RUB ₽, etc. */
export function formatProviderPrice(price: ProductProviderPriceDTO): string {
  const { amount, currency } = price;
  switch (currency) {
    case 'XTR':
      return `${amount} ★`;
    case 'RUB':
      return `${amount} ₽`;
    case 'USD':
      return `$${amount}`;
    case 'EUR':
      return `€${amount}`;
    default:
      return `${amount} ${currency}`;
  }
}

/**
 * "примерно … в месяц" — only returned when the computation is meaningful
 * (multi-month product with a known duration). Otherwise null (no fake math).
 */
export function formatMonthlyEstimate(
  product: ProductDTO,
  price: ProductProviderPriceDTO,
): string | null {
  const days = product.entitlementDurationDays;
  if (!days || days < 45) return null;
  const months = Math.round(days / 30);
  if (months < 2) return null;
  const perMonth = Math.round(price.amount / months);
  if (!Number.isFinite(perMonth) || perMonth <= 0) return null;
  return `примерно ${formatProviderPrice({ ...price, amount: perMonth })} в месяц`;
}

/** Preferred provider price for the current context (Stars in Telegram). */
export function pickPreferredPrice(
  product: ProductDTO,
  preferred: string,
): ProductProviderPriceDTO | null {
  const active = product.prices.filter((p) => p.isActive);
  return (
    active.find((p) => p.provider === preferred) ?? active[0] ?? null
  );
}
