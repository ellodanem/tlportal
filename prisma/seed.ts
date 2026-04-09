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

  const hasModel = await prisma.deviceModel.findFirst({ select: { id: true } });
  if (!hasModel) {
    await prisma.deviceModel.create({
      data: {
        name: "Generic tracker",
        manufacturer: "Various",
        retailPrice: 0,
        isActive: true,
      },
    });
    console.info("Seeded default device model: Generic tracker");
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
