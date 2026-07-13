import { execSync } from 'node:child_process';

function migrationDatabaseUrl(): string {
  const raw = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error('DATABASE_URL or DIRECT_URL is required');
  }
  const url = new URL(raw);
  // Supabase transaction pooler (:6543) cannot run Prisma migrations (advisory locks).
  // Session pooler uses :5432 on the same host.
  if (url.port === '6543') {
    url.port = '5432';
  }
  if (!url.searchParams.has('pgbouncer')) {
    url.searchParams.set('pgbouncer', 'true');
  }
  return url.toString();
}

const migrationUrl = migrationDatabaseUrl();
process.env.DATABASE_URL = migrationUrl;
process.env.DIRECT_URL = migrationUrl;
console.log('[migrate-deploy] using session pooler port for migrations');
execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
