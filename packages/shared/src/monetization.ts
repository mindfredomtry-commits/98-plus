/**

 * 98+ monetization shared contracts.

 *

 * Universal Plan → Product → Payment → Entitlement model shared between API and web.

 * Enums are expressed as string-literal unions (project style) that intentionally

 * mirror the Prisma enums of the same name.

 */



export const PRODUCT_TYPES = [

  'SUBSCRIPTION',

  'CONSUMABLE',

  'NON_CONSUMABLE',

] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];



export const PAYMENT_PROVIDERS = [

  'TELEGRAM_STARS',

  'SBP',

  'CARD_RU',

  'CARD_INT',

] as const;

export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];



export const PAYMENT_STATUSES = [

  'CREATED',

  'PENDING',

  'SUCCEEDED',

  'FAILED',

  'CANCELLED',

  'REFUNDED',

  'EXPIRED',

] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];



export const ENTITLEMENT_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;

export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];



export const ENTITLEMENT_TYPES = [

  'PREMIUM',

  'AI_GENERATIONS',

  'FEATURE',

  'GIFT',

  'THEME',

] as const;

export type EntitlementType = (typeof ENTITLEMENT_TYPES)[number];



export const ENTITLEMENT_ORIGINS = [

  'PURCHASE',

  'PROMOCODE',

  'ADMIN',

  'GIFT',

] as const;

export type EntitlementOrigin = (typeof ENTITLEMENT_ORIGINS)[number];



export const COUPON_TYPES = ['PERCENT', 'FIXED_AMOUNT'] as const;

export type CouponType = (typeof COUPON_TYPES)[number];



/** Stable, system-level product codes. Never derive links from `title`. */

export const PREMIUM_PRODUCT_CODES = [

  'premium_1m',

  'premium_3m',

  'premium_6m',

  'premium_12m',

] as const;

export type PremiumProductCode = (typeof PREMIUM_PRODUCT_CODES)[number];



export function isPaymentProvider(value: unknown): value is PaymentProvider {

  return (

    typeof value === 'string' &&

    (PAYMENT_PROVIDERS as readonly string[]).includes(value)

  );

}



export function isProductType(value: unknown): value is ProductType {

  return (

    typeof value === 'string' &&

    (PRODUCT_TYPES as readonly string[]).includes(value)

  );

}



/** Provider price attached to a product — one product can be priced per provider. */

export interface ProductProviderPriceDTO {

  provider: PaymentProvider;

  /** Minor units are avoided — `amount` is the whole display amount for the currency. */

  amount: number;

  /** ISO-4217 for fiat, or `XTR` for Telegram Stars. */

  currency: string;

  externalProductId: string | null;

  isActive: boolean;

}



export interface ProductDTO {

  code: string;

  title: string;

  description: string | null;

  type: ProductType;

  isActive: boolean;

  isDefault: boolean;

  entitlementType: EntitlementType | null;

  entitlementDurationDays: number | null;

  prices: ProductProviderPriceDTO[];

  metadata?: Record<string, unknown> | null;

}



export interface EntitlementDTO {

  type: EntitlementType;

  status: EntitlementStatus;

  productCode: string | null;

  startsAt: string;

  expiresAt: string | null;

}



/** Live premium status derived only from an ACTIVE, non-expired Entitlement. */

export interface EntitlementsSummary {

  premiumActive: boolean;

  activePremium: EntitlementDTO | null;

}



/**

 * Provider option as sent to the client for the Payment Sheet.

 * `selectable` is the only field the UI should trust to decide if a tap starts a flow.

 */

export interface PaymentProviderOption {

  code: PaymentProvider;

  displayName: string;

  subtitle: string;

  /** Icon identifier resolved by the client (never a URL). */

  icon: string;

  sortOrder: number;

  /** Lower = higher priority in the list. */

  priority: number;

  requiresTelegram: boolean;

  requiresEmail: boolean;

  requiresPhone: boolean;

  /** Available in the current (Telegram vs Web) context. */

  available: boolean;

  /** Technical/preview — shows "подключается следующим этапом", not a live checkout. */

  technical: boolean;

  /** Disabled placeholder — shows "скоро". */

  comingSoon: boolean;

  /** True only when the provider can currently start a working checkout (always false in phase 1). */

  selectable: boolean;

}



export type PaymentClientContext = 'telegram' | 'web';



/** Payment intent next step for the client. */

export const PAYMENT_NEXT_ACTIONS = [
  'NOT_CONFIGURED',
  'OPEN_INVOICE',
  'PROVIDER_DISABLED',
] as const;

export type PaymentNextAction = (typeof PAYMENT_NEXT_ACTIONS)[number];



export interface PaymentIntentResult {

  paymentId: string;

  status: PaymentStatus;

  provider: PaymentProvider;

  nextAction: PaymentNextAction;

  /** Safe technical message, e.g. "способ оплаты подключается". */

  message: string;

  /** Telegram Stars invoice URL when nextAction is OPEN_INVOICE. */

  invoiceUrl?: string;

}



/** Owner-visible payment status after checkout (no secrets). */

export interface PaymentStatusDTO {

  paymentId: string;

  status: PaymentStatus;

  provider: PaymentProvider;

  entitlementActive: boolean;

  entitlementExpiresAt: string | null;

  activationPending: boolean;

}



/** Result of a provider adapter call. */

export interface ProviderCreatePaymentResult {

  nextAction: PaymentNextAction;

  status: PaymentStatus;

  message: string;

  invoiceUrl?: string;

  /** Safe, non-secret provider payload only. */

  providerPayload?: Record<string, unknown>;

}


