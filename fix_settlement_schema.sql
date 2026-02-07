-- Add 'cancelled' to the allowed statuses
ALTER TABLE settlement_details DROP CONSTRAINT IF EXISTS settlement_details_settlement_status_check;

ALTER TABLE settlement_details ADD CONSTRAINT settlement_details_settlement_status_check 
CHECK (settlement_status IN ('pending_utr', 'pending_confirmation', 'confirmed', 'disputed', 'cancelled'));

-- Add cancellation reason column
ALTER TABLE settlement_details ADD COLUMN IF NOT EXISTS cancellation_reason text;
