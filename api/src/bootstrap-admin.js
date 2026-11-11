import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
try {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim();
  if (!email || !password || !name || password.length < 16) throw new Error('Set ADMIN_EMAIL, ADMIN_NAME, and ADMIN_PASSWORD (at least 16 characters) for this one-time command');
  const hash = await bcrypt.hash(password, 12);
  await db.$transaction(async tx => {
    // Serialize bootstrap attempts, including simultaneous operator commands.
    // Return a boolean rather than PostgreSQL's `void` result so Prisma can decode it.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(741852963) IS NULL AS lock_acquired`;
    const admins = await tx.user.count({ where: { role: 'ADMIN' } });
    if (admins > 0) throw new Error('An administrator already exists; refusing to create another bootstrap admin');
    const user = await tx.user.create({ data: { email, name, passwordHash: hash, role: 'ADMIN' } });
    await tx.auditLog.create({ data: { actorId: user.id, action: 'FIRST_ADMIN_BOOTSTRAPPED', targetId: user.id, details: { method: 'one-time-cli' } } });
  });
  console.log('Created the first administrator. Remove bootstrap secrets from the environment now.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await db.$disconnect(); }
