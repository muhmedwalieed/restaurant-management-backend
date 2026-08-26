-- CreateTable
CREATE TABLE "table_session_waiter_calls" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "requester_name" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "accepted_by_employee_id" TEXT,
    "accepted_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_session_waiter_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "table_session_waiter_calls_session_id_status_idx" ON "table_session_waiter_calls"("session_id", "status");

-- CreateIndex
CREATE INDEX "table_session_waiter_calls_restaurant_id_branch_id_status_idx" ON "table_session_waiter_calls"("restaurant_id", "branch_id", "status");

-- AddForeignKey
ALTER TABLE "table_session_waiter_calls" ADD CONSTRAINT "table_session_waiter_calls_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "table_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_session_waiter_calls" ADD CONSTRAINT "table_session_waiter_calls_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "table_session_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;