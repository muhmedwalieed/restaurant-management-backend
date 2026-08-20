-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "paid_by_employee_id" TEXT,
ADD COLUMN     "refund_reason" TEXT,
ADD COLUMN     "refunded_at" TIMESTAMP(3),
ADD COLUMN     "refunded_by_employee_id" TEXT;
