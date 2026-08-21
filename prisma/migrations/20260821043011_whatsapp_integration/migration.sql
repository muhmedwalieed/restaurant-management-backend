-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ConnectionProvider" AS ENUM ('META', 'MOCK');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'MEDIA');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "whatsapp_connections" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "provider" "ConnectionProvider" NOT NULL DEFAULT 'META',
    "provider_account_id" TEXT NOT NULL,
    "provider_phone_number_id" TEXT NOT NULL,
    "display_name" TEXT,
    "webhook_secret" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "from_phone" TEXT NOT NULL,
    "to_phone" TEXT NOT NULL,
    "content" TEXT,
    "media_url" TEXT,
    "provider_message_id" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "provider" "ConnectionProvider" NOT NULL DEFAULT 'META',
    "raw_payload" JSONB NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_connections_restaurant_id_idx" ON "whatsapp_connections"("restaurant_id");

-- CreateIndex
CREATE INDEX "whatsapp_connections_provider_phone_number_id_idx" ON "whatsapp_connections"("provider_phone_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connections_restaurant_id_provider_account_id_key" ON "whatsapp_connections"("restaurant_id", "provider_account_id");

-- CreateIndex
CREATE INDEX "whatsapp_messages_restaurant_id_created_at_idx" ON "whatsapp_messages"("restaurant_id", "created_at");

-- CreateIndex
CREATE INDEX "whatsapp_messages_restaurant_id_direction_idx" ON "whatsapp_messages"("restaurant_id", "direction");

-- CreateIndex
CREATE INDEX "whatsapp_messages_restaurant_id_status_idx" ON "whatsapp_messages"("restaurant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_restaurant_id_provider_message_id_key" ON "whatsapp_messages"("restaurant_id", "provider_message_id");

-- CreateIndex
CREATE INDEX "webhook_events_restaurant_id_idx" ON "webhook_events"("restaurant_id");

-- CreateIndex
CREATE INDEX "webhook_events_restaurant_id_status_idx" ON "webhook_events"("restaurant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_restaurant_id_event_id_key" ON "webhook_events"("restaurant_id", "event_id");

-- AddForeignKey
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
