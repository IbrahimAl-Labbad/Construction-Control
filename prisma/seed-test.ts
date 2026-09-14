/**
 * prisma/seed-test.ts
 *
 * Dedicated local E2E test user seeding script.
 * Creates/updates a single test user with role MANAGER.
 *
 * Requirements:
 * - Role: MANAGER
 * - isActive: true
 * - deletedAt: null
 * - Single Credential record hashed with Argon2id
 * - Uses credentials from .env.test.local (or generates a secure one if missing)
 * - Safe logging: NEVER prints password or password hash
 */

import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from '../lib/auth/password';

// Load test env
const envTestLocalPath = path.resolve(process.cwd(), '.env.test.local');
const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envTestLocalPath)) {
  dotenv.config({ path: envTestLocalPath });
}
dotenv.config({ path: envPath });

const prisma = new PrismaClient();

async function main() {
  let email = process.env['E2E_TEST_EMAIL']?.trim();
  let password = process.env['E2E_TEST_PASSWORD'];

  // If no credentials in environment, generate and write to .env.test.local
  if (!email || !password) {
    email = email || 'manager@test.local';
    // Generate high-entropy password satisfying OWASP / complexity guidelines
    password = password || `${crypto.randomBytes(16).toString('hex')}!Aa1`;

    const envContent = [
      '# Local E2E Test Credentials — DO NOT COMMIT',
      `E2E_TEST_EMAIL="${email}"`,
      `E2E_TEST_PASSWORD="${password}"`,
      '',
    ].join('\n');

    fs.writeFileSync(envTestLocalPath, envContent, 'utf8');
    // Set for current process
    process.env['E2E_TEST_EMAIL'] = email;
    process.env['E2E_TEST_PASSWORD'] = password;
  }

  const normalizedEmail = email.toLowerCase();

  // 1. Hash password with OWASP Argon2id
  const passwordHash = await hashPassword(password);

  // Quick sanity check: verify hash against password
  const selfCheck = await verifyPassword(passwordHash, password);
  if (!selfCheck) {
    throw new Error('Argon2id hash verification failed self-test.');
  }

  // 2. Upsert test user
  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      name: 'مدير النظام التجريبي',
      role: 'MANAGER',
      isActive: true,
      deletedAt: null,
    },
    create: {
      email: normalizedEmail,
      name: 'مدير النظام التجريبي',
      role: 'MANAGER',
      isActive: true,
      deletedAt: null,
    },
  });

  // 3. Upsert credential
  await prisma.credential.upsert({
    where: { userId: user.id },
    update: {
      passwordHash,
    },
    create: {
      userId: user.id,
      passwordHash,
    },
  });

  // 4. Safe output (strictly no secret/hash)
  console.log('✅ Safe E2E test user successfully seeded:');
  console.log(`   User ID: ${user.id}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Role: ${user.role}`);
  console.log(`   Active: ${user.isActive}`);
  console.log(`   Soft-deleted: ${user.deletedAt === null ? 'No' : 'Yes'}`);
  console.log('   Credential: 1 (Argon2id verified)');
}

main()
  .catch((err) => {
    console.error('❌ Failed to seed test user:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
