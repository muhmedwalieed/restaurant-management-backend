-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE');

-- CreateTable
CREATE TABLE "tables" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
    "qr_token" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tables_qr_token_key" ON "tables"("qr_token");

-- CreateIndex
CREATE INDEX "tables_restaurant_id_idx" ON "tables"("restaurant_id");

-- CreateIndex
CREATE INDEX "tables_branch_id_idx" ON "tables"("branch_id");

-- CreateIndex
CREATE INDEX "tables_branch_id_status_idx" ON "tables"("branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tables_branch_id_label_key" ON "tables"("branch_id", "label");

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
