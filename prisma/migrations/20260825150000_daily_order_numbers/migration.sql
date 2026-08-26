-- AlterTable: add order_date (required) and backfill existing rows from created_at
ALTER TABLE "orders" ADD COLUMN "order_date" TEXT;
UPDATE "orders" SET "order_date" = to_char("created_at", 'YYYY-MM-DD');
ALTER TABLE "orders" ALTER COLUMN "order_date" SET NOT NULL;

-- AlterTable: branch settings daily order start number
ALTER TABLE "branch_settings" ADD COLUMN "daily_order_start_number" INTEGER NOT NULL DEFAULT 200;

-- DropIndex: old unique (order_number unique forever)
DROP INDEX IF EXISTS "orders_branch_id_order_number_key";

-- CreateIndex: number unique per branch per day (resets daily)
CREATE UNIQUE INDEX "orders_branch_id_order_date_order_number_key" ON "orders"("branch_id", "order_date", "order_number");