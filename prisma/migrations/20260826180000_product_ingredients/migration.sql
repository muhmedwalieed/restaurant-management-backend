-- Per-product ingredient list (shown to guests on the table menu).
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "ingredients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
