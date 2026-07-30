-- ⬡B:migrations.atomic_paid_admission_claims:SCHEMA:one_brain_single_winner:20260730⬡
-- ⬡COLD:act:become:ATOMIC_PAID_ADMISSION_SCHEMA_WONDER:20260730⬡
-- CATHY.SHADOW COLD-ANEW-PAID-ADMISSION-NONATOMIC-20260730-0010.
do $paid_function_owner_preflight$
declare signature text; procedure_oid oid; owner_oid oid; service_oid oid;
begin
  select oid into service_oid from pg_roles where rolname='service_role';
  if service_oid is null then
    raise exception using errcode='42501',
      message='A''NU paid admission service role missing';
  end if;
  foreach signature in array array[
    'public.ensure_anew_reach_escalation_indexes()',
    'public.claim_anew_paid_admission(text,text,text,text,integer,boolean)',
    'public.renew_anew_paid_admission(text,text,text,text,integer)',
    'public.release_anew_paid_admission(text,text,text,text)',
    'public.claim_anew_paid_admission(text,text,text,text,integer,boolean,integer)',
    'public.admit_anew_paid_admission(text,text,text,text,uuid)',
    'public.abort_anew_paid_admission(text,text,text,text,uuid)',
    'public.start_anew_paid_admission(text,text,text,text,uuid)',
    'public.complete_anew_paid_admission(text,text,text,text,uuid)',
    'public.renew_anew_paid_admission(text,text,text,text,uuid,integer)',
    'public.release_anew_paid_admission(text,text,text,text,uuid)'
  ] loop
    procedure_oid:=to_regprocedure(signature);
    if procedure_oid is not null then
      select proowner into owner_oid from pg_proc where oid=procedure_oid;
      if owner_oid=service_oid
         or pg_has_role('service_role',owner_oid,'MEMBER')
         or pg_has_role('anon',owner_oid,'MEMBER')
         or pg_has_role('authenticated',owner_oid,'MEMBER') then
        raise exception using errcode='42501',
          message='A''NU paid admission unsafe function owner: '||signature;
      end if;
    end if;
  end loop;
end
$paid_function_owner_preflight$
;
create table if not exists memory_bank.paid_admission_claims (
  task_source text primary key,
  protocol_version integer not null default 1,
  ham_uid text not null,
  binding_digest text not null,
  claimant text not null,
  acquisition_token uuid not null default gen_random_uuid(),
  claimed_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  requested_lease_seconds integer,
  requested_permanent boolean not null default false,
  permanent boolean not null default false,
  admission_state text not null default 'reserved',
  admitted_at timestamptz,
  paid_started_at timestamptz,
  aborted_at timestamptz,
  constraint paid_admission_ham_v1 check (ham_uid ~ '^[A-Z0-9._:-]{2,160}$'),
  constraint paid_admission_digest_v1 check (binding_digest ~ '^[a-f0-9]{64}$'),
  constraint paid_admission_protocol_v1 check (protocol_version=1),
  constraint paid_admission_state_v1 check
    (admission_state in ('reserved','admitted','paid_started','terminal','aborted')),
  constraint paid_admission_requested_lease_v1 check
    (requested_lease_seconds between 1 and 86400),
  constraint paid_admission_terminal_v1 check
    ((admission_state='terminal' and permanent and lease_expires_at is null)
      or (admission_state<>'terminal' and not permanent and lease_expires_at is not null))
)
;
do $retired_overloads$
declare signature text; procedure_oid oid; owner_oid oid; owner_name text;
  acl_row record; grantee_sql text;
begin
  foreach signature in array array[
    'public.ensure_anew_reach_escalation_indexes()',
    'public.claim_anew_paid_admission(text,text,text,text,integer,boolean)',
    'public.renew_anew_paid_admission(text,text,text,text,integer)',
    'public.release_anew_paid_admission(text,text,text,text)',
    'public.claim_anew_paid_admission(text,text,text,text,integer,boolean,integer)',
    'public.admit_anew_paid_admission(text,text,text,text,uuid)',
    'public.abort_anew_paid_admission(text,text,text,text,uuid)',
    'public.renew_anew_paid_admission(text,text,text,text,uuid,integer)',
    'public.release_anew_paid_admission(text,text,text,text,uuid)',
    'public.start_anew_paid_admission(text,text,text,text,uuid)',
    'public.complete_anew_paid_admission(text,text,text,text,uuid)'
  ] loop
    procedure_oid:=to_regprocedure(signature);
    if procedure_oid is not null then
      select proc.proowner,pg_get_userbyid(proc.proowner)
        into owner_oid,owner_name from pg_proc proc where proc.oid=procedure_oid;
      if owner_oid is null or owner_name is null then
        raise exception using errcode='42501',
          message='A''NU paid admission function owner unavailable: '||signature;
      end if;
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
  drop function if exists public.claim_anew_paid_admission(text,text,text,text,integer,boolean);
  drop function if exists public.renew_anew_paid_admission(text,text,text,text,integer);
  drop function if exists public.release_anew_paid_admission(text,text,text,text);
end
$retired_overloads$
;
alter default privileges revoke execute on functions from public
;
alter table memory_bank.paid_admission_claims
  add column if not exists protocol_version integer,
  add column if not exists acquisition_token uuid,
  add column if not exists requested_lease_seconds integer,
  add column if not exists requested_permanent boolean,
  add column if not exists admission_state text,
  add column if not exists admitted_at timestamptz,
  add column if not exists paid_started_at timestamptz,
  add column if not exists aborted_at timestamptz,
  alter column lease_expires_at drop not null
;
update memory_bank.paid_admission_claims
set protocol_version=1,
  acquisition_token=coalesce(acquisition_token,gen_random_uuid()),
  requested_permanent=coalesce(requested_permanent,permanent),
  requested_lease_seconds=coalesce(requested_lease_seconds,
    least(86400,greatest(1,ceil(extract(epoch from
      (coalesce(lease_expires_at,claimed_at+interval '15 minutes')-claimed_at)))))::integer),
  admission_state=coalesce(admission_state,'terminal'),
  admitted_at=coalesce(admitted_at,claimed_at),
  paid_started_at=coalesce(paid_started_at,claimed_at),
  permanent=true,
  lease_expires_at=null
where protocol_version is null
;
alter table memory_bank.paid_admission_claims
  alter column protocol_version set default 1,
  alter column protocol_version set not null,
  alter column acquisition_token set default gen_random_uuid(),
  alter column acquisition_token set not null,
  alter column requested_permanent set default false,
  alter column requested_permanent set not null,
  alter column requested_lease_seconds set not null,
  alter column admission_state set default 'reserved',
  alter column admission_state set not null
;
do $constraint_upgrade$
declare constraint_row record;
begin
  for constraint_row in
    select conname from pg_constraint
      where conrelid='memory_bank.paid_admission_claims'::regclass and contype='c'
  loop
    execute format('alter table memory_bank.paid_admission_claims drop constraint %I',
      constraint_row.conname);
  end loop;
  alter table memory_bank.paid_admission_claims
    add constraint paid_admission_ham_v1
      check(ham_uid ~ '^[A-Z0-9._:-]{2,160}$'),
    add constraint paid_admission_digest_v1
      check(binding_digest ~ '^[a-f0-9]{64}$'),
    add constraint paid_admission_protocol_v1 check(protocol_version=1),
    add constraint paid_admission_state_v1
      check(admission_state in ('reserved','admitted','paid_started','terminal','aborted')),
    add constraint paid_admission_requested_lease_v1
      check(requested_lease_seconds between 1 and 86400),
    add constraint paid_admission_terminal_v1
      check((admission_state='terminal' and permanent and lease_expires_at is null)
        or (admission_state<>'terminal' and not permanent and lease_expires_at is not null));
end
$constraint_upgrade$
;
do $table_acl_reset$
declare acl_row record; grantee_sql text;
begin
  for acl_row in
    select acl.grantee,role_row.rolname,cls.relowner
    from pg_class cls
    join pg_namespace ns on ns.oid=cls.relnamespace
    cross join lateral aclexplode(cls.relacl) acl
    left join pg_roles role_row on role_row.oid=acl.grantee
    where ns.nspname='memory_bank' and cls.relname='paid_admission_claims'
      and acl.privilege_type in
        ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
  loop
    grantee_sql:=case when acl_row.grantee=0 then 'public'
      else format('%I',acl_row.rolname) end;
    execute 'revoke all on table memory_bank.paid_admission_claims from '||grantee_sql;
  end loop;
end
$table_acl_reset$
;
do $schema_and_privilege_assert$
declare actual_columns text[]; expected_columns constant text[]:=array[
  'aborted_at:timestamp with time zone:false','acquisition_token:uuid:true',
  'admission_state:text:true','admitted_at:timestamp with time zone:false',
  'binding_digest:text:true','claimant:text:true',
  'claimed_at:timestamp with time zone:true','ham_uid:text:true',
  'lease_expires_at:timestamp with time zone:false',
  'paid_started_at:timestamp with time zone:false','permanent:boolean:true',
  'protocol_version:integer:true','requested_lease_seconds:integer:true',
  'requested_permanent:boolean:true','task_source:text:true'];
  table_owner oid;
begin
  select cls.relowner into table_owner from pg_class cls join pg_namespace ns
    on ns.oid=cls.relnamespace where ns.nspname='memory_bank'
      and cls.relname='paid_admission_claims' and cls.relkind='r';
  select array_agg(format('%s:%s:%s',attr.attname,
      format_type(attr.atttypid,attr.atttypmod),
      case when attr.attnotnull then 'true' else 'false' end) order by attr.attname)
    into actual_columns from pg_attribute attr
    where attr.attrelid='memory_bank.paid_admission_claims'::regclass
      and attr.attnum>0 and not attr.attisdropped;
  if actual_columns is distinct from expected_columns then
    raise exception using errcode='55000',
      message='A''NU paid admission exact column contract failed';
  end if;
  if (select count(*) from pg_attrdef def join pg_attribute attr
      on attr.attrelid=def.adrelid and attr.attnum=def.adnum
      where def.adrelid='memory_bank.paid_admission_claims'::regclass)<>6
    or (select count(*) from pg_attrdef def join pg_attribute attr
      on attr.attrelid=def.adrelid and attr.attnum=def.adnum
      where def.adrelid='memory_bank.paid_admission_claims'::regclass
        and (attr.attname,regexp_replace(lower(pg_get_expr(def.adbin,def.adrelid)),'\s+','','g')) in
          (('protocol_version','1'),('acquisition_token','gen_random_uuid()'),
           ('claimed_at','now()'),('requested_permanent','false'),
           ('permanent','false'),('admission_state','''reserved''::text')))<>6 then
    raise exception using errcode='55000',
      message='A''NU paid admission exact default contract failed';
  end if;
  if (select count(*) from pg_constraint where
      conrelid='memory_bank.paid_admission_claims'::regclass and contype='c')<>6
    or (select count(*) from pg_constraint where
      conrelid='memory_bank.paid_admission_claims'::regclass and contype='c'
      and conname=any(array['paid_admission_ham_v1','paid_admission_digest_v1',
        'paid_admission_protocol_v1','paid_admission_state_v1',
        'paid_admission_requested_lease_v1','paid_admission_terminal_v1']))<>6
    or not exists(select 1 from pg_constraint where
      conrelid='memory_bank.paid_admission_claims'::regclass and contype='p'
      and conkey=array[(select attnum::smallint from pg_attribute where
        attrelid='memory_bank.paid_admission_claims'::regclass and attname='task_source')]) then
    raise exception using errcode='55000',
      message='A''NU paid admission exact constraint contract failed';
  end if;
  if exists (
    select 1
    from pg_class cls
    join pg_namespace ns on ns.oid=cls.relnamespace
    cross join lateral aclexplode(coalesce(cls.relacl,acldefault('r',cls.relowner))) acl
    left join pg_roles role_row on role_row.oid=acl.grantee
    where ns.nspname='memory_bank' and cls.relname='paid_admission_claims'
      and acl.grantee<>cls.relowner
      and acl.privilege_type in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
  ) then
    raise exception using errcode='42501',
      message='A''NU paid admission table privilege isolation failed';
  end if;
  if table_owner is null or pg_get_userbyid(table_owner)='service_role'
      or pg_has_role('service_role',table_owner,'MEMBER') then
    raise exception using errcode='42501',
      message='A''NU paid admission effective privilege isolation failed';
  end if;
  if has_table_privilege('anon','memory_bank.paid_admission_claims','SELECT')
      or has_table_privilege('authenticated','memory_bank.paid_admission_claims','SELECT')
      or has_table_privilege('service_role','memory_bank.paid_admission_claims','SELECT') then
    raise exception using errcode='42501',
      message='A''NU paid admission effective privilege isolation failed';
  end if;
end
$schema_and_privilege_assert$
;
create unique index if not exists anew_reach_escalation_terminal_ham_source_uq_v1
  on memory_bank.beads (ham_uid,source)
  where source like 'reach.escalation.terminal.%'
;
do $paid_boundary_index_replace_and_assert$
declare index_oid oid; predicate_sql text; normalized_predicate text;
  expected_predicate constant text:='((source~~''transcript.result.%''::text)or(source~~''transcript.paid.%''::text)or(source~~''wonder.spine.read.%''::text)or(source~~''wonder.spine.attempt.%''::text)or(source~~''reach.escalation.attempt.%''::text))';
begin
  select idx.indexrelid,pg_get_expr(idx.indpred,idx.indrelid,false)
    into index_oid,predicate_sql
    from pg_index idx join pg_class cls on cls.oid=idx.indexrelid
    join pg_namespace ns on ns.oid=cls.relnamespace
    where ns.nspname='memory_bank' and cls.relname='anew_paid_boundary_ham_source_uq_v1'
      and idx.indrelid='memory_bank.beads'::regclass and idx.indisunique
      and idx.indisvalid and idx.indisready and idx.indnkeyatts=2 and idx.indnatts=2
      and pg_get_indexdef(idx.indexrelid,1,true)='ham_uid'
      and pg_get_indexdef(idx.indexrelid,2,true)='source';
  normalized_predicate:=regexp_replace(lower(predicate_sql),'\s+','','g');
  if index_oid is null or normalized_predicate is distinct from expected_predicate then
    drop index if exists memory_bank.anew_paid_boundary_ham_source_uq_v1;
    create unique index anew_paid_boundary_ham_source_uq_v1
      on memory_bank.beads (ham_uid,source)
      where source like 'transcript.result.%'
        or source like 'transcript.paid.%'
        or source like 'wonder.spine.read.%'
        or source like 'wonder.spine.attempt.%'
        or source like 'reach.escalation.attempt.%';
    index_oid:=null;predicate_sql:=null;
    select idx.indexrelid,pg_get_expr(idx.indpred,idx.indrelid,false)
      into index_oid,predicate_sql
      from pg_index idx join pg_class cls on cls.oid=idx.indexrelid
      join pg_namespace ns on ns.oid=cls.relnamespace
      where ns.nspname='memory_bank' and cls.relname='anew_paid_boundary_ham_source_uq_v1'
        and idx.indrelid='memory_bank.beads'::regclass and idx.indisunique
        and idx.indisvalid and idx.indisready and idx.indnkeyatts=2 and idx.indnatts=2
        and pg_get_indexdef(idx.indexrelid,1,true)='ham_uid'
        and pg_get_indexdef(idx.indexrelid,2,true)='source';
    normalized_predicate:=regexp_replace(lower(predicate_sql),'\s+','','g');
  end if;
  if index_oid is null or normalized_predicate is distinct from expected_predicate then
    raise exception using errcode='55000',
      message='A''NU paid boundary unique receipt contract failed';
  end if;
end
$paid_boundary_index_replace_and_assert$
;
create or replace function public.ensure_anew_reach_escalation_indexes()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  expected_indexes constant text[]:=array[
    'anew_reach_escalation_terminal_ham_source_uq_v1']::text[];
  actual_count bigint:=0;
  catalog_ready boolean:=false;
  actual_indexes text[]:=array[]::text[];
begin
  with observed as (
    select cls.relname as name,idx.indexrelid,idx.indrelid,
      idx.indisunique,idx.indisvalid,idx.indisready,idx.indnkeyatts,idx.indnatts,
      pg_get_expr(idx.indpred,idx.indrelid,false) as predicate_sql
    from pg_class cls
    join pg_namespace ns on ns.oid=cls.relnamespace
    join pg_index idx on idx.indexrelid=cls.oid
    where ns.nspname='memory_bank'
      and cls.relname=any(expected_indexes)
      and idx.indrelid=to_regclass('memory_bank.beads')
  )
  select count(*),coalesce(bool_and(observed.indisunique
      and observed.indisvalid and observed.indisready
      and observed.indnkeyatts=2 and observed.indnatts=2
      and pg_get_indexdef(observed.indexrelid,1,true)='ham_uid'
      and pg_get_indexdef(observed.indexrelid,2,true)='source'
      and observed.predicate_sql=
        '(source ~~ ''reach.escalation.terminal.%''::text)'),false),
    coalesce(array_agg(observed.name order by observed.name),array[]::text[])
  into actual_count,catalog_ready,actual_indexes
  from observed;
  catalog_ready:=catalog_ready and actual_count=cardinality(expected_indexes)
    and actual_indexes=expected_indexes;
  return jsonb_build_object('contract','anew.reach.escalation-indexes.v1',
    'ready',catalog_ready,'index_count',actual_count,'indexes',to_jsonb(actual_indexes));
end
$function$
;
revoke all on function public.ensure_anew_reach_escalation_indexes()
  from public, anon, authenticated
;
do $migration_assert$
declare verification jsonb;
begin
  verification:=public.ensure_anew_reach_escalation_indexes();
  if verification->>'contract'<>'anew.reach.escalation-indexes.v1'
     or coalesce((verification->>'ready')::boolean,false) is not true
     or coalesce((verification->>'index_count')::integer,0)<>1 then
    raise exception using errcode='55000',
      message='A''NU REACH escalation index contract verification failed';
  end if;
end
$migration_assert$
;
create or replace function public.claim_anew_paid_admission(
  p_task_source text,
  p_ham_uid text,
  p_binding_digest text,
  p_claimant text,
  p_lease_seconds integer,
  p_permanent boolean,
  p_reservation_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  selected memory_bank.paid_admission_claims%rowtype;
begin
  if p_task_source is null or length(p_task_source) not between 1 and 220
     or p_ham_uid !~ '^[A-Z0-9._:-]{2,160}$'
     or p_binding_digest !~ '^[a-f0-9]{64}$'
     or p_claimant is null or length(p_claimant) not between 1 and 320
     or p_permanent is null
     or p_reservation_seconds is null or p_reservation_seconds not between 10 and 300
     or p_lease_seconds is null or p_lease_seconds not between 1 and 86400 then
    return jsonb_build_object('ok',false,'reason','canonical_claim_input_invalid');
  end if;

  insert into memory_bank.paid_admission_claims as current_claim
    (task_source,ham_uid,binding_digest,claimant,acquisition_token,claimed_at,
      lease_expires_at,requested_lease_seconds,requested_permanent,permanent,
      admission_state,admitted_at,paid_started_at,aborted_at)
  values
    (p_task_source,p_ham_uid,p_binding_digest,p_claimant,gen_random_uuid(),clock_timestamp(),
      clock_timestamp()+make_interval(secs=>p_reservation_seconds),p_lease_seconds,p_permanent,
      false,'reserved',null,null,null)
  on conflict (task_source) do update
    set claimant=excluded.claimant,
        acquisition_token=gen_random_uuid(),
        claimed_at=excluded.claimed_at,
        lease_expires_at=excluded.lease_expires_at,
        requested_lease_seconds=excluded.requested_lease_seconds,
        requested_permanent=excluded.requested_permanent,
        permanent=false,
        admission_state='reserved',
        admitted_at=null,
        paid_started_at=null,
        aborted_at=null
    where current_claim.binding_digest=excluded.binding_digest
      and current_claim.ham_uid=excluded.ham_uid
      and current_claim.requested_permanent=excluded.requested_permanent
      and current_claim.requested_lease_seconds is not distinct from excluded.requested_lease_seconds
      and (current_claim.admission_state='aborted'
        or (current_claim.admission_state in ('reserved','admitted')
          and current_claim.permanent=false
          and current_claim.lease_expires_at<=clock_timestamp()))
  returning * into selected;

  if found then
    return jsonb_build_object('ok',true,'claimed',true,'duplicate',false,'conflict',false,
      'task_source',selected.task_source,'binding_digest',selected.binding_digest,
      'acquisition_token',selected.acquisition_token,'admission_state',selected.admission_state,
      'claimed_at',selected.claimed_at,'expires_at',selected.lease_expires_at);
  end if;

  select * into selected from memory_bank.paid_admission_claims
    where task_source=p_task_source;
  if not found then
    return jsonb_build_object('ok',false,'reason','canonical_claim_readback_unavailable');
  end if;
  if selected.ham_uid<>p_ham_uid or selected.binding_digest<>p_binding_digest
     or selected.requested_permanent<>p_permanent
     or selected.requested_lease_seconds is distinct from p_lease_seconds then
    return jsonb_build_object('ok',true,'claimed',false,'duplicate',false,'conflict',true,
      'task_source',selected.task_source,'binding_digest',p_binding_digest,
      'admission_state',selected.admission_state,'claimed_at',selected.claimed_at,
      'expires_at',selected.lease_expires_at);
  end if;
  return jsonb_build_object('ok',true,'claimed',false,'duplicate',true,'conflict',false,
    'task_source',selected.task_source,'binding_digest',selected.binding_digest,
    'admission_state',selected.admission_state,'claimed_at',selected.claimed_at,
    'expires_at',selected.lease_expires_at);
end
$function$
;
revoke all on function public.claim_anew_paid_admission(text,text,text,text,integer,boolean,integer)
  from public, anon, authenticated
;
create or replace function public.admit_anew_paid_admission(
  p_task_source text,p_ham_uid text,p_binding_digest text,p_claimant text,p_acquisition_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare selected memory_bank.paid_admission_claims%rowtype;
begin
  update memory_bank.paid_admission_claims set
    admission_state='admitted',admitted_at=clock_timestamp(),paid_started_at=null,
    aborted_at=null,permanent=false,
    lease_expires_at=clock_timestamp()+make_interval(secs=>requested_lease_seconds)
    where task_source=p_task_source and ham_uid=p_ham_uid
      and binding_digest=p_binding_digest and claimant=p_claimant
      and acquisition_token=p_acquisition_token and admission_state='reserved'
      and lease_expires_at>clock_timestamp()
    returning * into selected;
  if not found then
    select * into selected from memory_bank.paid_admission_claims
      where task_source=p_task_source and ham_uid=p_ham_uid
        and binding_digest=p_binding_digest and claimant=p_claimant
        and acquisition_token=p_acquisition_token and admission_state='admitted';
  end if;
  return jsonb_build_object('ok',true,'admitted',found,'lost',not found,
    'task_source',p_task_source,'binding_digest',p_binding_digest,
    'acquisition_token',p_acquisition_token,'admission_state',
      case when found then selected.admission_state else null end,
    'expires_at',case when found then selected.lease_expires_at else null end);
end
$function$
;
revoke all on function public.admit_anew_paid_admission(text,text,text,text,uuid)
  from public, anon, authenticated
;
create or replace function public.abort_anew_paid_admission(
  p_task_source text,p_ham_uid text,p_binding_digest text,p_claimant text,p_acquisition_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare selected memory_bank.paid_admission_claims%rowtype;
begin
  update memory_bank.paid_admission_claims set admission_state='aborted',
    aborted_at=clock_timestamp(),permanent=false,lease_expires_at=clock_timestamp()
    where task_source=p_task_source and ham_uid=p_ham_uid
      and binding_digest=p_binding_digest and claimant=p_claimant
      and acquisition_token=p_acquisition_token and admission_state='reserved'
    returning * into selected;
  if not found then
    select * into selected from memory_bank.paid_admission_claims
      where task_source=p_task_source and ham_uid=p_ham_uid
        and binding_digest=p_binding_digest and claimant=p_claimant
        and acquisition_token=p_acquisition_token and admission_state='aborted';
  end if;
  return jsonb_build_object('ok',true,'aborted',found,'lost',not found,
    'task_source',p_task_source,'binding_digest',p_binding_digest,
    'acquisition_token',p_acquisition_token,'admission_state',
      case when found then selected.admission_state else null end);
end
$function$
;
revoke all on function public.abort_anew_paid_admission(text,text,text,text,uuid)
  from public, anon, authenticated
;
create or replace function public.start_anew_paid_admission(
  p_task_source text,p_ham_uid text,p_binding_digest text,p_claimant text,p_acquisition_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare selected memory_bank.paid_admission_claims%rowtype;
begin
  update memory_bank.paid_admission_claims set
    admission_state='paid_started',paid_started_at=clock_timestamp()
    where task_source=p_task_source and ham_uid=p_ham_uid
      and binding_digest=p_binding_digest and claimant=p_claimant
      and acquisition_token=p_acquisition_token and admission_state='admitted'
      and lease_expires_at>clock_timestamp()
    returning * into selected;
  if not found then
    select * into selected from memory_bank.paid_admission_claims
      where task_source=p_task_source and ham_uid=p_ham_uid
        and binding_digest=p_binding_digest and claimant=p_claimant
        and acquisition_token=p_acquisition_token and admission_state='paid_started';
  end if;
  return jsonb_build_object('ok',true,'started',found,'lost',not found,
    'task_source',p_task_source,'binding_digest',p_binding_digest,
    'acquisition_token',p_acquisition_token,'admission_state',
      case when found then selected.admission_state else null end,
    'expires_at',case when found then selected.lease_expires_at else null end);
end
$function$
;
revoke all on function public.start_anew_paid_admission(text,text,text,text,uuid)
  from public, anon, authenticated
;
create or replace function public.complete_anew_paid_admission(
  p_task_source text,p_ham_uid text,p_binding_digest text,p_claimant text,p_acquisition_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare selected memory_bank.paid_admission_claims%rowtype;
  transitioned boolean := false;
begin
  update memory_bank.paid_admission_claims set
    admission_state='terminal',permanent=true,lease_expires_at=null
    where task_source=p_task_source and ham_uid=p_ham_uid
      and binding_digest=p_binding_digest and claimant=p_claimant
      and acquisition_token=p_acquisition_token
      and admission_state='paid_started'
    returning * into selected;
  transitioned := found;
  if not transitioned then
    select * into selected from memory_bank.paid_admission_claims
      where task_source=p_task_source and ham_uid=p_ham_uid
        and binding_digest=p_binding_digest and claimant=p_claimant
        and acquisition_token=p_acquisition_token and admission_state='terminal';
  end if;
  return jsonb_build_object('ok',true,'completed',found,'transitioned',transitioned,
    'lost',not found,
    'task_source',p_task_source,'binding_digest',p_binding_digest,
    'acquisition_token',p_acquisition_token,'admission_state',
      case when found then selected.admission_state else null end);
end
$function$
;
revoke all on function public.complete_anew_paid_admission(text,text,text,text,uuid)
  from public, anon, authenticated
;
create or replace function public.renew_anew_paid_admission(
  p_task_source text,p_ham_uid text,p_binding_digest text,p_claimant text,
  p_acquisition_token uuid,p_lease_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare selected memory_bank.paid_admission_claims%rowtype;
begin
  if p_lease_seconds is null or p_lease_seconds not between 1 and 86400 then
    return jsonb_build_object('ok',false,'reason','canonical_claim_renew_input_invalid');
  end if;
  update memory_bank.paid_admission_claims set
    lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds)
    where task_source=p_task_source and ham_uid=p_ham_uid
      and binding_digest=p_binding_digest and claimant=p_claimant
      and acquisition_token=p_acquisition_token
      and admission_state in ('admitted','paid_started') and permanent=false
      and (admission_state='paid_started' or lease_expires_at>clock_timestamp())
    returning * into selected;
  return jsonb_build_object('ok',true,'renewed',found,'lost',not found,
    'task_source',p_task_source,'binding_digest',p_binding_digest,
    'acquisition_token',p_acquisition_token,
    'expires_at',case when found then selected.lease_expires_at else null end);
end
$function$
;
revoke all on function public.renew_anew_paid_admission(text,text,text,text,uuid,integer)
  from public, anon, authenticated
;
create or replace function public.release_anew_paid_admission(
  p_task_source text,p_ham_uid text,p_binding_digest text,p_claimant text,p_acquisition_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare changed bigint:=0;
begin
  update memory_bank.paid_admission_claims set admission_state='aborted',
    aborted_at=clock_timestamp(),lease_expires_at=clock_timestamp()
    where task_source=p_task_source and ham_uid=p_ham_uid
      and binding_digest=p_binding_digest and claimant=p_claimant
      and acquisition_token=p_acquisition_token and admission_state='admitted'
      and permanent=false;
  get diagnostics changed=row_count;
  return jsonb_build_object('ok',true,'released',changed=1,'lost',changed<>1,
    'task_source',p_task_source,'binding_digest',p_binding_digest,
    'acquisition_token',p_acquisition_token);
end
$function$
;
revoke all on function public.release_anew_paid_admission(text,text,text,text,uuid)
  from public, anon, authenticated
;
do $function_privilege_assert$
declare signature text; procedure_oid oid; owner_oid oid; service_oid oid;
begin
  select oid into service_oid from pg_roles where rolname='service_role';
  foreach signature in array array[
    'public.ensure_anew_reach_escalation_indexes()',
    'public.claim_anew_paid_admission(text,text,text,text,integer,boolean,integer)',
    'public.admit_anew_paid_admission(text,text,text,text,uuid)',
    'public.abort_anew_paid_admission(text,text,text,text,uuid)',
    'public.start_anew_paid_admission(text,text,text,text,uuid)',
    'public.complete_anew_paid_admission(text,text,text,text,uuid)',
    'public.renew_anew_paid_admission(text,text,text,text,uuid,integer)',
    'public.release_anew_paid_admission(text,text,text,text,uuid)'
  ] loop
    procedure_oid:=to_regprocedure(signature);
    if procedure_oid is null then
      raise exception using errcode='55000',
        message='A''NU paid admission function missing before atomic grant: '||signature;
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
        message='A''NU paid admission function privilege isolation failed: '||signature;
    end if;
  end loop;
  if to_regprocedure('public.claim_anew_paid_admission(text,text,text,text,integer,boolean)') is not null
     or to_regprocedure('public.renew_anew_paid_admission(text,text,text,text,integer)') is not null
     or to_regprocedure('public.release_anew_paid_admission(text,text,text,text)') is not null then
    raise exception using errcode='55000',
      message='A''NU retired paid admission overload remains reachable';
  end if;
end
$function_privilege_assert$
;
notify pgrst, 'reload schema'
;
