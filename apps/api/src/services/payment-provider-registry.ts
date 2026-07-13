import type {
  PaymentClientContext,
  PaymentProvider,
  PaymentProviderOption,
} from '@98plus/shared';
import { isTelegramStarsEnabled } from '../config/telegram-stars';

interface ProviderRegistryEntry {
  code: PaymentProvider;
  displayName: string;
  subtitle: string;
  enabled: boolean;
  technical: boolean;
  availableInTelegram: boolean;
  availableOnWeb: boolean;
  supportsRecurring: boolean;
  supportsOneTime: boolean;
  icon: string;
  priority: number;
  requiresTelegram: boolean;
  requiresEmail: boolean;
  requiresPhone: boolean;
}

const BASE_REGISTRY: Record<PaymentProvider, ProviderRegistryEntry> = {
  TELEGRAM_STARS: {
    code: 'TELEGRAM_STARS',
    displayName: 'Telegram Stars',
    subtitle: 'разовая покупка, без автопродления',
    enabled: false,
    technical: true,
    availableInTelegram: true,
    availableOnWeb: false,
    supportsRecurring: false,
    supportsOneTime: true,
    icon: 'telegram_stars',
    priority: 10,
    requiresTelegram: true,
    requiresEmail: false,
    requiresPhone: false,
  },
  SBP: {
    code: 'SBP',
    displayName: 'СБП и российские карты',
    subtitle: 'Tribute',
    enabled: false,
    technical: true,
    availableInTelegram: true,
    availableOnWeb: true,
    supportsRecurring: true,
    supportsOneTime: true,
    icon: 'tribute',
    priority: 20,
    requiresTelegram: false,
    requiresEmail: false,
    requiresPhone: false,
  },
  CARD_RU: {
    code: 'CARD_RU',
    displayName: 'Российские карты',
    subtitle: 'ЮKassa',
    enabled: false,
    technical: false,
    availableInTelegram: false,
    availableOnWeb: true,
    supportsRecurring: true,
    supportsOneTime: true,
    icon: 'yookassa',
    priority: 30,
    requiresTelegram: false,
    requiresEmail: true,
    requiresPhone: false,
  },
  CARD_INT: {
    code: 'CARD_INT',
    displayName: 'Международные карты',
    subtitle: 'Stripe',
    enabled: false,
    technical: false,
    availableInTelegram: false,
    availableOnWeb: true,
    supportsRecurring: true,
    supportsOneTime: true,
    icon: 'stripe',
    priority: 40,
    requiresTelegram: false,
    requiresEmail: true,
    requiresPhone: false,
  },
};

export function getPaymentProviderEntry(
  provider: PaymentProvider,
): ProviderRegistryEntry {
  const entry = BASE_REGISTRY[provider];
  if (provider === 'TELEGRAM_STARS' && isTelegramStarsEnabled()) {
    return {
      ...entry,
      enabled: true,
      technical: false,
      subtitle: 'разовая покупка, без автопродления',
    };
  }
  return entry;
}

export const PAYMENT_PROVIDER_REGISTRY = BASE_REGISTRY;

function toOption(
  entry: ProviderRegistryEntry,
  context: PaymentClientContext,
): PaymentProviderOption {
  const available =
    context === 'telegram' ? entry.availableInTelegram : entry.availableOnWeb;
  const technical = entry.technical && !entry.enabled;
  const comingSoon = !entry.technical && !entry.enabled;
  return {
    code: entry.code,
    displayName: entry.displayName,
    subtitle: entry.subtitle,
    icon: entry.icon,
    sortOrder: entry.priority,
    priority: entry.priority,
    requiresTelegram: entry.requiresTelegram,
    requiresEmail: entry.requiresEmail,
    requiresPhone: entry.requiresPhone,
    available,
    technical,
    comingSoon,
    selectable: entry.enabled && available,
  };
}

export function listPaymentProviderOptions(
  context: PaymentClientContext,
): PaymentProviderOption[] {
  return (Object.keys(BASE_REGISTRY) as PaymentProvider[])
    .map((code) => getPaymentProviderEntry(code))
    .map((entry) => toOption(entry, context))
    .filter((opt) => opt.available)
    .sort((a, b) => a.priority - b.priority);
}

export function canCreateIntentForProvider(provider: PaymentProvider): boolean {
  const entry = getPaymentProviderEntry(provider);
  if (!entry) return false;
  if (provider === 'TELEGRAM_STARS' && !isTelegramStarsEnabled()) {
    return false;
  }
  return entry.enabled || entry.technical;
}
