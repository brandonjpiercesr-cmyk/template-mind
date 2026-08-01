-- ⬡B:migrations.0008.provider_spend_unlimited_ceiling:FIX:a_no_maximum_ceiling_cannot_be_smuggled_through_a_coder_bound:20260801⬡
-- CATHY (Codex) review, 20260801, on anew#1494: core/ceiling.owner.js and core/spend.guard.js
-- now honestly report a daily call ceiling as EITHER a real founder number of ANY size,
-- unclamped, OR unlimited:true (nothing configured). This RPC's own p_ceiling had a hard
-- coder-picked bound of 1..10000 from before that ceiling ownership work existed, so a
-- founder who removed his call ceiling (the whole point of that PR) or simply typed a real
-- number above ten thousand got every paid provider call refused with
-- provider_spend_ceiling_invalid or daily_spend_ceiling_reached, the exact trap class that PR
-- exists to end.
--
-- ⬡B:migrations.0008.provider_spend_unlimited_ceiling:911:the_trap_came_back_one_layer_down:20260801⬡
-- SECOND CATHY (Codex) review, same day, on this migration's own FIRST version: it moved the
-- bound from the coder-picked 10000 up to 2147483647, this column's `integer` type's own
-- physical max, and called that a hardware fact rather than a picked threshold. True of the
-- storage type, and still wrong, because core/ceiling.owner.js publishes any safe JavaScript
-- integer up to Number.MAX_SAFE_INTEGER (9007199254740991, ~9.007e15) as a real, enforced,
-- founder-chosen number, not merely up to an `integer` column's ~2.1e9. A founder who set
-- DAILY_MODEL_CALL_CEIL=4000000000 (4 billion, comfortably inside what the guard reads and
-- PUBLISHES as chosen_by:'the founder', enforced:true) would have had that exact value
-- rejected by an `integer` parameter: the identical defect this whole PR exists to kill, one
-- layer further down the stack. THE FIX, aligning the STORAGE TYPE to the published range
-- instead of moving the validator bound again: p_ceiling is now `bigint`, comfortably above
-- Number.MAX_SAFE_INTEGER (bigint's own real max is 9223372036854775807), so the accepted
-- range is identical end to end and the bound is a physical fact at every layer, not a number
-- any coder picked at either end. A Postgres function's parameter TYPE is part of its
-- identity, so CREATE OR REPLACE with a new type would add a SECOND overloaded function and
-- leave the old (jsonb,integer) one reachable and ambiguous; this migration DROPS the old
-- signature explicitly before creating the new one, so exactly one version of this function
-- ever exists.
--
-- Two behavioral changes, both narrowly scoped to claim_anew_provider_spend_intent, nothing
-- else in this ledger moves:
--   1. p_ceiling may now be SQL NULL, meaning no ceiling is in force. The admission count
--      check is skipped entirely when it is null, rather than trying to persist a sentinel
--      integer.
--   2. A real, non-null p_ceiling is checked against 9007199254740991
--      (Number.MAX_SAFE_INTEGER), the exact same edge core/ceiling.owner.js already publishes
--      to on the JavaScript side, replacing the old 10000 literal.
--
-- Every other clause of this function, including all of its input shape validation, is
-- unchanged from migrations/0007. The owner/grant preflight and postflight from 0007 are
-- re-run here anyway, against the new signature, at negligible cost, so this migration proves
-- the same isolation guarantees on its own rather than trusting them to have survived a type
-- change.

-- ⬡B:migrations.0008.provider_spend_unlimited_ceiling:911:the_migration_was_not_idempotent:20260801⬡
-- CATHY (Codex) review, third pass, 20260801: this preflight REQUIRED the pre-migration
-- (jsonb,integer) signature to exist, and raised if it did not. core/migrate.js reapplies
-- every migration file on EVERY invocation (its own documented contract: "the runner simply
-- re-applies every migration on each invocation; idempotent statements make that safe"), and
-- halts at the first failed statement. After this migration's own DROP+CREATE ran once, only
-- (jsonb,bigint) exists; the SECOND run of this exact preflight then raised on the absent
-- (jsonb,integer) signature its own prior success had removed, permanently bricking this
-- migration and every migration listed after it in the same run. Reproduced directly against
-- a real scratch Postgres 16 database: first run succeeds, second run raises exactly
-- "A'NU provider spend claim function missing before unlimited-ceiling repair" with the
-- original preflight, confirmed fixed by running it a third time after this fix with the
-- corrected preflight below.
--
-- Migrations/0007's own preflight already gets this right and is the pattern this now
-- follows: it checks owner safety WHEN a signature is present and never REQUIRES one to
-- exist, so a preflight can never be defeated by the very success it exists to gate. This
-- checks BOTH possible signatures (integer, the pre-migration shape; bigint, the
-- post-migration shape) and validates whichever one is actually there; neither existing
-- (a broken deploy sequence, 0007 never having run) is left as a real error, since the
-- DROP IF EXISTS and CREATE OR REPLACE below are self-healing from a clean slate too.
do $provider_spend_unlimited_owner_preflight$
declare signature text; procedure_oid oid; owner_oid oid; service_oid oid;
begin
  select oid into service_oid from pg_roles where rolname='service_role';
  if service_oid is null then
    raise exception using errcode='42501',message='A''NU provider spend service role missing';
  end if;
  foreach signature in array array[
    'public.claim_anew_provider_spend_intent(jsonb,integer)',
    'public.claim_anew_provider_spend_intent(jsonb,bigint)'
  ] loop
    procedure_oid:=to_regprocedure(signature);
    if procedure_oid is not null then
      select proowner into owner_oid from pg_proc where oid=procedure_oid;
      if owner_oid=service_oid or pg_has_role('service_role',owner_oid,'MEMBER')
         or pg_has_role('anon',owner_oid,'MEMBER')
         or pg_has_role('authenticated',owner_oid,'MEMBER') then
        raise exception using errcode='42501',
          message='A''NU provider spend unsafe function owner before unlimited-ceiling repair: '
            ||signature;
      end if;
    end if;
  end loop;
end
$provider_spend_unlimited_owner_preflight$
;

-- Defense in depth matching migrations/0007's own structural position (before any CREATE
-- FUNCTION runs): idempotent to repeat even though 0007 already ran this once against the
-- same role, and it closes the gap left if some deploy path ever runs this migration under a
-- role or session where 0007's statement did not take effect.
alter default privileges revoke execute on functions from public
;

-- The (jsonb,integer) overload is being replaced by (jsonb,bigint), a different signature and
-- therefore a different function identity to Postgres. Drop it explicitly so exactly one
-- version of this function exists afterward; CREATE OR REPLACE cannot do this across a
-- parameter type change, it would add a second, ambiguous overload instead.
drop function if exists public.claim_anew_provider_spend_intent(jsonb,integer)
;

create or replace function public.claim_anew_provider_spend_intent(
  p_receipt jsonb,p_ceiling bigint
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,pg_temp
as $function$
declare existing memory_bank.provider_spend_receipts%rowtype;
  admissions bigint:=0;
  attempt_order_value integer;
  duplicate_found boolean:=false;
begin
  if p_receipt is null or jsonb_typeof(p_receipt)<>'object'
     or not (p_receipt ?& array['attempt_id','phase','ham_uid','cycle_id','request_id',
       'component','owner_node_id','target_wonder_id','service_id','provider','operation',
       'model','model_source','key_alias','attempt_order','kind','request_digest',
       'response_digest','provider_request_id','status_code','provider_tokens',
       'actual_cost_usd','cost_source','disposition'])
     -- p_ceiling NULL now means "no ceiling is in force" and is legal input; only a
     -- NON-NULL value outside the published JavaScript safe-integer range is invalid. This
     -- is the exact same edge core/ceiling.owner.js's own EXACT_INTEGER_EDGE publishes to,
     -- never a bound picked independently on either the JS or the SQL side.
     or (p_ceiling is not null and p_ceiling not between 1 and 9007199254740991)
     or p_receipt->>'phase'<>'INTENT'
     or p_receipt->>'disposition'<>'INTENT_COMMITTED'
     or p_receipt->>'attempt_id' !~ '^[a-f0-9]{64}$'
     or p_receipt->>'ham_uid' !~ '^[A-Z0-9._:-]{2,220}$'
     or p_receipt->>'cycle_id' !~ '^[A-Za-z0-9._:/-]{1,220}$'
     or p_receipt->>'request_id' !~ '^[A-Za-z0-9._:/-]{1,220}$'
     or p_receipt->>'component' !~ '^[A-Za-z0-9._:/-]{1,160}$'
     or p_receipt->>'owner_node_id' !~ '^[A-Za-z0-9._:/-]{1,160}$'
     or p_receipt->>'target_wonder_id' !~ '^[A-Za-z0-9._:/-]{1,160}$'
     or p_receipt->>'service_id' !~ '^[A-Za-z0-9._:/-]{1,160}$'
     or p_receipt->>'provider' !~ '^[A-Za-z0-9._:/-]{1,80}$'
     -- PostgreSQL ARE bounds reject repetition counts above 255 before they can
     -- evaluate the value. Keep the 260-byte contract as an explicit length
     -- check and use an unbounded character-class regex for its shape.
     or length(p_receipt->>'operation') not between 1 and 260
     or p_receipt->>'operation' !~ '^[A-Za-z0-9._:/-]+$'
     or p_receipt->>'model' !~ '^[A-Za-z0-9._:/-]{1,240}$'
     or p_receipt->>'model_source' not in ('request_body','request_query','provider_route')
     or p_receipt->>'key_alias' !~ '^[A-Za-z0-9._:/-]{1,240}$'
     or p_receipt->>'attempt_order' !~ '^[1-9][0-9]{0,3}$'
     or p_receipt->>'kind' !~ '^[A-Za-z0-9._:/-]{1,32}$'
     or p_receipt->>'request_digest' !~ '^[a-f0-9]{64}$'
     or nullif(p_receipt->>'response_digest','') is not null
     or nullif(p_receipt->>'provider_request_id','') is not null
     or nullif(p_receipt->>'status_code','') is not null
     or p_receipt->'provider_tokens' is distinct from 'null'::jsonb
     or nullif(p_receipt->>'actual_cost_usd','') is not null
     or nullif(p_receipt->>'cost_source','') is not null then
    return jsonb_build_object('ok',false,'reason','provider_spend_intent_input_invalid');
  end if;
  attempt_order_value:=(p_receipt->>'attempt_order')::integer;
  if attempt_order_value not between 1 and 10000 then
    return jsonb_build_object('ok',false,'reason','provider_spend_intent_input_invalid');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('anew.provider-spend-daily.v1',0));
  select * into existing from memory_bank.provider_spend_receipts
    where attempt_id=p_receipt->>'attempt_id' and phase='INTENT';
  duplicate_found:=found;
  select count(*) into admissions from memory_bank.provider_spend_receipts
    where phase='INTENT' and created_at>=clock_timestamp()-interval '24 hours';
  if duplicate_found then
    return jsonb_build_object('ok',true,'admitted',false,'duplicate',true,
      'reason','provider_spend_attempt_already_admitted',
      'attempt_id',p_receipt->>'attempt_id','admissions',admissions,'ceiling',p_ceiling);
  end if;
  -- NULL means unlimited: the admission-count brake is skipped entirely rather than
  -- compared against a sentinel that was never a real number anyone chose.
  if p_ceiling is not null and admissions>=p_ceiling then
    return jsonb_build_object('ok',true,'admitted',false,'duplicate',false,
      'reason','daily_spend_ceiling_reached','attempt_id',p_receipt->>'attempt_id',
      'admissions',admissions,'ceiling',p_ceiling);
  end if;

  insert into memory_bank.provider_spend_receipts
    (attempt_id,phase,ham_uid,cycle_id,request_id,component,owner_node_id,
      target_wonder_id,service_id,provider,operation,model,model_source,key_alias,
      attempt_order,kind,request_digest,response_digest,provider_request_id,status_code,
      provider_tokens,actual_cost_usd,cost_source,disposition)
  values
    (p_receipt->>'attempt_id','INTENT',p_receipt->>'ham_uid',p_receipt->>'cycle_id',
      p_receipt->>'request_id',p_receipt->>'component',p_receipt->>'owner_node_id',
      p_receipt->>'target_wonder_id',p_receipt->>'service_id',p_receipt->>'provider',
      p_receipt->>'operation',p_receipt->>'model',p_receipt->>'model_source',
      p_receipt->>'key_alias',attempt_order_value,p_receipt->>'kind',
      p_receipt->>'request_digest',null,null,null,null,null,null,'INTENT_COMMITTED');
  admissions:=admissions+1;
  return jsonb_build_object('ok',true,'admitted',true,'duplicate',false,
    'reason',null,'attempt_id',p_receipt->>'attempt_id',
    'admissions',admissions,'ceiling',p_ceiling);
exception when unique_violation then
  return jsonb_build_object('ok',true,'admitted',false,'duplicate',true,
    'reason','provider_spend_attempt_already_admitted','attempt_id',p_receipt->>'attempt_id',
    'admissions',admissions,'ceiling',p_ceiling);
end
$function$
;

-- ⬡B:migrations.0008.provider_spend_unlimited_ceiling:911:a_security_definer_function_is_left_executable_by_anon:20260801⬡
-- CATHY (Codex) review, fifth pass, 20260801: on a clean PostgreSQL database a newly created
-- function grants EXECUTE to PUBLIC by default, which implicitly includes anon and
-- authenticated. Migration 0007 revokes this explicitly, right after its own CREATE OR REPLACE
-- FUNCTION statements (lines 367-375 there); this migration relied only on 0007's earlier
-- `alter default privileges revoke execute on functions from public`, and that is not
-- sufficient on its own: a managed Postgres (Supabase's own provisioning is the concrete case)
-- commonly sets its OWN default-privilege entry granting EXECUTE to anon/authenticated directly,
-- as a DIFFERENT role than the one `revoke ... from public` runs as, and revoking from the
-- pseudo-role "public" does not touch a default grant recorded against anon/authenticated by
-- name. Without this explicit revoke, the function above is created still carrying that
-- unsafe default ACL; the postflight assertion below then correctly catches it and raises,
-- but by then the SECURITY DEFINER function is already installed and already callable by an
-- unauthenticated role, and /admin/migrate halts leaving it in place: the guard fires and the
-- hole it caught stays open. THE FIX, matching 0007's own working pattern exactly rather than
-- inventing a new one: revoke explicitly, immediately after CREATE, before anything else runs.
revoke all on function public.claim_anew_provider_spend_intent(jsonb,bigint)
  from public,anon,authenticated
;

do $provider_spend_unlimited_grant_and_acl_assert$
declare procedure_oid oid; owner_oid oid; service_oid oid;
begin
  select oid into service_oid from pg_roles where rolname='service_role';
  procedure_oid:=to_regprocedure('public.claim_anew_provider_spend_intent(jsonb,bigint)');
  if procedure_oid is null then
    raise exception using errcode='55000',
      message='A''NU provider spend claim function missing after unlimited-ceiling repair';
  end if;
  execute format('grant execute on function %s to service_role',
    'public.claim_anew_provider_spend_intent(jsonb,bigint)');
  select proowner into owner_oid from pg_proc where oid=procedure_oid;
  if owner_oid is null or owner_oid=service_oid
     or pg_has_role('service_role',owner_oid,'MEMBER')
     or has_function_privilege('anon',procedure_oid,'EXECUTE')
     or has_function_privilege('authenticated',procedure_oid,'EXECUTE')
     or not has_function_privilege('service_role',procedure_oid,'EXECUTE')
     or exists(select 1 from pg_proc proc
        cross join lateral aclexplode(coalesce(proc.proacl,acldefault('f',proc.proowner))) acl
        where proc.oid=procedure_oid and acl.privilege_type='EXECUTE'
          and acl.grantee not in (owner_oid,service_oid)) then
    raise exception using errcode='42501',
      message='A''NU provider spend claim function privilege isolation failed after repair';
  end if;
  -- The old (jsonb,integer) overload must be genuinely gone, not merely superseded in name,
  -- or a caller (or PostgREST's own resolution) could still reach the version with the wrong
  -- storage type and the trap this migration exists to close would still be reachable.
  if to_regprocedure('public.claim_anew_provider_spend_intent(jsonb,integer)') is not null then
    raise exception using errcode='42501',
      message='A''NU provider spend claim function old integer overload still present';
  end if;
end
$provider_spend_unlimited_grant_and_acl_assert$
;

notify pgrst,'reload schema'
;
