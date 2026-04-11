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
        { label: "Monthly - $30 (Debit/Credit Only)", sortOrder: 10, isActive: true },
        { label: "3 Months - $90", sortOrder: 20, isActive: true },
        { label: "6 Months - $180", sortOrder: 30, isActive: true },
        { label: "12 Months - $330", sortOrder: 40, isActive: true },
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
