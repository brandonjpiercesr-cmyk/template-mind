-- ⬡B:migrations.0010:DDL:signing_records_for_the_document_portal:20260807⬡
-- The durable home for executed agreements signed through routes/sign.routes.js.
-- One row per execution: who signed, the exact signature bytes, the hash of the
-- exact agreement text they signed, and the delivery receipt for the emailed
-- executed PDF. Idempotent by law of core/migrate.js: exec_sql re-applies every
-- migration on each run, so everything here is IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS memory_bank.signing_records (
  id uuid PRIMARY KEY,
  ham_uid text NOT NULL,
  agreement_key text NOT NULL,
  signer jsonb NOT NULL,
  signature_jpeg_base64 text,
  typed_signature text,
  agreement_sha256 text NOT NULL,
  pdf_sha256 text,
  ip text,
  user_agent text,
  signed_at timestamptz NOT NULL,
  email_receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signing_records_ham_signed_idx
  ON memory_bank.signing_records (ham_uid, signed_at DESC);
