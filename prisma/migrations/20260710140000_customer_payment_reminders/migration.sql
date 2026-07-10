-- AlterTable
CREATE TYPE "PaymentRemindersPreference" AS ENUM ('auto', 'on', 'off');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "paymentReminders" "PaymentRemindersPreference" NOT NULL DEFAULT 'auto';
