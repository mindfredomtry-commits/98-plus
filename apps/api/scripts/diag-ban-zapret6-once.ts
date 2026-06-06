import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';

async function main() {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      text: string;
      status: string;
      createdAt: Date;
      acceptedAt: Date | null;
      expiresAt: Date | null;
      checkDueAt: Date | null;
      receiverIncomingAckAt: Date | null;
      sender_username: string | null;
      receiver_username: string | null;
      sender_telegram: bigint;
      receiver_telegram: bigint;
    }>
  >(Prisma.sql`
    SELECT
      b.id,
      b.text,
      b.status::text,
      b."createdAt",
      b."acceptedAt",
      b."expiresAt",
      b."checkDueAt",
      b."receiverIncomingAckAt",
      s.username AS sender_username,
      r.username AS receiver_username,
      s."telegramId" AS sender_telegram,
      r."telegramId" AS receiver_telegram
    FROM "Ban" b
    JOIN "User" s ON s.id = b."senderId"
    JOIN "User" r ON r.id = b."receiverId"
    WHERE (
      b.text ILIKE ${'%запрет%6%'}
      OR (s."telegramId" = 100000001 AND r."telegramId" = 100000002)
    )
    ORDER BY b."createdAt" DESC
    LIMIT 15
  `);

  console.log('ROWS', rows.length);
  for (const r of rows) {
    console.log(
      JSON.stringify(
        {
          ...r,
          sender_telegram: r.sender_telegram.toString(),
          receiver_telegram: r.receiver_telegram.toString(),
          createdAt: r.createdAt.toISOString(),
          acceptedAt: r.acceptedAt?.toISOString() ?? null,
          expiresAt: r.expiresAt?.toISOString() ?? null,
          checkDueAt: r.checkDueAt?.toISOString() ?? null,
          receiverIncomingAckAt: r.receiverIncomingAckAt?.toISOString() ?? null,
        },
        null,
        2,
      ),
    );
  }
}

main()
  .finally(() => prisma.$disconnect());
