-- AlterTable
ALTER TABLE "inbox_conversations" ADD COLUMN     "locked_at" TIMESTAMP(3),
ADD COLUMN     "locked_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "inbox_conversations" ADD CONSTRAINT "inbox_conversations_locked_by_id_fkey" FOREIGN KEY ("locked_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
