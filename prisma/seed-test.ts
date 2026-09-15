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
  let managerEmail = process.env['E2E_TEST_EMAIL']?.trim();
  let managerPassword = process.env['E2E_TEST_PASSWORD'];
  let engineerEmail = process.env['E2E_ENGINEER_EMAIL']?.trim();
  let engineerPassword = process.env['E2E_ENGINEER_PASSWORD'];

  let shouldUpdateEnv = false;

  if (!managerEmail || !managerPassword) {
    managerEmail = managerEmail || 'manager@test.local';
    managerPassword = managerPassword || `${crypto.randomBytes(16).toString('hex')}!Aa1`;
    process.env['E2E_TEST_EMAIL'] = managerEmail;
    process.env['E2E_TEST_PASSWORD'] = managerPassword;
    shouldUpdateEnv = true;
  }

  if (!engineerEmail || !engineerPassword) {
    engineerEmail = engineerEmail || 'engineer@test.local';
    engineerPassword = engineerPassword || `${crypto.randomBytes(16).toString('hex')}!Bb2`;
    process.env['E2E_ENGINEER_EMAIL'] = engineerEmail;
    process.env['E2E_ENGINEER_PASSWORD'] = engineerPassword;
    shouldUpdateEnv = true;
  }

  if (shouldUpdateEnv) {
    const envContent = [
      '# Local E2E Test Credentials — DO NOT COMMIT',
      `E2E_TEST_EMAIL="${managerEmail}"`,
      `E2E_TEST_PASSWORD="${managerPassword}"`,
      `E2E_ENGINEER_EMAIL="${engineerEmail}"`,
      `E2E_ENGINEER_PASSWORD="${engineerPassword}"`,
      '',
    ].join('\n');

    fs.writeFileSync(envTestLocalPath, envContent, 'utf8');
  }

  // 1. Seed Manager
  const managerHash = await hashPassword(managerPassword);
  const managerSelfCheck = await verifyPassword(managerHash, managerPassword);
  if (!managerSelfCheck) {
    throw new Error('Argon2id hash verification failed for manager self-test.');
  }

  const managerUser = await prisma.user.upsert({
    where: { email: managerEmail.toLowerCase() },
    update: {
      name: 'مدير النظام التجريبي',
      role: 'MANAGER',
      isActive: true,
      deletedAt: null,
    },
    create: {
      email: managerEmail.toLowerCase(),
      name: 'مدير النظام التجريبي',
      role: 'MANAGER',
      isActive: true,
      deletedAt: null,
    },
  });

  await prisma.credential.upsert({
    where: { userId: managerUser.id },
    update: { passwordHash: managerHash },
    create: { userId: managerUser.id, passwordHash: managerHash },
  });

  // 2. Seed Engineer
  const engineerHash = await hashPassword(engineerPassword);
  const engineerSelfCheck = await verifyPassword(engineerHash, engineerPassword);
  if (!engineerSelfCheck) {
    throw new Error('Argon2id hash verification failed for engineer self-test.');
  }

  const engineerUser = await prisma.user.upsert({
    where: { email: engineerEmail.toLowerCase() },
    update: {
      name: 'مهندس الموقع التجريبي',
      role: 'ENGINEER',
      isActive: true,
      deletedAt: null,
    },
    create: {
      email: engineerEmail.toLowerCase(),
      name: 'مهندس الموقع التجريبي',
      role: 'ENGINEER',
      isActive: true,
      deletedAt: null,
    },
  });

  await prisma.credential.upsert({
    where: { userId: engineerUser.id },
    update: { passwordHash: engineerHash },
    create: { userId: engineerUser.id, passwordHash: engineerHash },
  });

  console.log('✅ Safe E2E test users successfully seeded:');
  console.log(`   Manager: ${managerUser.id} (${managerUser.email})`);
  console.log(`   Engineer: ${engineerUser.id} (${engineerUser.email})`);
}

main()
  .catch((err) => {
    console.error('❌ Failed to seed test user:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
