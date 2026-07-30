-- ⬡B:migrations.0006:GROUND:provider_spend_is_atomic_durable_truth:20260730⬡
-- One append-only transport ledger for provider INTENT and TERMINAL receipts. The composite
-- primary key is the cross-replica claim: two processes may present the same stable attempt,
-- but Postgres can insert its INTENT only once. A duplicate is never permission to resend.
--
-- No credential, prompt, response, or calculated price belongs in this table. key_alias is a
-- canonical seat or env-var NAME; request/response bodies are represented only by SHA-256.
-- actual_cost_usd remains NULL unless the provider itself reports it.

create table if not exists memory_bank.provider_spend_receipts (
  attempt_id text not null check (attempt_id ~ '^[a-f0-9]{64}$'),
  phase text not null check (phase in ('INTENT','TERMINAL')),
  ham_uid text not null,
  cycle_id text not null,
  request_id text not null,
  component text not null,
  owner_node_id text not null,
  target_wonder_id text not null,
  service_id text not null,
  provider text not null,
  operation text not null,
  model text not null,
  model_source text not null check (model_source in ('request_body','request_query','provider_route')),
  key_alias text not null,
  attempt_order integer not null check (attempt_order between 1 and 10000),
  kind text not null,
  request_digest text not null check (request_digest ~ '^[a-f0-9]{64}$'),
  response_digest text null check (response_digest is null or response_digest ~ '^[a-f0-9]{64}$'),
  provider_request_id text null,
  status_code integer null check (status_code is null or status_code between 100 and 599),
  provider_tokens jsonb null,
  actual_cost_usd numeric(18,8) null check (actual_cost_usd is null or actual_cost_usd >= 0),
  cost_source text null check (cost_source is null or cost_source = 'provider_reported'),
  disposition text not null,
  created_at timestamptz not null default now(),
  primary key (attempt_id, phase)
);

create index if not exists provider_spend_receipts_created_idx
  on memory_bank.provider_spend_receipts (created_at desc);

create index if not exists provider_spend_receipts_ham_created_idx
  on memory_bank.provider_spend_receipts (ham_uid, created_at desc);

-- Creation is deliberately unreachable. Migration 0007 installs the SECURITY DEFINER
-- admission/terminal RPCs, proves their owner and ACLs, and only then grants service_role.
revoke all on table memory_bank.provider_spend_receipts
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
