import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const app = express();
const db = new PrismaClient();
const port = Number(process.env.PORT || 4000);
const production = process.env.NODE_ENV === 'production';
const allowedOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('Set JWT_SECRET to a random value of at least 32 characters');
}
if (production && !process.env.REDIS_URL) {
  throw new Error('Set REDIS_URL in production so rate limits are shared across API instances');
}

const redisClient = process.env.REDIS_URL ? createClient({ url: process.env.REDIS_URL }) : null;
if (redisClient) {
  redisClient.on('error', error => console.error('Redis connection error:', error.message));
  await redisClient.connect();
}

app.use(helmet());
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());
// Cookie-authenticated state changes must originate from the configured frontend.
app.use('/api', (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (req.get('origin') !== allowedOrigin) return fail(res, 403, 'Request origin is not allowed');
  next();
});
const authRateLimitOptions = { windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false };
if (redisClient) {
  authRateLimitOptions.store = new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'balancevault:auth-limit:'
  });
}
app.use('/api/auth', rateLimit(authRateLimitOptions));

function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '8h', issuer: 'balancevault' });
  res.cookie('bv_session', token, {
    httpOnly: true, secure: production, sameSite: production ? 'none' : 'lax', path: '/', maxAge: 8 * 60 * 60 * 1000
  });
}
function fail(res, status, message) { return res.status(status).json({ error: message }); }

async function requireUser(req, res, next) {
  try {
    const token = req.cookies.bv_session;
    if (!token) return fail(res, 401, 'Sign in required');
    const claims = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'balancevault' });
    const user = await db.user.findUnique({ where: { id: claims.sub } });
    if (!user || user.disabled) return fail(res, 401, 'Account unavailable');
    req.user = user;
    next();
  } catch { return fail(res, 401, 'Invalid session'); }
}
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') return fail(res, 403, 'Administrator access required');
  next();
}
async function audit(actorId, action, targetId, details = {}) {
  await db.auditLog.create({ data: { actorId, action, targetId, details } });
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', async (_req, res) => {
  if (redisClient && !redisClient.isReady) return res.status(503).json({ status: 'not-ready' });
  try { await db.$queryRaw`SELECT 1`; res.json({ status: 'ready' }); }
  catch { res.status(503).json({ status: 'not-ready' }); }
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(80), email: z.string().email().max(254), password: z.string().min(12).max(128) }).parse(req.body);
    const email = input.email.toLowerCase();
    if (await db.user.findUnique({ where: { email } })) return fail(res, 409, 'An account with that email already exists');
    const passwordHash = await bcrypt.hash(input.password, 12);
    const { user, request } = await db.$transaction(async tx => {
      const createdUser = await tx.user.create({ data: { email, name: input.name, passwordHash } });
      const createdRequest = await tx.onboardingRequest.create({ data: { userId: createdUser.id } });
      await tx.auditLog.create({ data: { actorId: createdUser.id, action: 'ACCOUNT_REGISTERED', targetId: createdRequest.id, details: { status: 'PENDING' } } });
      return { user: createdUser, request: createdRequest };
    });
    issueSession(res, user);
    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, onboarding: request.status });
  } catch (e) { next(e); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const input = z.object({ email: z.string().email(), password: z.string().min(1).max(128) }).parse(req.body);
    const user = await db.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || user.disabled || !(await bcrypt.compare(input.password, user.passwordHash))) return fail(res, 401, 'Email or password is incorrect');
    issueSession(res, user);
    await audit(user.id, 'LOGIN_SUCCEEDED', user.id);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) { next(e); }
});

app.post('/api/auth/logout', (req, res) => { res.clearCookie('bv_session', { httpOnly: true, secure: production, sameSite: production ? 'none' : 'lax', path: '/' }); res.status(204).end(); });
app.get('/api/me', requireUser, async (req, res) => {
  const latest = await db.onboardingRequest.findFirst({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
  res.json({ user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role }, onboarding: latest?.status ?? null });
});

app.get('/api/admin/onboarding', requireUser, requireAdmin, async (_req, res) => {
  const rows = await db.onboardingRequest.findMany({ where: { status: 'PENDING' }, include: { user: { select: { id: true, name: true, email: true, createdAt: true } } }, orderBy: { createdAt: 'asc' }, take: 100 });
  res.json({ requests: rows });
});
app.post('/api/admin/onboarding/:id/review', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().max(500).optional() }).parse(req.body);
    const result = await db.$transaction(async tx => {
      const row = await tx.onboardingRequest.findUnique({ where: { id: req.params.id } });
      if (!row) return null;
      const changed = await tx.onboardingRequest.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: { status: input.decision, note: input.note, reviewedBy: req.user.id, reviewedAt: new Date() }
      });
      if (changed.count === 0) throw Object.assign(new Error('Request has already been reviewed'), { status: 409 });
      const updated = await tx.onboardingRequest.findUnique({ where: { id: row.id } });
      await tx.auditLog.create({ data: { actorId: req.user.id, action: 'ONBOARDING_REVIEWED', targetId: row.id, details: { decision: input.decision } } });
      return updated;
    });
    if (!result) return fail(res, 404, 'Request not found');
    res.json({ request: result });
  } catch (e) { next(e); }
});
app.get('/api/admin/users', requireUser, requireAdmin, async (_req, res) => {
  const users = await db.user.findMany({ select: { id: true, name: true, email: true, role: true, disabled: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ users });
});
app.patch('/api/admin/users/:id/status', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({ disabled: z.boolean() }).parse(req.body);
    const target = await db.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true } });
    if (!target) return fail(res, 404, 'User not found');
    if (target.role === 'ADMIN') return fail(res, 403, 'Administrator accounts are protected from this action');
    const updated = await db.$transaction(async tx => {
      const user = await tx.user.update({ where: { id: target.id }, data: { disabled: input.disabled }, select: { id: true, name: true, email: true, role: true, disabled: true, createdAt: true } });
      await tx.auditLog.create({ data: { actorId: req.user.id, action: input.disabled ? 'USER_DISABLED' : 'USER_REENABLED', targetId: target.id, details: {} } });
      return user;
    });
    res.json({ user: updated });
  } catch (e) { next(e); }
});
app.get('/api/admin/audit', requireUser, requireAdmin, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
  const events = await db.auditLog.findMany({ include: { actor: { select: { email: true } } }, orderBy: { createdAt: 'desc' }, take: limit });
  res.json({ events });
});

app.use((err, _req, res, _next) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', fields: err.issues.map(i => i.path.join('.')) });
  if (err.code === 'P2002') return res.status(409).json({ error: 'A record with that value already exists' });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error('Request failed:', err.message);
  res.status(500).json({ error: 'Unexpected server error' });
});

const server = app.listen(port, () => console.log(`BalanceVault API listening on ${port}`));
async function shutdown() { server.close(); await db.$disconnect(); await redisClient?.close(); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
