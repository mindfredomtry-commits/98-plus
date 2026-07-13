-- Index to support stale-payment cleanup (expireStalePayments):
-- filters on status IN ('CREATED','PENDING') AND expiresAt <= now().
CREATE INDEX "Payment_status_expiresAt_idx" ON "Payment"("status", "expiresAt");
