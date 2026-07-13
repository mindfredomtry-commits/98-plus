const API = 'https://98plusapi-production.up.railway.app';

async function main(): Promise<void> {
  const authRes = await fetch(`${API}/auth/dev`);
  const auth = (await authRes.json()) as { token?: string };
  if (!auth.token) {
    console.error('[smoke] auth failed', authRes.status);
    process.exit(1);
  }

  const headers = { Authorization: `Bearer ${auth.token}` };

  const productsRes = await fetch(`${API}/products?type=premium`, { headers });
  const productsBody = (await productsRes.json()) as {
    products?: Array<{ code: string; prices: Array<{ provider: string; amount: number; currency: string }> }>;
  };

  const entRes = await fetch(`${API}/me/entitlements`, { headers });
  const entBody = (await entRes.json()) as { premiumActive?: boolean };

  const providersRes = await fetch(`${API}/payment-providers`, { headers });
  const providersBody = (await providersRes.json()) as {
    providers?: Array<{ code: string; available: boolean; selectable: boolean }>;
  };

  console.log('[smoke] GET /products', productsRes.status, {
    count: productsBody.products?.length ?? 0,
    codes: productsBody.products?.map((p) => p.code) ?? [],
    premium1mStars: productsBody.products
      ?.find((p) => p.code === 'premium_1m')
      ?.prices.find((pr) => pr.provider === 'TELEGRAM_STARS'),
  });
  console.log('[smoke] GET /me/entitlements', entRes.status, {
    premiumActive: entBody.premiumActive ?? false,
  });
  console.log('[smoke] GET /payment-providers', providersRes.status, {
    stars: providersBody.providers?.find((p) => p.code === 'TELEGRAM_STARS'),
  });

  const intentRes = await fetch(`${API}/payments/intents`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productCode: 'premium_1m',
      provider: 'TELEGRAM_STARS',
      idempotencyKey: `smoke_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    }),
  });
  const intentBody = (await intentRes.json()) as {
    paymentId?: string;
    status?: string;
    nextAction?: string;
    invoiceUrl?: string;
  };

  console.log('[smoke] POST /payments/intents', intentRes.status, {
    paymentId: intentBody.paymentId ? `${intentBody.paymentId.slice(0, 8)}...` : null,
    status: intentBody.status,
    nextAction: intentBody.nextAction,
    hasInvoiceUrl: Boolean(intentBody.invoiceUrl),
  });

  if (intentBody.paymentId) {
    const statusRes = await fetch(`${API}/payments/${intentBody.paymentId}/status`, {
      headers,
    });
    const statusBody = (await statusRes.json()) as {
      status?: string;
      entitlementActive?: boolean;
      activationPending?: boolean;
    };
    console.log('[smoke] GET /payments/:id/status (after intent, no payment)', statusRes.status, {
      paymentStatus: statusBody.status,
      entitlementActive: statusBody.entitlementActive,
      activationPending: statusBody.activationPending,
    });
  }

  const entAfter = await fetch(`${API}/me/entitlements`, { headers });
  const entAfterBody = (await entAfter.json()) as { premiumActive?: boolean };
  console.log('[smoke] premium unchanged after cancelled-intent path', {
    premiumActiveBefore: entBody.premiumActive ?? false,
    premiumActiveAfter: entAfterBody.premiumActive ?? false,
  });
}

main().catch((e) => {
  console.error('[smoke] failed', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
