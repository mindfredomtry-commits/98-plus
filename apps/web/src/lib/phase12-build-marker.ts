/**
 * Build-time constants inlined by Next.js at `next build`.
 * Do not read runtime APIs here — values must match SSR and client bundle.
 */
export const PHASE12_BUILD_MARKER = {
  diag: process.env.NEXT_PUBLIC_PHASE12_DIAG ?? null,
  buildTimestamp: process.env.NEXT_PUBLIC_BUILD_TIMESTAMP ?? null,
  buildCommit: process.env.NEXT_PUBLIC_BUILD_COMMIT ?? null,
  nodeEnv: process.env.NODE_ENV ?? null,
} as const;
