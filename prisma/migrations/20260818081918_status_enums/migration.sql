/*
  Warnings:

  - The `status` column on the `branches` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `restaurants` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "RestaurantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "branches" DROP COLUMN "status",
ADD COLUMN     "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "restaurants" DROP COLUMN "status",
ADD COLUMN     "status" "RestaurantStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "branches_restaurant_id_status_idx" ON "branches"("restaurant_id", "status");

-- CreateIndex
CREATE INDEX "restaurants_status_idx" ON "restaurants"("status");
