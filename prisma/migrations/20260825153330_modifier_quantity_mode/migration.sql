-- AlterTable
ALTER TABLE "product_modifiers" ADD COLUMN     "max_quantity" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "quantity_mode" TEXT NOT NULL DEFAULT 'SINGLE';
