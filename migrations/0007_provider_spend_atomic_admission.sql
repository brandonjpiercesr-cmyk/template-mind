-- ⬡B:migrations.0007.provider_spend_atomic_admission:GROUND:one_bank_one_daily_winner:20260730⬡
-- Extend the canonical provider receipt ledger. No second budget ledger is introduced.
-- The INTENT row and its rolling-day budget slot are elected in one Postgres transaction,
-- so any number of service replicas still admit at most the configured ceiling.

do $provider_spend_owner_preflight$
declare signature text; procedure_oid oid; owner_oid oid; service_oid oid;
begin
  select oid into service_oid from pg_roles where rolname='service_role';
  if service_oid is null then
    raise exception using errcode='42501',message='A''NU provider spend service role missing';
  end if;
  foreach signature in array array[
    'public.claim_anew_provider_spend_intent(jsonb,integer)',
    'public.write_anew_provider_spend_terminal(jsonb)',
    'public.reconcile_anew_provider_spend_unknown(text,text,text,integer)'
  ] loop
    procedure_oid:=to_regprocedure(signature);
    if procedure_oid is not null then
      select proowner into owner_oid from pg_proc where oid=procedure_oid;
      if owner_oid=service_oid or pg_has_role('service_role',owner_oid,'MEMBER')
         or pg_has_role('anon',owner_oid,'MEMBER')
         or pg_has_role('authenticated',owner_oid,'MEMBER') then
        raise exception using errcode='42501',
          message='A''NU provider spend unsafe function owner: '||signature;
      end if;
    end if;
  end loop;
end
$provider_spend_owner_preflight$
;

do $provider_spend_pregrant_reset$
declare signature text; procedure_oid oid; owner_oid oid; owner_name text;
  acl_row record; grantee_sql text;
begin
  foreach signature in array array[
    'public.claim_anew_provider_spend_intent(jsonb,integer)',
    'public.write_anew_provider_spend_terminal(jsonb)',
    'public.reconcile_anew_provider_spend_unknown(text,text,text,integer)'
  ] loop
    procedure_oid:=to_regprocedure(signature);
    if procedure_oid is not null then
      select proc.proowner,pg_get_userbyid(proc.proowner)
        into owner_oid,owner_name from pg_proc proc where proc.oid=procedure_oid;
      execute format('grant execute on function %s to %I',signature,owner_name);
      for acl_row in select acl.grantee,role_row.rolname
        from pg_proc proc
        cross join lateral aclexplode(coalesce(proc.proacl,acldefault('f',proc.proowner))) acl
        left join pg_roles role_row on role_row.oid=acl.grantee
        where proc.oid=procedure_oid and acl.privilege_type='EXECUTE'
          and acl.grantee<>owner_oid
      loop
        grantee_sql:=case when acl_row.grantee=0 then 'public'
          else format('%I',acl_row.rolname) end;
        execute format('revoke all on function %s from %s',signature,grantee_sql);
      end loop;
    end if;
  end loop;
end
$provider_spend_pregrant_reset$
;
alter default privileges revoke execute on functions from public
;

do $provider_spend_table_preflight$
begin
  if to_regclass('memory_bank.provider_spend_receipts') is null then
    raise exception using errcode='55000',
      message='A''NU canonical provider spend receipt ledger missing';
  end if;
end
$provider_spend_table_preflight$
;

do $provider_spend_phase_truth$
begin
  alter table memory_bank.provider_spend_receipts
    drop constraint if exists provider_spend_receipt_phase_truth_v2;
  alter table memory_bank.provider_spend_receipts
    add constraint provider_spend_receipt_phase_truth_v2 check (
      (phase='INTENT' and disposition='INTENT_COMMITTED' and status_code is null
        and response_digest is null and provider_request_id is null
        and provider_tokens is null and actual_cost_usd is null and cost_source is null)
      or
      (phase='TERMINAL' and disposition in
        ('SUCCEEDED','HTTP_ERROR','NETWORK_ERROR','REFUSED_LOCAL_CEILING_RACE','OUTCOME_UNKNOWN'))
    );
end
$provider_spend_phase_truth$
;

create index if not exists provider_spend_receipts_cycle_request_phase_created_idx
  on memory_bank.provider_spend_receipts
    (ham_uid,cycle_id,request_id,phase,created_at,attempt_id)
;

revoke insert,update,delete,truncate,references,trigger
  on table memory_bank.provider_spend_receipts
  from public,anon,authenticated,service_role
;
grant select on table memory_bank.provider_spend_receipts to service_role
;

create or replace function public.claim_anew_provider_spend_intent(
  p_receipt jsonb,p_ceiling integer
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
     or p_ceiling is null or p_ceiling not between 1 and 10000
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
     or p_receipt->>'operation' !~ '^[A-Za-z0-9._:/-]{1,260}$'
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
  if admissions>=p_ceiling then
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

create or replace function public.write_anew_provider_spend_terminal(
  p_terminal jsonb
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,pg_temp
as $function$
declare intent_row memory_bank.provider_spend_receipts%rowtype;
  terminal_row memory_bank.provider_spend_receipts%rowtype;
  inserted boolean:=false;
  status_value integer;
  cost_value numeric(18,8);
begin
  if p_terminal is null or jsonb_typeof(p_terminal)<>'object'
     or not (p_terminal ?& array['attempt_id','phase','ham_uid','cycle_id','request_id',
       'component','owner_node_id','target_wonder_id','service_id','provider','operation',
       'model','model_source','key_alias','attempt_order','kind','request_digest',
       'response_digest','provider_request_id','status_code','provider_tokens',
       'actual_cost_usd','cost_source','disposition'])
     or p_terminal->>'phase'<>'TERMINAL'
     or p_terminal->>'attempt_id' !~ '^[a-f0-9]{64}$'
     or p_terminal->>'attempt_order' !~ '^[1-9][0-9]{0,3}$'
     or p_terminal->>'disposition' not in
       ('SUCCEEDED','HTTP_ERROR','NETWORK_ERROR','REFUSED_LOCAL_CEILING_RACE','OUTCOME_UNKNOWN')
     or (nullif(p_terminal->>'status_code','') is not null
       and p_terminal->>'status_code' !~ '^[1-5][0-9]{2}$')
     or (nullif(p_terminal->>'response_digest','') is not null
       and p_terminal->>'response_digest' !~ '^[a-f0-9]{64}$')
     or (nullif(p_terminal->>'provider_request_id','') is not null
       and p_terminal->>'provider_request_id' !~ '^[A-Za-z0-9._:/-]{1,240}$')
     or (nullif(p_terminal->>'actual_cost_usd','') is not null
       and p_terminal->>'actual_cost_usd' !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$')
     or nullif(p_terminal->>'cost_source','') is not null
       and p_terminal->>'cost_source'<>'provider_reported' then
    return jsonb_build_object('ok',false,'reason','provider_spend_terminal_input_invalid');
  end if;
  status_value:=nullif(p_terminal->>'status_code','')::integer;
  cost_value:=nullif(p_terminal->>'actual_cost_usd','')::numeric(18,8);
  perform pg_advisory_xact_lock(hashtextextended('anew.provider-spend-daily.v1',0));
  select * into intent_row from memory_bank.provider_spend_receipts
    where attempt_id=p_terminal->>'attempt_id' and phase='INTENT';
  if not found then
    return jsonb_build_object('ok',false,'reason','provider_spend_intent_missing',
      'attempt_id',p_terminal->>'attempt_id');
  end if;
  if intent_row.ham_uid<>p_terminal->>'ham_uid'
     or intent_row.cycle_id<>p_terminal->>'cycle_id'
     or intent_row.request_id<>p_terminal->>'request_id'
     or intent_row.component<>p_terminal->>'component'
     or intent_row.owner_node_id<>p_terminal->>'owner_node_id'
     or intent_row.target_wonder_id<>p_terminal->>'target_wonder_id'
     or intent_row.service_id<>p_terminal->>'service_id'
     or intent_row.provider<>p_terminal->>'provider'
     or intent_row.operation<>p_terminal->>'operation'
     or intent_row.model<>p_terminal->>'model'
     or intent_row.model_source<>p_terminal->>'model_source'
     or intent_row.key_alias<>p_terminal->>'key_alias'
     or intent_row.attempt_order<>(p_terminal->>'attempt_order')::integer
     or intent_row.kind<>p_terminal->>'kind'
     or intent_row.request_digest<>p_terminal->>'request_digest' then
    return jsonb_build_object('ok',false,'reason','provider_spend_terminal_identity_mismatch',
      'attempt_id',p_terminal->>'attempt_id');
  end if;
  select * into terminal_row from memory_bank.provider_spend_receipts
    where attempt_id=p_terminal->>'attempt_id' and phase='TERMINAL';
  if not found then
    insert into memory_bank.provider_spend_receipts
      (attempt_id,phase,ham_uid,cycle_id,request_id,component,owner_node_id,
        target_wonder_id,service_id,provider,operation,model,model_source,key_alias,
        attempt_order,kind,request_digest,response_digest,provider_request_id,status_code,
        provider_tokens,actual_cost_usd,cost_source,disposition)
    values
      (intent_row.attempt_id,'TERMINAL',intent_row.ham_uid,intent_row.cycle_id,
        intent_row.request_id,intent_row.component,intent_row.owner_node_id,
        intent_row.target_wonder_id,intent_row.service_id,intent_row.provider,
        intent_row.operation,intent_row.model,intent_row.model_source,intent_row.key_alias,
        intent_row.attempt_order,intent_row.kind,intent_row.request_digest,
        nullif(p_terminal->>'response_digest',''),nullif(p_terminal->>'provider_request_id',''),
        status_value,nullif(p_terminal->'provider_tokens','null'::jsonb),cost_value,
        nullif(p_terminal->>'cost_source',''),p_terminal->>'disposition')
    returning * into terminal_row;
    inserted:=true;
  end if;
  return jsonb_build_object('ok',true,'stored',true,'inserted',inserted,
    'attempt_id',p_terminal->>'attempt_id','disposition',terminal_row.disposition);
end
$function$
;

create or replace function public.reconcile_anew_provider_spend_unknown(
  p_ham_uid text,p_cycle_id text,p_request_id text,p_grace_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,pg_temp
as $function$
declare resolved_count bigint:=0; unresolved_count bigint:=0; unknown_count bigint:=0;
  stale_remaining boolean:=false;
begin
  if p_ham_uid is null or p_ham_uid !~ '^[A-Z0-9._:-]{2,220}$'
     or p_cycle_id is null
     or p_cycle_id !~ '^[A-Za-z0-9._:/-]{1,220}$'
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9._:/-]{1,220}$'
     or p_grace_seconds is null or p_grace_seconds not between 1 and 3600 then
    return jsonb_build_object('ok',false,'reason','provider_spend_reconcile_input_invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('anew.provider-spend-daily.v1',0));
  -- Sweep the oldest unresolved attempts across the canonical ledger, not only the
  -- request which happened to wake this process. The advisory lock serializes this
  -- bounded repair with every claim and terminal write. Returning counts only keeps
  -- another HAM's receipt identity behind the SECURITY DEFINER boundary.
  with stale_intents as (
    select intent.*
    from memory_bank.provider_spend_receipts intent
    left join memory_bank.provider_spend_receipts terminal
      on terminal.attempt_id=intent.attempt_id and terminal.phase='TERMINAL'
    where intent.phase='INTENT' and terminal.attempt_id is null
      and intent.created_at<=clock_timestamp()-make_interval(secs=>p_grace_seconds)
    order by intent.created_at,intent.attempt_id
    limit 100
  )
  insert into memory_bank.provider_spend_receipts
    (attempt_id,phase,ham_uid,cycle_id,request_id,component,owner_node_id,
      target_wonder_id,service_id,provider,operation,model,model_source,key_alias,
      attempt_order,kind,request_digest,response_digest,provider_request_id,status_code,
      provider_tokens,actual_cost_usd,cost_source,disposition)
  select intent.attempt_id,'TERMINAL',intent.ham_uid,intent.cycle_id,intent.request_id,
    intent.component,intent.owner_node_id,intent.target_wonder_id,intent.service_id,
    intent.provider,intent.operation,intent.model,intent.model_source,intent.key_alias,
    intent.attempt_order,intent.kind,intent.request_digest,null,null,null,null,null,null,
    'OUTCOME_UNKNOWN'
  from stale_intents intent
  on conflict (attempt_id,phase) do nothing;
  get diagnostics resolved_count=row_count;

  select exists(
    select 1 from memory_bank.provider_spend_receipts intent
    left join memory_bank.provider_spend_receipts terminal
      on terminal.attempt_id=intent.attempt_id and terminal.phase='TERMINAL'
    where intent.phase='INTENT' and terminal.attempt_id is null
      and intent.created_at<=clock_timestamp()-make_interval(secs=>p_grace_seconds)
    limit 1
  ) into stale_remaining;
  select case when exists(
    select 1 from memory_bank.provider_spend_receipts intent
    left join memory_bank.provider_spend_receipts terminal
      on terminal.attempt_id=intent.attempt_id and terminal.phase='TERMINAL'
    where intent.phase='INTENT' and intent.ham_uid=p_ham_uid
      and intent.cycle_id=p_cycle_id and intent.request_id=p_request_id
      and terminal.attempt_id is null
    limit 1
  ) then 1 else 0 end into unresolved_count;
  select case when exists(
    select 1 from memory_bank.provider_spend_receipts
    where phase='TERMINAL' and ham_uid=p_ham_uid and cycle_id=p_cycle_id
      and request_id=p_request_id and disposition='OUTCOME_UNKNOWN'
    limit 1
  ) then 1 else 0 end into unknown_count;
  return jsonb_build_object('ok',true,'ham_uid',p_ham_uid,'cycle_id',p_cycle_id,
    'request_id',p_request_id,'resolved_unknown',resolved_count,
    'stale_remaining',stale_remaining,
    'unresolved',unresolved_count,'outcome_unknown',unknown_count);
end
$function$
;

revoke all on function public.claim_anew_provider_spend_intent(jsonb,integer)
  from public,anon,authenticated
;
revoke all on function public.write_anew_provider_spend_terminal(jsonb)
  from public,anon,authenticated
;
revoke all on function public.reconcile_anew_provider_spend_unknown(text,text,text,integer)
  from public,anon,authenticated
;

do $provider_spend_atomic_grant_and_acl_assert$
declare signature text; procedure_oid oid; owner_oid oid; service_oid oid;
begin
  select oid into service_oid from pg_roles where rolname='service_role';
  foreach signature in array array[
    'public.claim_anew_provider_spend_intent(jsonb,integer)',
    'public.write_anew_provider_spend_terminal(jsonb)',
    'public.reconcile_anew_provider_spend_unknown(text,text,text,integer)'
  ] loop
    procedure_oid:=to_regprocedure(signature);
    if procedure_oid is null then
      raise exception using errcode='55000',
        message='A''NU provider spend function missing before atomic grant: '||signature;
    end if;
    execute format('grant execute on function %s to service_role',signature);
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
        message='A''NU provider spend function privilege isolation failed: '||signature;
    end if;
  end loop;
  if has_table_privilege('service_role','memory_bank.provider_spend_receipts','INSERT')
     or has_table_privilege('service_role','memory_bank.provider_spend_receipts','UPDATE')
     or has_table_privilege('service_role','memory_bank.provider_spend_receipts','DELETE')
     or not has_table_privilege('service_role','memory_bank.provider_spend_receipts','SELECT') then
    raise exception using errcode='42501',
      message='A''NU provider spend table privilege isolation failed';
  end if;
end
$provider_spend_atomic_grant_and_acl_assert$
;

notify pgrst,'reload schema'
;
