'use client';

import { useMemo, useState } from 'react';
import type {
  PaymentClientContext,
  PaymentIntentResult,
  PaymentProvider,
  PaymentProviderOption,
  ProductDTO,
} from '@98plus/shared';
import { WhatBackIcon } from '../instant-ban/WhatBackIcon';
import { formatProviderPrice, pickPreferredPrice } from '@/lib/format-price';
import { pollPaymentActivation } from '@/lib/poll-payment-status';
import { runTelegramStarsCheckout } from '@/lib/telegram-stars-checkout';

function ProviderIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'telegram_stars':
      return <span aria-hidden>★</span>;
    case 'tribute':
      return <span aria-hidden>₽</span>;
    case 'yookassa':
      return <span aria-hidden>▢</span>;
    case 'stripe':
      return <span aria-hidden>◇</span>;
    default:
      return <span aria-hidden>•</span>;
  }
}

type Props = {
  product: ProductDTO;
  providers: PaymentProviderOption[];
  loading: boolean;
  preferredProvider: PaymentProvider;
  context: PaymentClientContext;
  token: string | null | undefined;
  onClose: () => void;
  onSelectProvider: (provider: PaymentProvider) => void;
  onStartPayment: (
    provider: PaymentProvider,
  ) => Promise<PaymentIntentResult | null>;
  onPremiumActivated: (expiresAt: string | null) => void;
};

export function PaymentSheet({
  product,
  providers,
  loading,
  preferredProvider,
  context,
  token,
  onClose,
  onSelectProvider,
  onStartPayment,
  onPremiumActivated,
}: Props) {
  const choosable = useMemo(
    () =>
      providers.filter(
        (p) => p.selectable || p.technical || (!p.comingSoon && p.available),
      ),
    [providers],
  );

  const [selected, setSelected] = useState<PaymentProvider | null>(() => {
    const preferred = choosable.find((p) => p.code === preferredProvider);
    return (preferred ?? choosable[0])?.code ?? null;
  });
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const priceForProvider = (provider: PaymentProvider) =>
    product.prices.find((p) => p.provider === provider && p.isActive) ?? null;

  const selectedOption = selected
    ? providers.find((p) => p.code === selected)
    : null;

  function handleSelect(option: PaymentProviderOption) {
    if (option.comingSoon || !option.available) return;
    if (option.code === selected) return;
    setSelected(option.code);
    setStatusMessage(null);
    setSuccess(false);
    onSelectProvider(option.code);
  }

  async function handleContinue() {
    if (!selected || busy || success) return;
    setBusy(true);
    setStatusMessage(null);

    if (
      selected === 'TELEGRAM_STARS' &&
      context === 'telegram' &&
      selectedOption?.selectable
    ) {
      const outcome = await runTelegramStarsCheckout({
        createIntent: async () => {
          const result = await onStartPayment('TELEGRAM_STARS');
          if (!result) {
            throw new Error('intent failed');
          }
          return result;
        },
        pollStatus: (paymentId) => pollPaymentActivation(token, paymentId),
      });

      setBusy(false);

      if (outcome.phase === 'success') {
        setSuccess(true);
        setStatusMessage(outcome.message);
        onPremiumActivated(outcome.expiresAt ?? null);
        window.setTimeout(() => onClose(), 1200);
        return;
      }

      if (outcome.phase === 'cancelled') {
        setStatusMessage('оплата отменена');
        return;
      }

      if (outcome.phase === 'pending_activation') {
        setStatusMessage(outcome.message);
        return;
      }

      setStatusMessage(outcome.message);
      return;
    }

    const result = await onStartPayment(selected);
    setBusy(false);
    if (result) {
      setStatusMessage(result.message || 'способ оплаты подключается');
    } else {
      setStatusMessage('не удалось создать платёж, попробуй позже');
    }
  }

  return (
    <div
      className="monetization-sheet"
      role="dialog"
      aria-label="способ оплаты"
    >
      <div className="monetization-sheet__dim" aria-hidden onClick={onClose} />
      <div className="monetization-sheet__panel">
        <header className="monetization-sheet__header">
          <button
            type="button"
            className="monetization-back"
            onClick={onClose}
            aria-label="Назад"
          >
            <WhatBackIcon />
          </button>
          <h2 className="monetization-sheet__title">способ оплаты</h2>
        </header>

        <p className="monetization-sheet__product">{product.title}</p>
        <p className="monetization-muted monetization-sheet__onetime">
          разовая покупка, без автопродления
        </p>

        <div className="monetization-sheet__list">
          {loading ? (
            <p className="monetization-muted">загрузка способов…</p>
          ) : (
            providers.map((opt) => {
              const price = priceForProvider(opt.code);
              const isSelected = selected === opt.code;
              const disabled = opt.comingSoon || !opt.available;
              return (
                <button
                  key={opt.code}
                  type="button"
                  className={`monetization-provider${
                    isSelected ? ' monetization-provider--selected' : ''
                  }${disabled ? ' monetization-provider--disabled' : ''}`}
                  onClick={() => handleSelect(opt)}
                  disabled={disabled}
                  aria-pressed={isSelected}
                >
                  <span className="monetization-provider__icon">
                    <ProviderIcon icon={opt.icon} />
                  </span>
                  <span className="monetization-provider__copy">
                    <span className="monetization-provider__name">
                      {opt.displayName}
                    </span>
                    <span className="monetization-provider__sub">
                      {opt.subtitle}
                    </span>
                  </span>
                  <span className="monetization-provider__right">
                    {price ? (
                      <span className="monetization-provider__price">
                        {formatProviderPrice(price)}
                      </span>
                    ) : null}
                    {opt.comingSoon ? (
                      <span className="monetization-tag monetization-tag--soon">
                        скоро
                      </span>
                    ) : opt.selectable ? null : opt.technical ? (
                      <span className="monetization-tag">
                        подключение следующим этапом
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {statusMessage ? (
          <p
            className={`monetization-sheet__status${
              success ? ' monetization-sheet__status--success' : ''
            }`}
            role="status"
          >
            {statusMessage}
          </p>
        ) : null}

        <div className="monetization-sheet__footer">
          <button
            type="button"
            className="monetization-cta"
            onClick={handleContinue}
            disabled={!selected || busy || success}
          >
            {busy ? '…' : success ? 'готово' : 'продолжить'}
          </button>
        </div>
      </div>
    </div>
  );
}
