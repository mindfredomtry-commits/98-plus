'use client';

import type { PaymentProvider, ProductDTO } from '@98plus/shared';
import { WhatBackIcon } from '../instant-ban/WhatBackIcon';
import {
  formatMonthlyEstimate,
  formatProviderPrice,
  pickPreferredPrice,
} from '@/lib/format-price';

const PREMIUM_FEATURES = [
  'кто чаще начинает новые циклы',
  'чьё влияние сильнее',
  'как быстро вам отвечают',
  'сколько запретов становятся ответными',
  'как меняется динамика ваших отношений',
];

type Props = {
  products: ProductDTO[];
  loading: boolean;
  selectedProductCode: string | null;
  preferredProvider: PaymentProvider;
  onBack: () => void;
  onSelectProduct: (code: string) => void;
  onContinue: () => void;
};

export function PremiumScreen({
  products,
  loading,
  selectedProductCode,
  preferredProvider,
  onBack,
  onSelectProduct,
  onContinue,
}: Props) {
  const canContinue = Boolean(selectedProductCode) && !loading;

  return (
    <div className="monetization-screen" role="dialog" aria-label="98+ premium">
      <div className="monetization-screen__scroll">
        <header className="monetization-screen__header">
          <button
            type="button"
            className="monetization-back"
            onClick={onBack}
            aria-label="Назад"
          >
            <WhatBackIcon />
          </button>
          <h2 className="monetization-screen__nav-title">98+ premium</h2>
        </header>

        <div className="monetization-hero">
          <div className="monetization-hero__mark" aria-hidden>
            98+
          </div>
          <h1 className="monetization-hero__title">98+ premium</h1>
          <p className="monetization-hero__lead">узнай, что происходит между вами</p>
          <p className="monetization-hero__sub">
            98+ собирает историю ваших действий и показывает то, что обычно
            остаётся незаметным
          </p>
        </div>

        <section className="monetization-features">
          <h3 className="monetization-features__title">что откроется</h3>
          <ul className="monetization-features__list">
            {PREMIUM_FEATURES.map((f) => (
              <li key={f} className="monetization-features__item">
                <span className="monetization-features__dot" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
        </section>

        <section className="monetization-tariffs">
          {loading ? (
            <p className="monetization-muted">загрузка тарифов…</p>
          ) : products.length === 0 ? (
            <p className="monetization-muted">тарифы появятся позже</p>
          ) : (
            products.map((product) => {
              const price = pickPreferredPrice(product, preferredProvider);
              const selected = product.code === selectedProductCode;
              const monthly = price
                ? formatMonthlyEstimate(product, price)
                : null;
              const badge =
                typeof product.metadata?.badge === 'string'
                  ? (product.metadata.badge as string)
                  : null;
              return (
                <button
                  key={product.code}
                  type="button"
                  className={`monetization-tariff${
                    selected ? ' monetization-tariff--selected' : ''
                  }`}
                  onClick={() => onSelectProduct(product.code)}
                  aria-pressed={selected}
                >
                  <span className="monetization-tariff__left">
                    <span className="monetization-tariff__period">
                      {product.title}
                    </span>
                    {monthly ? (
                      <span className="monetization-tariff__monthly">
                        {monthly}
                      </span>
                    ) : null}
                  </span>
                  <span className="monetization-tariff__right">
                    {price ? (
                      <span className="monetization-tariff__price">
                        {formatProviderPrice(price)}
                      </span>
                    ) : null}
                    {badge ? (
                      <span className="monetization-tag monetization-tag--badge">
                        {badge}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className="monetization-tariff__check"
                    aria-hidden
                  >
                    {selected ? '✓' : ''}
                  </span>
                </button>
              );
            })
          )}
        </section>
      </div>

      <div className="monetization-screen__dock">
        <button
          type="button"
          className="monetization-cta"
          onClick={onContinue}
          disabled={!canContinue}
        >
          продолжить
        </button>
      </div>
    </div>
  );
}
