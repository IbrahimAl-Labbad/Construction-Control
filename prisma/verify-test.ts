import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const prisma = new PrismaClient();

async function check() {
  const u = await prisma.user.findUnique({
    where: { email: 'manager@test.local' },
    include: { credential: true },
  });

  console.log('REAL POSTGRESQL DATABASE VERIFICATION:');
  console.log('User Exists:', !!u);
  console.log('User ID:', u ? u.id : 'N/A');
  console.log('Email:', u ? u.email : 'N/A');
  console.log('Role:', u ? u.role : 'N/A');
  console.log('isActive:', u ? u.isActive : 'N/A');
  console.log('deletedAt:', u ? u.deletedAt : 'N/A');
  console.log('Credential Exists:', !!u?.credential);
  console.log('Credential UserId Match:', u?.credential?.userId === u?.id);
  console.log('Password Hash Format Valid (Argon2id):', typeof u?.credential?.passwordHash === 'string' && u.credential.passwordHash.startsWith('$argon2id$'));
  await prisma.$disconnect();
}

check().catch((e) => {
  console.error(e);
  process.exit(1);
});
