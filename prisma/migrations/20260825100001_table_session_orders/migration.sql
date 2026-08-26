-- CreateEnum
CREATE TYPE "TableSessionOrderStatus" AS ENUM ('AWAITING_CONFIRMATION', 'CONFIRMED', 'CANCELLED');

-- AlterTable
ALTER TABLE "table_session_items" ADD COLUMN     "session_order_id" TEXT;

-- CreateTable
CREATE TABLE "table_session_orders" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "order_number" INTEGER NOT NULL,
    "status" "TableSessionOrderStatus" NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "order_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_session_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "table_session_orders_session_id_idx" ON "table_session_orders"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "table_session_orders_session_id_order_number_key" ON "table_session_orders"("session_id", "order_number");

-- AddForeignKey
ALTER TABLE "table_session_items" ADD CONSTRAINT "table_session_items_session_order_id_fkey" FOREIGN KEY ("session_order_id") REFERENCES "table_session_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_session_orders" ADD CONSTRAINT "table_session_orders_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "table_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
