-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "city" TEXT,
ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "postal_code" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "street" TEXT;

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "logo_url" TEXT,
ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "working_hours" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "day" "Weekday" NOT NULL,
    "open_time" TEXT NOT NULL,
    "close_time" TEXT NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "working_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_settings" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "currency" TEXT,
    "timezone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "working_hours_restaurant_id_idx" ON "working_hours"("restaurant_id");

-- CreateIndex
CREATE INDEX "working_hours_branch_id_idx" ON "working_hours"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "working_hours_branch_id_day_key" ON "working_hours"("branch_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "branch_settings_branch_id_key" ON "branch_settings"("branch_id");

-- CreateIndex
CREATE INDEX "branch_settings_restaurant_id_idx" ON "branch_settings"("restaurant_id");

-- AddForeignKey
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_settings" ADD CONSTRAINT "branch_settings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_settings" ADD CONSTRAINT "branch_settings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
