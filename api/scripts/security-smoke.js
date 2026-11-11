import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const databaseUrl = new URL(process.env.DATABASE_URL || '');
if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname)) {
  throw new Error('Security smoke checks only run against a local development database.');
}
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in api/.env first.');
}

const db = new PrismaClient();
const base = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
const origin = process.env.WEB_ORIGIN || 'http://localhost:5173';
const testEmail = `balancevault-smoke-${Date.now()}@example.test`;
const testPassword = `Smoke-${crypto.randomUUID()}-A1`;

function createSession() {
  let cookie = '';
  return async (path, { method = 'GET', body, originOverride } = {}) => {
    const headers = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers.Origin = originOverride || origin;
    }
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const data = response.status === 204 ? null : await response.json();
    return { status: response.status, data, setCookie };
  };
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const checks = [];
const admin = createSession();
const holder = createSession();
try {
  const login = await admin('/api/auth/login', {
    method: 'POST',
    body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }
  });
  expect(login.status === 200 && login.data.user.role === 'ADMIN', 'Admin login failed.');
  expect(/HttpOnly/i.test(login.setCookie || '') && /SameSite/i.test(login.setCookie || ''), 'Session cookie is missing security attributes.');
  checks.push('admin login and protected session cookie');

  const anonymous = await createSession()('/api/admin/users');
  expect(anonymous.status === 401, 'Anonymous access to admin users was not rejected.');
  const crossOrigin = await createSession()('/api/auth/logout', { method: 'POST', originOverride: 'https://attacker.example' });
  expect(crossOrigin.status === 403, 'Cross-origin state change was not rejected.');
  checks.push('anonymous access and cross-origin mutation denied');

  const registration = await holder('/api/auth/register', {
    method: 'POST',
    body: { name: 'BalanceVault Smoke Test', email: testEmail, password: testPassword }
  });
  expect(registration.status === 201, `Holder registration returned ${registration.status}.`);
  const holderId = registration.data.user.id;
  const pending = await holder('/api/me');
  expect(pending.status === 200 && pending.data.onboarding === 'PENDING', 'New holder was not pending.');
  const forbidden = await holder('/api/admin/users');
  expect(forbidden.status === 403, 'Holder was able to access an admin endpoint.');
  checks.push('holder registration, pending onboarding, and role denial');

  const queue = await admin('/api/admin/onboarding');
  const request = queue.data.requests.find(item => item.user.id === holderId);
  expect(Boolean(request), 'New holder was missing from the admin review queue.');
  const review = await admin(`/api/admin/onboarding/${request.id}/review`, {
    method: 'POST', body: { decision: 'APPROVED', note: 'Local security smoke check' }
  });
  expect(review.status === 200, `Admin review returned ${review.status}.`);
  const approved = await holder('/api/me');
  expect(approved.data.onboarding === 'APPROVED', 'Holder did not receive the approved status.');
  checks.push('admin onboarding decision');

  const disabled = await admin(`/api/admin/users/${holderId}/status`, { method: 'PATCH', body: { disabled: true } });
  expect(disabled.status === 200 && disabled.data.user.disabled, 'Admin could not disable holder access.');
  const deniedAfterDisable = await holder('/api/me');
  expect(deniedAfterDisable.status === 401, 'Disabled holder retained access.');
  const restored = await admin(`/api/admin/users/${holderId}/status`, { method: 'PATCH', body: { disabled: false } });
  expect(restored.status === 200 && !restored.data.user.disabled, 'Admin could not restore holder access.');
  const protectedAdmin = await admin(`/api/admin/users/${login.data.user.id}/status`, { method: 'PATCH', body: { disabled: true } });
  expect(protectedAdmin.status === 403, 'Admin account was not protected from disable action.');
  checks.push('disable/restore access and protected admin account');

  const audit = await admin('/api/admin/audit');
  const actions = new Set(audit.data.events.map(event => event.action));
  for (const action of ['ACCOUNT_REGISTERED', 'ONBOARDING_REVIEWED', 'USER_DISABLED', 'USER_REENABLED']) {
    expect(actions.has(action), `Audit trail is missing ${action}.`);
  }
  checks.push('audit trail records registration, review, and user status actions');
  console.log(`PASS: ${checks.join('; ')}`);
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  const user = await db.user.findUnique({ where: { email: testEmail }, select: { id: true } }).catch(() => null);
  if (user) {
    const requests = await db.onboardingRequest.findMany({ where: { userId: user.id }, select: { id: true } });
    await db.$transaction([
      db.auditLog.deleteMany({ where: { OR: [{ actorId: user.id }, { targetId: user.id }, { targetId: { in: requests.map(row => row.id) } }] } }),
      db.onboardingRequest.deleteMany({ where: { userId: user.id } }),
      db.user.deleteMany({ where: { id: user.id } })
    ]);
  }
  await db.$disconnect();
}
