/**
 * Prisma seed — demo data for development
 *
 * Usage: npx ts-node prisma/seed.ts
 * Or:    npm run prisma:seed
 */

import { PrismaClient, OnboardingStatus, SubscriptionStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Nailio database...');

  // ─── Demo User (platform owner / admin) ───
  const adminUser = await prisma.user.upsert({
    where: { telegramId: BigInt(100000001) },
    update: {},
    create: {
      telegramId: BigInt(100000001),
      firstName: 'Admin',
      lastName: 'Nailio',
      username: 'nailio_admin',
      languageCode: 'uk',
    },
  });
  console.log('  ✅ Admin user created:', adminUser.id);

  // ─── Demo Master User ───
  const masterUser = await prisma.user.upsert({
    where: { telegramId: BigInt(100000002) },
    update: {},
    create: {
      telegramId: BigInt(100000002),
      firstName: 'Олена',
      lastName: 'Коваленко',
      username: 'olena_nails',
      languageCode: 'uk',
    },
  });
  console.log('  ✅ Demo master user created:', masterUser.id);

  // ─── Demo Tenant (Master's salon) ───
  const tenant = await prisma.tenant.upsert({
    where: { id: masterUser.id }, // Will create with a specific slug
    update: {},
    create: {
      ownerId: masterUser.id,
      slug: 'olena-nails',
      displayName: 'Манікюр Олена',
      onboardingStatus: OnboardingStatus.setup_complete,
      settings: {
        timezone: 'Europe/Kyiv',
        language: 'uk',
        slotDuration: 30,
        cancellationWindowHours: 3,
        bufferMinutes: 15,
      },
      branding: {
        primaryColor: '#EC4899',
        welcomeText: 'Вітаю! Запишіться на манікюр 💅',
      },
    },
  });
  console.log('  ✅ Demo tenant created:', tenant.id, '— slug:', tenant.slug);

  // ─── Demo Services ───
  const services = [
    {
      tenantId: tenant.id,
      name: 'Класичний манікюр',
      description: 'Манікюр з покриттям гель-лаком',
      durationMinutes: 60,
      price: 80000, // 800 UAH in kopecks
      currency: 'UAH',
      color: '#E91E63',
      sortOrder: 1,
    },
    {
      tenantId: tenant.id,
      name: 'Нарощування нігтів',
      description: 'Гелеве нарощування з дизайном',
      durationMinutes: 120,
      price: 150000,
      currency: 'UAH',
      color: '#9C27B0',
      sortOrder: 2,
    },
    {
      tenantId: tenant.id,
      name: 'Зняття + манікюр',
      description: 'Зняття старого покриття та новий манікюр',
      durationMinutes: 90,
      price: 100000,
      currency: 'UAH',
      color: '#FF5722',
      sortOrder: 3,
    },
  ];

  for (const svc of services) {
    await prisma.service.create({ data: svc });
  }
  console.log(`  ✅ ${services.length} demo services created`);

  // ─── Demo Working Hours (Mon-Fri 9-18, Sat 10-15) ───
  const workingHours = [
    { tenantId: tenant.id, dayOfWeek: 0, startTime: '09:00', endTime: '18:00' },
    { tenantId: tenant.id, dayOfWeek: 1, startTime: '09:00', endTime: '18:00' },
    { tenantId: tenant.id, dayOfWeek: 2, startTime: '09:00', endTime: '18:00' },
    { tenantId: tenant.id, dayOfWeek: 3, startTime: '09:00', endTime: '18:00' },
    { tenantId: tenant.id, dayOfWeek: 4, startTime: '09:00', endTime: '18:00' },
    { tenantId: tenant.id, dayOfWeek: 5, startTime: '10:00', endTime: '15:00' },
  ];

  for (const wh of workingHours) {
    await prisma.workingHours.create({ data: wh });
  }
  console.log('  ✅ Working hours set (Mon-Fri 9-18, Sat 10-15)');

  // ─── Demo Subscription (trial) ───
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      status: SubscriptionStatus.trial,
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 days
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      priceUsd: 1000, // $10.00 in cents
    },
  });
  console.log('  ✅ Trial subscription created (7 days)');

  // ─── Demo Client User ───
  const clientUser = await prisma.user.upsert({
    where: { telegramId: BigInt(100000003) },
    update: {},
    create: {
      telegramId: BigInt(100000003),
      firstName: 'Марія',
      lastName: 'Петренко',
      username: 'maria_p',
      languageCode: 'uk',
    },
  });

  await prisma.client.create({
    data: {
      tenantId: tenant.id,
      userId: clientUser.id,
      firstName: 'Марія',
      lastName: 'Петренко',
      phone: '+380671234567',
    },
  });
  console.log('  ✅ Demo client created:', clientUser.id);

  console.log('\n🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
