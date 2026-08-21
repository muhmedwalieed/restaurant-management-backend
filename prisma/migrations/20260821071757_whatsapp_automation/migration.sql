-- CreateEnum
CREATE TYPE "WhatsAppFlowState" AS ENUM ('WELCOME', 'MAIN_MENU', 'MENU_CATEGORY', 'PRODUCT_SELECT', 'CART', 'ADDRESS', 'CONFIRM_ORDER', 'TRACKING', 'FAQ', 'HUMAN_HANDOFF');

-- CreateEnum
CREATE TYPE "WhatsAppConversationStatus" AS ENUM ('ACTIVE', 'WAITING_AGENT', 'CLOSED');

-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "customer_id" TEXT,
    "state" "WhatsAppFlowState" NOT NULL DEFAULT 'WELCOME',
    "status" "WhatsAppConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "cart" JSONB DEFAULT '[]',
    "address" TEXT,
    "selected_category_id" TEXT,
    "last_inbound_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_conversations_restaurant_id_idx" ON "whatsapp_conversations"("restaurant_id");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_restaurant_id_status_idx" ON "whatsapp_conversations"("restaurant_id", "status");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_restaurant_id_customer_phone_idx" ON "whatsapp_conversations"("restaurant_id", "customer_phone");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_restaurant_id_connection_id_customer_key" ON "whatsapp_conversations"("restaurant_id", "connection_id", "customer_phone");

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
