import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { DEFAULT_SUPER_ADMIN_EMAIL } from "../lib/auth/constants";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SUPER_ADMIN_EMAIL?.trim() || process.env.ADMIN_EMAIL?.trim() || DEFAULT_SUPER_ADMIN_EMAIL).toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;

  if (!password) {
    console.info("Seed skipped: set SUPER_ADMIN_PASSWORD (or ADMIN_PASSWORD) to create/update the super admin user.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash, name: "Super Admin" },
  });

  console.info(`Seeded super admin user: ${email}`);

  const planCount = await prisma.subscriptionOption.count();
  if (planCount === 0) {
    await prisma.subscriptionOption.createMany({
      data: [
        { durationMonths: 1, priceXcd: 30, isActive: true },
        { durationMonths: 3, priceXcd: 90, isActive: true },
        { durationMonths: 6, priceXcd: 180, isActive: true },
        { durationMonths: 12, priceXcd: 330, isActive: true },
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
