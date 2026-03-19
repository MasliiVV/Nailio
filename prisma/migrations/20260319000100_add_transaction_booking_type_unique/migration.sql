-- Prevent duplicate booking-linked transactions of the same type.
-- Sprint 1 hardening: idempotent booking completion side effects.

CREATE UNIQUE INDEX "transactions_booking_id_type_key"
  ON "transactions"("booking_id", "type");