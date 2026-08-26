-- Add a request type so staff can distinguish a bill request from a regular call
ALTER TABLE "table_session_waiter_calls" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'HELP';