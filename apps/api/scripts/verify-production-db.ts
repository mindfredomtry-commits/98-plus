import { PrismaClient } from '@prisma/client';
import { MONETIZATION_EVENT_PROCESSING_TIMEOUT_MS } from '../src/config/monetization-events';

const prisma = new PrismaClient();

const EXPECTED_INDEXES = [
  'Payment_idempotencyKey_key',
  'Payment_provider_externalPaymentId_key',
  'Payment_status_expiresAt_idx',
  'Entitlement_sourcePaymentId_key',
  'MonetizationEvent_idempotencyKey_key',
  'MonetizationEvent_status_availableAt_idx',
];

async function main(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename IN (
      'Plan', 'Product', 'ProductProviderPrice',
      'Payment', 'Entitlement', 'MonetizationEvent'
    )
    ORDER BY tablename`;

  console.log('[verify-production-db] tables', {
    count: tables.length,
    names: tables.map((t) => t.tablename),
  });

  const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
    AND indexname = ANY(${EXPECTED_INDEXES}::text[])
    ORDER BY indexname`;

  const found = new Set(indexes.map((i) => i.indexname));
  const missing = EXPECTED_INDEXES.filter((n) => !found.has(n));
  console.log('[verify-production-db] indexes', {
    expected: EXPECTED_INDEXES.length,
    found: indexes.length,
    missing,
  });
  if (missing.length > 0) process.exitCode = 1;

  const failedEvents = await prisma.monetizationEvent.count({
    where: { status: 'FAILED' },
  });

  const staleProcessingCutoff = new Date(
    Date.now() - MONETIZATION_EVENT_PROCESSING_TIMEOUT_MS,
  );
  const staleProcessing = await prisma.monetizationEvent.count({
    where: {
      status: 'PROCESSING',
      processingStartedAt: { lt: staleProcessingCutoff },
    },
  });

  const expiredPending = await prisma.payment.count({
    where: {
      status: { in: ['CREATED', 'PENDING'] },
      expiresAt: { lt: new Date() },
    },
  });

  const eventStatusCounts = await prisma.monetizationEvent.groupBy({
    by: ['status'],
    _count: { _all: true },
  });

  const paymentStatusCounts = await prisma.payment.groupBy({
    by: ['status'],
    _count: { _all: true },
  });

  console.log('[verify-production-db] monetization_events', {
    failed: failedEvents,
    staleProcessing,
    byStatus: Object.fromEntries(
      eventStatusCounts.map((r) => [r.status, r._count._all]),
    ),
  });

  console.log('[verify-production-db] payments', {
    expiredCreatedOrPending: expiredPending,
    byStatus: Object.fromEntries(
      paymentStatusCounts.map((r) => [r.status, r._count._all]),
    ),
  });
}

main()
  .catch((e) => {
    console.error('[verify-production-db] failed', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
