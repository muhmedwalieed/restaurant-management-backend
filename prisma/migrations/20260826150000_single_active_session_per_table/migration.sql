-- Close duplicate active sessions so each table keeps at most one active session
-- (the oldest one carries the order history).
UPDATE "table_sessions"
SET status = 'CLOSED', closed_at = COALESCE(closed_at, NOW())
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY restaurant_id, table_id
      ORDER BY created_at ASC
    ) AS rn
    FROM "table_sessions"
    WHERE status IN ('ACTIVE', 'AWAITING_CONFIRMATION', 'CONFIRMED')
  ) ranked
  WHERE rn > 1
);

-- Hard guarantee: at most one active session per table, enforced by the DB.
CREATE UNIQUE INDEX "table_sessions_single_active_per_table"
ON "table_sessions" (restaurant_id, table_id)
WHERE status IN ('ACTIVE', 'AWAITING_CONFIRMATION', 'CONFIRMED');