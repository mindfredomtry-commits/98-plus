import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

function migrationDatabaseUrl(): string {
  const raw = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!raw) throw new Error('DATABASE_URL or DIRECT_URL is required');
  const url = new URL(raw);
  if (url.port === '6543') url.port = '5432';
  if (!url.searchParams.has('pgbouncer')) url.searchParams.set('pgbouncer', 'true');
  return url.toString();
}

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const migrationUrl = migrationDatabaseUrl();
process.env.DATABASE_URL = migrationUrl;
process.env.DIRECT_URL = migrationUrl;

const MIGRATIONS = [
  '20260713000000_add_monetization',
  '20260713010000_payment_expires_at_index',
] as const;

async function tableExists(prisma: PrismaClient, name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = ${name}
    ) AS exists`;
  return Boolean(rows[0]?.exists);
}

async function executeMigrationFile(prisma: PrismaClient, name: string): Promise<void> {
  const file = join(process.cwd(), 'prisma', 'migrations', name, 'migration.sql');
  const sql = readFileSync(file, 'utf8');
  const statements = splitSqlStatements(sql);
  console.log(`[apply-monetization-migrations] executing ${name} (${statements.length} statements)`);
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    if (await tableExists(prisma, 'Product')) {
      console.log('[apply-monetization-migrations] Product table already exists — skipping DDL');
    } else {
      for (const name of MIGRATIONS) {
        await executeMigrationFile(prisma, name);
      }
      console.log('[apply-monetization-migrations] DDL complete');
    }

    const hasHistory = await tableExists(prisma, '_prisma_migrations');
    const recorded = hasHistory
      ? await prisma.$queryRaw<{ migration_name: string }[]>`
          SELECT migration_name FROM _prisma_migrations
          WHERE migration_name LIKE '20260713%'
          ORDER BY migration_name`
      : [];

    if (recorded.length < MIGRATIONS.length) {
      execSync('npx prisma migrate resolve --applied 20260713000000_add_monetization', {
        stdio: 'inherit',
        env: process.env,
      });
      execSync('npx prisma migrate resolve --applied 20260713010000_payment_expires_at_index', {
        stdio: 'inherit',
        env: process.env,
      });
    }

    const verify = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
      WHERE migration_name LIKE '20260713%'
      ORDER BY migration_name`;
    console.log(
      '[apply-monetization-migrations] recorded',
      verify.map((r) => r.migration_name),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[apply-monetization-migrations] failed', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
