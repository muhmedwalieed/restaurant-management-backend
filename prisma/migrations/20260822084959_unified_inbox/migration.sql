-- CreateEnum
CREATE TYPE "InboxStatus" AS ENUM ('WAITING', 'ACTIVE', 'PENDING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "InboxSenderType" AS ENUM ('AGENT', 'CUSTOMER', 'SYSTEM');

-- CreateTable
CREATE TABLE "inbox_conversations" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "whatsapp_conversation_id" TEXT,
    "customer_id" TEXT,
    "customer_phone" TEXT NOT NULL,
    "assigned_agent_id" TEXT,
    "related_order_id" TEXT,
    "status" "InboxStatus" NOT NULL DEFAULT 'WAITING',
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbox_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_messages" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "senderType" "InboxSenderType" NOT NULL DEFAULT 'AGENT',
    "content" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "agent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inbox_conversations_whatsapp_conversation_id_key" ON "inbox_conversations"("whatsapp_conversation_id");

-- CreateIndex
CREATE INDEX "inbox_conversations_restaurant_id_idx" ON "inbox_conversations"("restaurant_id");

-- CreateIndex
CREATE INDEX "inbox_conversations_restaurant_id_status_idx" ON "inbox_conversations"("restaurant_id", "status");

-- CreateIndex
CREATE INDEX "inbox_conversations_restaurant_id_assigned_agent_id_idx" ON "inbox_conversations"("restaurant_id", "assigned_agent_id");

-- CreateIndex
CREATE INDEX "inbox_conversations_restaurant_id_whatsapp_conversation_id_idx" ON "inbox_conversations"("restaurant_id", "whatsapp_conversation_id");

-- CreateIndex
CREATE INDEX "inbox_messages_restaurant_id_idx" ON "inbox_messages"("restaurant_id");

-- CreateIndex
CREATE INDEX "inbox_messages_conversation_id_idx" ON "inbox_messages"("conversation_id");

-- AddForeignKey
ALTER TABLE "inbox_conversations" ADD CONSTRAINT "inbox_conversations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_conversations" ADD CONSTRAINT "inbox_conversations_whatsapp_conversation_id_fkey" FOREIGN KEY ("whatsapp_conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_conversations" ADD CONSTRAINT "inbox_conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_conversations" ADD CONSTRAINT "inbox_conversations_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "inbox_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
