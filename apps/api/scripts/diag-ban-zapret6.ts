/**
 * Diagnostic: "запрет 6" delivery  account#1 (dev_user) → account#2 (dev_peer)
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import {
  DEV_PEER_TELEGRAM_ID,
  DEV_SENDER_TELEGRAM_ID,
} from '../src/services/dev-fixtures.service';
import { INCOMING_PENDING_MAX_AGE_MS } from '@98plus/shared';

async function main() {
  const sender = await prisma.user.findUnique({
    where: { telegramId: DEV_SENDER_TELEGRAM_ID },
  });
  const receiver = await prisma.user.findUnique({
    where: { telegramId: DEV_PEER_TELEGRAM_ID },
  });

  if (!sender || !receiver) {
    console.log('ERROR: dev users missing');
    return;
  }

  console.log('ACCOUNT_1', {
    id: sender.id,
    username: sender.username,
    telegramId: sender.telegramId.toString(),
  });
  console.log('ACCOUNT_2', {
    id: receiver.id,
    username: receiver.username,
    telegramId: receiver.telegramId.toString(),
  });

  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const recent12 = await prisma.ban.findMany({
    where: {
      senderId: sender.id,
      receiverId: receiver.id,
      createdAt: { gte: since48h },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log('\n=== BANS 1→2 last 48h ===', recent12.length);
  for (const b of recent12) printBan(b);

  const zapret6Pair = await prisma.ban.findMany({
    where: {
      senderId: sender.id,
      receiverId: receiver.id,
      OR: [
        { text: { equals: 'запрет 6', mode: 'insensitive' } },
        { text: { contains: 'запрет 6', mode: 'insensitive' } },
        { text: { contains: 'запрет', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  console.log('\n=== BANS 1→2 text zapret/запрет 6 ===', zapret6Pair.length);
  for (const b of zapret6Pair) printBan(b);

  const globalZ6 = await prisma.ban.findMany({
    where: {
      OR: [
        { text: { equals: 'запрет 6', mode: 'insensitive' } },
        { text: { contains: 'запрет 6', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      sender: { select: { username: true, firstName: true } },
      receiver: { select: { username: true, firstName: true } },
    },
  });

  console.log('\n=== GLOBAL "запрет 6" (any pair) ===', globalZ6.length);
  for (const b of globalZ6) {
    console.log({
      id: b.id,
      text: b.text,
      status: b.status,
      sender: b.sender.username ?? b.sender.firstName,
      receiver: b.receiver.username ?? b.receiver.firstName,
      createdAt: b.createdAt.toISOString(),
      receiverIncomingAckAt: b.receiverIncomingAckAt?.toISOString() ?? null,
    });
  }

  const latestAny = await prisma.ban.findFirst({
    where: { senderId: sender.id, receiverId: receiver.id },
    orderBy: { createdAt: 'desc' },
  });

  if (!latestAny) {
    console.log('\nCONCLUSION: No ban rows 1→2 ever.');
    return;
  }

  const cutoff = new Date(Date.now() - INCOMING_PENDING_MAX_AGE_MS);
  const reject: string[] = [];
  if (latestAny.receiverId !== receiver.id) reject.push('receiver mismatch');
  if (latestAny.status !== 'PENDING') reject.push(`status=${latestAny.status}`);
  if (latestAny.receiverIncomingAckAt) reject.push('acked');
  if (latestAny.isOverboard) reject.push('overboard');
  if (latestAny.createdAt < cutoff) reject.push(`too old (< ${cutoff.toISOString()})`);
  if (latestAny.handledAt) reject.push('handledAt');

  console.log('\n=== LATEST 1→2 BAN (would #2 see incoming?) ===');
  printBan(latestAny);
  console.log('pollWouldShow:', reject.length === 0, 'reject:', reject);

  const freshPending = await prisma.ban.findFirst({
    where: {
      receiverId: receiver.id,
      status: 'PENDING',
      receiverIncomingAckAt: null,
      isOverboard: false,
      handledAt: null,
      createdAt: { gte: cutoff },
      counterBans: { none: {} },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log('\n=== NEWEST FRESH PENDING for #2 (poll picks this) ===');
  if (freshPending) {
    printBan(freshPending);
    console.log('NOTE: poll shows THIS ban, not necessarily "запрет 6"');
  } else {
    console.log('null — no fresh pending for account #2');
  }
}

function printBan(b: {
  id: string;
  text: string;
  status: string;
  senderId: string;
  receiverId: string;
  createdAt: Date;
  acceptedAt: Date | null;
  expiresAt: Date | null;
  checkDueAt: Date | null;
  receiverIncomingAckAt: Date | null;
  handledAt: Date | null;
  isOverboard: boolean;
}) {
  console.log({
    id: b.id,
    text: b.text,
    status: b.status,
    createdAt: b.createdAt.toISOString(),
    acceptedAt: b.acceptedAt?.toISOString() ?? null,
    expiresAt: b.expiresAt?.toISOString() ?? null,
    checkDueAt: b.checkDueAt?.toISOString() ?? null,
    receiverIncomingAckAt: b.receiverIncomingAckAt?.toISOString() ?? null,
    handledAt: b.handledAt?.toISOString() ?? null,
    isOverboard: b.isOverboard,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
