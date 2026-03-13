-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('income', 'expense');

-- AlterTable: add type column with default
ALTER TABLE "transactions" ADD COLUMN "type" "TransactionType" NOT NULL DEFAULT 'income';

-- AlterTable: add description column
ALTER TABLE "transactions" ADD COLUMN "description" TEXT;

-- AlterTable: make client_id nullable
ALTER TABLE "transactions" ALTER COLUMN "client_id" DROP NOT NULL;

-- AlterTable: set default for payment_method
ALTER TABLE "transactions" ALTER COLUMN "payment_method" SET DEFAULT 'cash';

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_client_id_fkey";

-- AddForeignKey (nullable, SetNull on delete)
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
