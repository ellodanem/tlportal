import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.info("Seed skipped: set ADMIN_EMAIL and ADMIN_PASSWORD to create an admin user.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash, name: "Admin" },
  });

  console.info(`Seeded admin user: ${email}`);

  const planCount = await prisma.subscriptionOption.count();
  if (planCount === 0) {
    await prisma.subscriptionOption.createMany({
      data: [
        { durationMonths: 1, priceUsd: 30, isActive: true },
        { durationMonths: 3, priceUsd: 90, isActive: true },
        { durationMonths: 6, priceUsd: 180, isActive: true },
        { durationMonths: 12, priceUsd: 330, isActive: true },
      ],
    });
    console.info("Seeded default subscription options for /register.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
