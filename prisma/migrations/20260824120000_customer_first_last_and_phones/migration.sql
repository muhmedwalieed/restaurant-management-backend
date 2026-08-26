-- Drop the customer email column (requirement: customers no longer have an email)
ALTER TABLE "customers" DROP COLUMN "email";

-- Add first/last name columns (nullable in DB; enforced as required at the app layer)
ALTER TABLE "customers" ADD COLUMN "first_name" TEXT;
ALTER TABLE "customers" ADD COLUMN "last_name" TEXT;

-- Backfill first_name from the existing full name
UPDATE "customers" SET "first_name" = "name" WHERE "first_name" IS NULL;

-- Replace the name search index with a first-name index
DROP INDEX "customers_restaurant_id_name_idx";
CREATE INDEX "customers_restaurant_id_first_name_idx" ON "customers"("restaurant_id", "first_name");

-- Multi-phone support: a customer can have more than one phone number
CREATE TABLE "customer_phones" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_phones_pkey" PRIMARY KEY ("id")
);

-- Seed one default phone row per existing customer from their primary phone
INSERT INTO "customer_phones" ("id", "restaurant_id", "customer_id", "phone", "is_default", "created_at", "updated_at")
SELECT "id", "restaurant_id", "id", "phone", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "customers";

CREATE UNIQUE INDEX "customer_phones_restaurant_id_phone_key" ON "customer_phones"("restaurant_id", "phone");
CREATE INDEX "customer_phones_restaurant_id_idx" ON "customer_phones"("restaurant_id");
CREATE INDEX "customer_phones_customer_id_idx" ON "customer_phones"("customer_id");

ALTER TABLE "customer_phones" ADD CONSTRAINT "customer_phones_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_phones" ADD CONSTRAINT "customer_phones_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;