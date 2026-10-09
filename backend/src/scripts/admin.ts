// Manage admin accounts. There is no public way to become an admin.
//
//   npm run admin -- list
//   npm run admin -- create <email> <full name...>   (prints a generated password once)
//   npm run admin -- promote <email>                 (existing student account -> admin)
//   npm run admin -- revoke <email>                  (admin -> student)
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db, pool } from '../db';
import { users, sessions } from '../db/schema';

const usage = () => {
  console.log(
    [
      'Usage:',
      '  npm run admin -- list',
      '  npm run admin -- create <email> <full name...>',
      '  npm run admin -- promote <email>',
      '  npm run admin -- revoke <email>',
    ].join('\n')
  );
};

const normalize = (email: string) => email.toLowerCase().trim();

// Meets the app's password rule (8+ chars, upper, lower, digit).
const generatePassword = () => `${randomBytes(12).toString('base64url')}Aa1`;

async function findUser(email: string) {
  const rows = await db.select({ id: users.id, email: users.email, role: users.role }).from(users).where(and(
    eq(users.email, normalize(email)), isNull(users.organizationId),
  )).limit(1);
  return rows[0] ?? null;
}

async function list() {
  const rows = await db
    .select({ email: users.email, name: users.name, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.role, 'admin'), isNull(users.organizationId)));
  if (rows.length === 0) return console.log('No admin accounts yet. Create one with: npm run admin -- create <email> <name>');
  console.table(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString().slice(0, 10) })));
}

async function create(email: string, name: string) {
  const normalized = normalize(email);
  if (!normalized.includes('@')) {
    console.error('Invalid email address');
    process.exitCode = 1;
    return;
  }
  if (await findUser(normalized)) {
    console.error(`${normalized} already exists in Nudra's global account realm. Use "promote" for an existing global student account.`);
    process.exitCode = 1;
    return;
  }
  const password = generatePassword();
  await db.insert(users).values({
    name: name.trim().slice(0, 255),
    email: normalized,
    passwordHash: await bcrypt.hash(password, 12),
    role: 'admin',
  });
  console.log(
    [
      `Admin created: ${normalized}`,
      `Temporary password (shown once, change it in Settings after signing in): ${password}`,
      'Sign in at /login — admins are taken to /admin.',
    ].join('\n')
  );
}

async function promote(email: string) {
  const user = await findUser(email);
  if (!user) {
    console.error(`No account found for ${email}`);
    process.exitCode = 1;
    return;
  }
  if (user.role === 'admin') return console.log(`${user.email} is already an admin.`);
  if (user.role !== 'student') {
    // Instructors own courses; turning them into admins would orphan those courses.
    console.error(`${user.email} is an instructor. Create a separate admin account instead.`);
    process.exitCode = 1;
    return;
  }
  await db.transaction(async tx=>{
    await tx.update(users).set({ role: 'admin', updatedAt: new Date() }).where(eq(users.id, user.id));
    await tx.delete(sessions).where(eq(sessions.userId,user.id));
  });
  console.log(`${user.email} -> admin`);
}

async function revoke(email: string) {
  const user = await findUser(email);
  if (!user || user.role !== 'admin') {
    console.error(`${email} is not an admin`);
    process.exitCode = 1;
    return;
  }
  await db.transaction(async (tx) => {
    await tx.update(users).set({ role: 'student', updatedAt: new Date() }).where(eq(users.id, user.id));
    // End existing sessions so the change applies immediately everywhere.
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
  });
  console.log(`${user.email} -> student (signed out of all sessions)`);
}

async function main() {
  const [command, email, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'list':
      return list();
    case 'create':
      if (!email || rest.length === 0) return usage();
      return create(email, rest.join(' '));
    case 'promote':
      if (!email) return usage();
      return promote(email);
    case 'revoke':
      if (!email) return usage();
      return revoke(email);
    default:
      usage();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
