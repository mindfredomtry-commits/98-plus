'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ANALYTICS_EVENTS,
  type EntitlementsSummary,
  type PaymentClientContext,
  type PaymentIntentResult,
  type PaymentProvider,
  type PaymentProviderOption,
  type ProductDTO,
} from '@98plus/shared';
import type { UserPublic } from '@98plus/shared';
import { useApp } from '../Providers';
import { PremiumScreen } from './PremiumScreen';
import { PaymentSheet } from './PaymentSheet';
import { AnalyticsPeerSelectScreen } from './AnalyticsPeerSelectScreen';
import { RelationshipAnalyticsScreen } from './RelationshipAnalyticsScreen';
import { RelationshipTimelineScreen } from './RelationshipTimelineScreen';
import {
  createPaymentIntent,
  fetchEntitlementsSummary,
  fetchPaymentProviders,
  fetchPremiumProducts,
  newIdempotencyKey,
} from '@/lib/monetization-api';
import { trackProductEvent } from '@/lib/product-analytics';
import { trackOpenPremiumV2 } from '@/lib/analytics-track-v2-client';
import { resolveUserDisplayName } from '@/lib/user-display-name';
import { userAvatarSrc } from '@/lib/user-public-avatar';
import type {
  AnalyticsPeer,
  RelationshipTimelinePayload,
} from '@/lib/relationship-analytics-types';
import './monetization.css';

type MonetizationView =
  | 'peerSelect'
  | 'premium'
  | 'analytics'
  | 'timeline';

type Props = {
  user: UserPublic | null;
  token: string | null | undefined;
  /** telegram vs web — drives preferred provider + available methods. */
  context: PaymentClientContext;
  onHaptic?: (style?: 'light' | 'medium' | 'heavy') => void;
  /** Called when the user backs out of Profile — returns to the lobby. */
  onClose: () => void;
  /**
   * START_BAN from relationship analytics — closes monetization and opens
   * WhatScreen for this peer (skips Who). Returns false if peer not in friends.
   */
  onStartBan?: (peer: AnalyticsPeer) => boolean;
};

export function MonetizationSection({
  user,
  token,
  context,
  onHaptic,
  onClose,
  onStartBan,
}: Props) {
  const { friends } = useApp();

  const preferredProvider: PaymentProvider =
    context === 'telegram' ? 'TELEGRAM_STARS' : 'SBP';

  const [view, setView] = useState<MonetizationView>('peerSelect');
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [selectedAnalyticsPeer, setSelectedAnalyticsPeer] =
    useState<AnalyticsPeer | null>(null);
  const [timelinePayload, setTimelinePayload] =
    useState<RelationshipTimelinePayload | null>(null);

  const [entitlements, setEntitlements] = useState<EntitlementsSummary | null>(
    null,
  );
  const [entitlementLoading, setEntitlementLoading] = useState(true);

  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsLoaded, setProductsLoaded] = useState(false);

  const [providers, setProviders] = useState<PaymentProviderOption[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);

  const [selectedProductCode, setSelectedProductCode] = useState<string | null>(
    null,
  );

  const haptic = useCallback(
    (style: 'light' | 'medium' | 'heavy' = 'light') => onHaptic?.(style),
    [onHaptic],
  );

  // —— Open from lobby: load entitlement status for premium CTA ——
  useEffect(() => {
    trackProductEvent(ANALYTICS_EVENTS.OPEN_PROFILE, token);
    let cancelled = false;
    setEntitlementLoading(true);
    fetchEntitlementsSummary(token)
      .then((summary) => {
        if (!cancelled) setEntitlements(summary);
      })
      .catch(() => {
        if (!cancelled) setEntitlements({ premiumActive: false, activePremium: null });
      })
      .finally(() => {
        if (!cancelled) setEntitlementLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const loadProducts = useCallback(() => {
    if (productsLoaded || productsLoading) return;
    setProductsLoading(true);
    fetchPremiumProducts(token)
      .then((list) => {
        setProducts(list);
        setProductsLoaded(true);
        // Default = catalog default, else premium_1m, else first.
        setSelectedProductCode((prev) => {
          if (prev) return prev;
          const def = list.find((p) => p.isDefault);
          const oneMonth = list.find((p) => p.code === 'premium_1m');
          return (def ?? oneMonth ?? list[0])?.code ?? null;
        });
      })
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));
  }, [productsLoaded, productsLoading, token]);

  const loadProviders = useCallback(() => {
    setProvidersLoading(true);
    fetchPaymentProviders(token, context)
      .then((list) => setProviders(list))
      .catch(() => setProviders([]))
      .finally(() => setProvidersLoading(false));
  }, [context, token]);

  const handleOpenPremium = useCallback(() => {
    haptic('light');
    trackProductEvent(ANALYTICS_EVENTS.PRESS_LEARN, token);
    // Dual-write: Legacy + Tracker V2 (V2 is fire-and-forget; never blocks UX).
    trackProductEvent(ANALYTICS_EVENTS.OPEN_PREMIUM, token);
    trackOpenPremiumV2(token);
    loadProducts();
    setView('premium');
  }, [haptic, loadProducts, token]);

  const handleBackFromPremium = useCallback(() => {
    haptic('light');
    setView('peerSelect');
  }, [haptic]);

  const handleBackFromPeerSelect = useCallback(() => {
    haptic('light');
    setSelectedAnalyticsPeer(null);
    onClose();
  }, [haptic, onClose]);

  const handleSelectAnalyticsPeer = useCallback(
    (peer: AnalyticsPeer) => {
      haptic('light');
      setSelectedAnalyticsPeer(peer);
      setTimelinePayload(null);
      setView('analytics');
    },
    [haptic],
  );

  const handleBackFromAnalytics = useCallback(() => {
    haptic('light');
    setView('peerSelect');
  }, [haptic]);

  const handleOpenTimeline = useCallback(
    (payload: RelationshipTimelinePayload) => {
      setTimelinePayload(payload);
      setView('timeline');
    },
    [],
  );

  const handleBackFromTimeline = useCallback(() => {
    haptic('light');
    setView('analytics');
  }, [haptic]);

  const refreshEntitlements = useCallback(() => {
    setEntitlementLoading(true);
    fetchEntitlementsSummary(token)
      .then((summary) => setEntitlements(summary))
      .catch(() =>
        setEntitlements({ premiumActive: false, activePremium: null }),
      )
      .finally(() => setEntitlementLoading(false));
  }, [token]);

  const handleSelectProduct = useCallback(
    (code: string) => {
      haptic('light');
      setSelectedProductCode(code);
      trackProductEvent(ANALYTICS_EVENTS.SELECT_PRODUCT, token, {
        productCode: code,
      });
    },
    [haptic, token],
  );

  const handleContinue = useCallback(() => {
    if (!selectedProductCode) return;
    haptic('medium');
    trackProductEvent(ANALYTICS_EVENTS.OPEN_PAYMENT_SHEET, token, {
      productCode: selectedProductCode,
    });
    loadProviders();
    setPaymentSheetOpen(true);
  }, [haptic, loadProviders, selectedProductCode, token]);

  const handleClosePaymentSheet = useCallback(() => {
    haptic('light');
    trackProductEvent(ANALYTICS_EVENTS.CLOSE_PAYMENT_SHEET, token, {
      productCode: selectedProductCode ?? undefined,
    });
    // Keep the selected tariff — just return to Premium.
    setPaymentSheetOpen(false);
  }, [haptic, selectedProductCode, token]);

  const handleSelectProvider = useCallback(
    (provider: PaymentProvider) => {
      haptic('light');
      trackProductEvent(ANALYTICS_EVENTS.SELECT_PAYMENT_PROVIDER, token, {
        provider,
        productCode: selectedProductCode ?? undefined,
      });
    },
    [haptic, selectedProductCode, token],
  );

  const handleStartPayment = useCallback(
    async (provider: PaymentProvider): Promise<PaymentIntentResult | null> => {
      if (!selectedProductCode) return null;
      haptic('medium');
      trackProductEvent(ANALYTICS_EVENTS.CREATE_PAYMENT_INTENT, token, {
        provider,
        productCode: selectedProductCode,
      });
      try {
        return await createPaymentIntent(token, {
          productCode: selectedProductCode,
          provider,
          idempotencyKey: newIdempotencyKey(),
        });
      } catch {
        return null;
      }
    },
    [haptic, selectedProductCode, token],
  );

  const handlePremiumActivated = useCallback(
    (expiresAt: string | null) => {
      haptic('medium');
      setEntitlements((prev) => ({
        premiumActive: true,
        activePremium: prev?.activePremium ?? {
          type: 'PREMIUM',
          status: 'ACTIVE',
          productCode: selectedProductCode,
          startsAt: new Date().toISOString(),
          expiresAt,
        },
      }));
      refreshEntitlements();
      setView('peerSelect');
    },
    [haptic, refreshEntitlements, selectedProductCode],
  );

  const selectedProduct = useMemo(
    () => products.find((p) => p.code === selectedProductCode) ?? null,
    [products, selectedProductCode],
  );

  const premiumActive = entitlements?.premiumActive ?? false;

  return (
    <div className="monetization-root">
      {view === 'peerSelect' ? (
        <AnalyticsPeerSelectScreen
          friends={friends}
          token={token}
          user={user}
          premiumActive={premiumActive}
          onOpenPremium={handleOpenPremium}
          onSelect={handleSelectAnalyticsPeer}
          onBack={handleBackFromPeerSelect}
        />
      ) : null}

      {view === 'premium' ? (
        <PremiumScreen
          products={products}
          loading={productsLoading}
          selectedProductCode={selectedProductCode}
          preferredProvider={preferredProvider}
          onBack={handleBackFromPremium}
          onSelectProduct={handleSelectProduct}
          onContinue={handleContinue}
        />
      ) : null}

      {view === 'analytics' && selectedAnalyticsPeer ? (
        <RelationshipAnalyticsScreen
          token={token}
          peer={selectedAnalyticsPeer}
          viewerUserId={user?.id ?? null}
          viewerLabel="ты"
          viewerAvatarUrl={userAvatarSrc(user)}
          viewerDisplayName={resolveUserDisplayName(user)}
          premiumActive={premiumActive}
          onBack={handleBackFromAnalytics}
          onOpenTimeline={handleOpenTimeline}
          onStartBan={onStartBan}
        />
      ) : null}

      {view === 'timeline' && selectedAnalyticsPeer && timelinePayload ? (
        <RelationshipTimelineScreen
          peer={selectedAnalyticsPeer}
          payload={timelinePayload}
          onBack={handleBackFromTimeline}
        />
      ) : null}

      {paymentSheetOpen && selectedProduct ? (
        <PaymentSheet
          product={selectedProduct}
          providers={providers}
          loading={providersLoading}
          preferredProvider={preferredProvider}
          context={context}
          token={token}
          onClose={handleClosePaymentSheet}
          onSelectProvider={handleSelectProvider}
          onStartPayment={handleStartPayment}
          onPremiumActivated={handlePremiumActivated}
        />
      ) : null}
    </div>
  );
}
