import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
try {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !name || !password || password.length < 16) {
    throw new Error('Set ADMIN_EMAIL, ADMIN_NAME, and ADMIN_PASSWORD (at least 16 characters) in api/.env first.');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(741852963) IS NULL AS lock_acquired`;
    const admin = await tx.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } });
    if (!admin) throw new Error('No admin exists yet; run npm run bootstrap:admin first.');
    const emailOwner = await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (emailOwner && emailOwner.id !== admin.id) throw new Error('That email is already assigned to another account.');
    await tx.user.update({ where: { id: admin.id }, data: { email, name, passwordHash } });
    await tx.auditLog.create({ data: { actorId: admin.id, action: 'ADMIN_CREDENTIALS_ROTATED', targetId: admin.id, details: { method: 'one-time-cli' } } });
  });
  console.log('Updated the existing administrator credentials. Restart the API and sign in with the new values.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
