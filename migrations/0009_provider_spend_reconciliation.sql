-- ⬡B:migrations.0009.provider_spend_reconciliation:FIX:provider_billing_truth_survives_response_capture_failure:20260801⬡
-- A paid OpenRouter response can expose HTTP 200 and an exact generation id while a caller
-- deadline aborts its body before inline usage reaches the receipt boundary. The existing
-- TERMINAL ledger is intentionally append-only. This creates one immutable provider fact per
-- attempt, sourced only from OpenRouter's authenticated generation API, and a canonical
-- billable view that coalesces inline facts with that one reconciliation fact. No estimate,
-- zero, completion retry, or mutable terminal is introduced.

do $provider_spend_reconciliation_owner_preflight$
declare procedure_oid oid; owner_oid oid; service_oid oid;
begin
  select oid into service_oid from pg_roles where rolname='service_role';
  procedure_oid:=to_regprocedure('public.write_anew_provider_spend_reconciliation(jsonb)');
  if procedure_oid is not null then
    select proowner into owner_oid from pg_proc where oid=procedure_oid;
    if owner_oid is null or owner_oid=service_oid
       or pg_has_role('service_role',owner_oid,'MEMBER')
       or pg_has_role('anon',owner_oid,'MEMBER')
       or pg_has_role('authenticated',owner_oid,'MEMBER') then
      raise exception using errcode='42501',
        message='A''NU provider spend reconciliation unsafe function owner';
    end if;
  end if;
end
$provider_spend_reconciliation_owner_preflight$;

do $provider_spend_reconciliation_table_install$
begin
execute $provider_spend_reconciliation_table_definition$
create table if not exists memory_bank.provider_spend_reconciliations (
  attempt_id text primary key check (attempt_id ~ '^[a-f0-9]{64}$'),
  provider_request_id text not null unique,
  provider_tokens jsonb not null,
  actual_cost_usd numeric(18,8) not null check (actual_cost_usd >= 0),
  cost_source text not null check (cost_source='provider_reported'),
  reconciliation_source text not null check (reconciliation_source='openrouter_generation_api'),
  provider_fact_digest text not null check (provider_fact_digest ~ '^[a-f0-9]{64}$'),
  provider_model text null,
  provider_name text null,
  created_at timestamptz not null default now()
);
$provider_spend_reconciliation_table_definition$;
  execute 'alter table memory_bank.provider_spend_reconciliations enable row level security';
  execute 'revoke all on table memory_bank.provider_spend_reconciliations '
    'from public,anon,authenticated,service_role';
  execute 'grant select on table memory_bank.provider_spend_reconciliations to service_role';
end
$provider_spend_reconciliation_table_install$;

do $provider_spend_reconciliation_install$
declare procedure_oid oid; owner_oid oid; caller_name text;
begin
execute $provider_spend_reconciliation_definition$
create or replace function public.write_anew_provider_spend_reconciliation(
  p_fact jsonb
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,pg_temp
as $function$
declare terminal_row memory_bank.provider_spend_receipts%rowtype;
  existing memory_bank.provider_spend_reconciliations%rowtype;
  cost_value numeric(18,8);
begin
  if p_fact is null or jsonb_typeof(p_fact)<>'object'
     or not (p_fact ?& array['attempt_id','provider_request_id','provider_tokens',
       'actual_cost_usd','cost_source','provider_fact_digest','provider_model',
       'provider_name','reconciliation_source'])
     or p_fact->>'attempt_id' !~ '^[a-f0-9]{64}$'
     or p_fact->>'provider_request_id' !~ '^gen-[A-Za-z0-9._:/-]{1,236}$'
     or p_fact->'provider_tokens' is null
     or jsonb_typeof(p_fact->'provider_tokens')<>'object'
     or p_fact->>'actual_cost_usd' !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
     or p_fact->>'cost_source'<>'provider_reported'
     or p_fact->>'reconciliation_source'<>'openrouter_generation_api'
     or p_fact->>'provider_fact_digest' !~ '^[a-f0-9]{64}$'
     or (nullif(p_fact->>'provider_model','') is not null and
       p_fact->>'provider_model' !~ '^[A-Za-z0-9._:/-]{1,240}$')
     or (nullif(p_fact->>'provider_name','') is not null and
       (char_length(p_fact->>'provider_name')>160 or
        p_fact->>'provider_name' ~ '[[:cntrl:]]')) then
    return jsonb_build_object('ok',false,'reason','provider_spend_reconciliation_input_invalid');
  end if;
  cost_value:=(p_fact->>'actual_cost_usd')::numeric(18,8);
  perform pg_advisory_xact_lock(hashtextextended('anew.provider-spend-daily.v1',0));
  select * into terminal_row from memory_bank.provider_spend_receipts
    where attempt_id=p_fact->>'attempt_id' and phase='TERMINAL';
  if not found or terminal_row.provider<>'openrouter'
     or terminal_row.disposition<>'SUCCEEDED'
     or terminal_row.status_code not between 200 and 299
     or terminal_row.provider_tokens is not null
     or terminal_row.actual_cost_usd is not null
     or terminal_row.cost_source is not null
     or terminal_row.provider_request_id<>p_fact->>'provider_request_id' then
    return jsonb_build_object('ok',false,'reason','provider_spend_reconciliation_terminal_mismatch');
  end if;
  select * into existing from memory_bank.provider_spend_reconciliations
    where attempt_id=p_fact->>'attempt_id';
  if found then
    if existing.provider_request_id<>p_fact->>'provider_request_id'
       or existing.provider_tokens<>p_fact->'provider_tokens'
       or existing.actual_cost_usd<>cost_value
       or existing.cost_source<>'provider_reported'
       or existing.reconciliation_source<>'openrouter_generation_api'
       or existing.provider_fact_digest<>p_fact->>'provider_fact_digest'
       or existing.provider_model is distinct from nullif(p_fact->>'provider_model','')
       or existing.provider_name is distinct from nullif(p_fact->>'provider_name','') then
      return jsonb_build_object('ok',false,'reason','provider_spend_reconciliation_conflict');
    end if;
    return jsonb_build_object('ok',true,'stored',true,'inserted',false,
      'attempt_id',existing.attempt_id);
  end if;
  insert into memory_bank.provider_spend_reconciliations
    (attempt_id,provider_request_id,provider_tokens,actual_cost_usd,cost_source,
      reconciliation_source,provider_fact_digest,provider_model,provider_name)
  values
    (p_fact->>'attempt_id',p_fact->>'provider_request_id',p_fact->'provider_tokens',
      cost_value,'provider_reported','openrouter_generation_api',
      p_fact->>'provider_fact_digest',nullif(p_fact->>'provider_model',''),
      nullif(p_fact->>'provider_name',''));
  return jsonb_build_object('ok',true,'stored',true,'inserted',true,
    'attempt_id',p_fact->>'attempt_id');
exception when unique_violation then
  return jsonb_build_object('ok',false,'reason','provider_spend_reconciliation_conflict');
end
$function$;
$provider_spend_reconciliation_definition$;
  execute 'revoke all on function public.write_anew_provider_spend_reconciliation(jsonb) '
    'from public,anon,authenticated,service_role';
  procedure_oid:=to_regprocedure('public.write_anew_provider_spend_reconciliation(jsonb)');
  select proowner into owner_oid from pg_proc where oid=procedure_oid;
  for caller_name in
    select role.rolname from pg_proc proc
      cross join lateral aclexplode(coalesce(proc.proacl,acldefault('f',proc.proowner))) acl
      join pg_roles role on role.oid=acl.grantee
      where proc.oid=procedure_oid and acl.privilege_type='EXECUTE'
        and acl.grantee<>owner_oid
  loop
    execute format('revoke all on function %s from %I',procedure_oid::regprocedure,caller_name);
  end loop;
  execute 'grant execute on function public.write_anew_provider_spend_reconciliation(jsonb) '
    'to service_role';
end
$provider_spend_reconciliation_install$;

do $provider_spend_billable_view_install$
begin
execute $provider_spend_billable_view_definition$
create or replace view memory_bank.provider_spend_receipts_billable
with (security_invoker=true) as
select receipt.attempt_id,receipt.phase,receipt.ham_uid,receipt.cycle_id,
  receipt.request_id,receipt.component,receipt.owner_node_id,receipt.target_wonder_id,
  receipt.service_id,receipt.provider,receipt.operation,receipt.model,receipt.model_source,
  receipt.key_alias,receipt.attempt_order,receipt.kind,receipt.request_digest,
  receipt.response_digest,receipt.provider_request_id,receipt.status_code,
  coalesce(receipt.provider_tokens,fact.provider_tokens) as provider_tokens,
  coalesce(receipt.actual_cost_usd,fact.actual_cost_usd) as actual_cost_usd,
  coalesce(receipt.cost_source,fact.cost_source) as cost_source,
  receipt.disposition,receipt.created_at,
  case when receipt.actual_cost_usd is not null then 'inline_provider_response'
    when fact.actual_cost_usd is not null then fact.reconciliation_source
    else null end as billing_fact_source,
  fact.provider_fact_digest,fact.provider_model,fact.provider_name,
  fact.created_at as reconciled_at
from memory_bank.provider_spend_receipts receipt
left join memory_bank.provider_spend_reconciliations fact
  on fact.attempt_id=receipt.attempt_id and receipt.phase='TERMINAL';
$provider_spend_billable_view_definition$;
  execute 'revoke all on table memory_bank.provider_spend_receipts_billable '
    'from public,anon,authenticated,service_role';
  execute 'grant select on table memory_bank.provider_spend_receipts_billable to service_role';
end
$provider_spend_billable_view_install$;

do $provider_spend_reconciliation_acl_assert$
declare procedure_oid oid; owner_oid oid; service_oid oid;
begin
  select oid into service_oid from pg_roles where rolname='service_role';
  procedure_oid:=to_regprocedure('public.write_anew_provider_spend_reconciliation(jsonb)');
  select proowner into owner_oid from pg_proc where oid=procedure_oid;
  if procedure_oid is null or owner_oid is null or owner_oid=service_oid
     or pg_has_role('service_role',owner_oid,'MEMBER')
     or has_function_privilege('anon',procedure_oid,'EXECUTE')
     or has_function_privilege('authenticated',procedure_oid,'EXECUTE')
     or not has_function_privilege('service_role',procedure_oid,'EXECUTE')
     or exists(select 1 from pg_proc proc
       cross join lateral aclexplode(coalesce(proc.proacl,acldefault('f',proc.proowner))) acl
       where proc.oid=procedure_oid and acl.privilege_type='EXECUTE'
         and acl.grantee not in (owner_oid,service_oid))
     or has_table_privilege('service_role','memory_bank.provider_spend_reconciliations','INSERT')
     or has_table_privilege('service_role','memory_bank.provider_spend_reconciliations','UPDATE')
     or has_table_privilege('service_role','memory_bank.provider_spend_reconciliations','DELETE')
     or not has_table_privilege('service_role','memory_bank.provider_spend_reconciliations','SELECT') then
    raise exception using errcode='42501',
      message='A''NU provider spend reconciliation privilege isolation failed';
  end if;
end
$provider_spend_reconciliation_acl_assert$;

notify pgrst,'reload schema';
