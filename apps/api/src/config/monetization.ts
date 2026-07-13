import type {

  EntitlementType,

  PaymentProvider,

  ProductType,

} from '@98plus/shared';



/**

 * Centralized monetization configuration.

 *

 * IMPORTANT: all prices here are TECHNICAL placeholder values for architecture

 * bring-up. They are intentionally kept in one place (never hardcoded in a

 * button or JSX) so final pricing can be set later per provider. No value here

 * triggers a real charge in phase 1.

 */



export interface PlanSeedDefinition {

  code: string;

  title: string;

  description: string | null;

  displayOrder: number;

  isVisible: boolean;

}



export interface ProductSeedPrice {

  provider: PaymentProvider;

  /** Whole display amount in `currency` (XTR for Stars, RUB for SBP, ...). */

  amount: number;

  currency: string;

  isActive: boolean;

}



export interface ProductSeedDefinition {

  code: string;

  planCode: string;

  title: string;

  description: string | null;

  type: ProductType;

  isDefault: boolean;

  isVisible: boolean;

  displayOrder: number;

  badge: string | null;

  recommended: boolean;

  entitlementType: EntitlementType | null;

  entitlementDurationDays: number | null;

  prices: ProductSeedPrice[];

}



export const PREMIUM_PLAN: PlanSeedDefinition = {

  code: 'premium',

  title: '98+ Premium',

  description: 'Расширенная аналитика и premium-функции 98+',

  displayOrder: 10,

  isVisible: true,

};



/**

 * Premium tiers. Duration in days per the spec (30 / 90 / 180 / 365).

 * Stars (XTR) values are technical; SBP (RUB) values are technical config

 * only and DO NOT start any checkout in phase 1.

 */

export const PREMIUM_PRODUCTS: ProductSeedDefinition[] = [

  {

    code: 'premium_1m',

    planCode: 'premium',

    title: '1 месяц',

    description: 'Доступ 98+ premium на 30 дней',

    type: 'SUBSCRIPTION',

    isDefault: true,

    isVisible: true,

    displayOrder: 10,

    badge: null,

    recommended: true,

    entitlementType: 'PREMIUM',

    entitlementDurationDays: 30,

    prices: [

      // Staging test price — 1 XTR for first real Stars checkout smoke.
      { provider: 'TELEGRAM_STARS', amount: 1, currency: 'XTR', isActive: true },

      { provider: 'SBP', amount: 299, currency: 'RUB', isActive: true },

    ],

  },

  {

    code: 'premium_3m',

    planCode: 'premium',

    title: '3 месяца',

    description: 'Доступ 98+ premium на 90 дней',

    type: 'SUBSCRIPTION',

    isDefault: false,

    isVisible: false,

    displayOrder: 20,

    badge: 'Популярный',

    recommended: false,

    entitlementType: 'PREMIUM',

    entitlementDurationDays: 90,

    prices: [

      { provider: 'TELEGRAM_STARS', amount: 810, currency: 'XTR', isActive: true },

      { provider: 'SBP', amount: 809, currency: 'RUB', isActive: true },

    ],

  },

  {

    code: 'premium_6m',

    planCode: 'premium',

    title: '6 месяцев',

    description: 'Доступ 98+ premium на 180 дней',

    type: 'SUBSCRIPTION',

    isDefault: false,

    isVisible: false,

    displayOrder: 30,

    badge: null,

    recommended: false,

    entitlementType: 'PREMIUM',

    entitlementDurationDays: 180,

    prices: [

      { provider: 'TELEGRAM_STARS', amount: 1530, currency: 'XTR', isActive: true },

      { provider: 'SBP', amount: 1529, currency: 'RUB', isActive: true },

    ],

  },

  {

    code: 'premium_12m',

    planCode: 'premium',

    title: '12 месяцев',

    description: 'Доступ 98+ premium на 365 дней',

    type: 'SUBSCRIPTION',

    isDefault: false,

    isVisible: false,

    displayOrder: 40,

    badge: 'Лучший выбор',

    recommended: false,

    entitlementType: 'PREMIUM',

    entitlementDurationDays: 365,

    prices: [

      { provider: 'TELEGRAM_STARS', amount: 2700, currency: 'XTR', isActive: true },

      { provider: 'SBP', amount: 2699, currency: 'RUB', isActive: true },

    ],

  },

];


