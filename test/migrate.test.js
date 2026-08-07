// ⬡B:tests.migrate:TEST:dollar_quote_split_and_idempotent_apply:20260722⬡
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const migrate = require('../pai/core/migrate.js');

test('splitStatements respects dollar-quoting so function bodies survive', () => {
  const sql = `CREATE INDEX IF NOT EXISTS a ON t (x);
    CREATE OR REPLACE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$
    BEGIN EXECUTE 'select 1'; RETURN; END; $$;
    -- a comment
    ALTER TABLE t ADD COLUMN y int;`;
  const stmts = migrate._test.splitStatements(sql);
  assert.equal(stmts.length, 3);
  assert.match(stmts[0], /CREATE INDEX/);
  assert.match(stmts[1], /CREATE OR REPLACE FUNCTION/);
  assert.match(stmts[1], /END; \$\$/);          // the ; inside $$ did NOT split
  assert.match(stmts[2], /ALTER TABLE/);
});

test('applyMigrations runs every statement and reports per-file failures', async () => {
  const calls = [];
  const out = await migrate.applyMigrations({
    files: ['0001.sql', '0002.sql'],
    read: (f) => f === '0001.sql'
      ? 'CREATE INDEX IF NOT EXISTS a ON t (x); ALTER TABLE t ADD COLUMN y int;'
      : 'BROKEN SQL HERE;',
    exec: async (stmt) => { calls.push(stmt); return { success: !/BROKEN/.test(stmt), error: /BROKEN/.test(stmt) ? 'syntax' : null }; }
  });
  assert.equal(calls.length, 3);                // 2 + 1 statements
  assert.equal(out.any_failed, true);
  assert.equal(out.applied[0].failed.length, 0);
  assert.equal(out.applied[1].failed.length, 1);
  assert.equal(out.applied[1].failed[0].error, 'syntax');
});

test('a fully successful run reports ok', async () => {
  const out = await migrate.applyMigrations({
    files: ['x.sql'], read: () => 'CREATE INDEX IF NOT EXISTS a ON t (x);',
    exec: async () => ({ success: true })
  });
  assert.equal(out.ok, true);
  assert.equal(out.any_failed, false);
});

test('a failed statement halts before later DDL or a later migration can grant reachability', async () => {
  const calls = [];
  const out = await migrate.applyMigrations({ files:['0001.sql','0002.sql'],
    read:(file) => file === '0001.sql'
      ? 'ALTER TABLE safe; BROKEN SCHEMA ASSERTION; GRANT EXECUTE ON FUNCTION paid();'
      : 'GRANT EXECUTE ON FUNCTION later();',
    exec:async (stmt) => { calls.push(stmt); return { success:!/^BROKEN/.test(stmt), error:'blocked' }; }
  });
  assert.deepEqual(calls, ['ALTER TABLE safe', 'BROKEN SCHEMA ASSERTION']);
  assert.equal(out.ok, false);
  assert.equal(out.halted, true);
  assert.equal(out.applied.length, 1);
});

test('0005 exposes no paid RPC until its one final atomic grant and assertion statement',async()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../migrations/0005_atomic_paid_admission_claims.sql'),'utf8');
  const statements=migrate._test.splitStatements(sql);
  const grantIndex=statements.findIndex((stmt)=>stmt.includes('$function_privilege_assert$'));
  assert.ok(grantIndex>0);
  assert.equal(statements.slice(0,grantIndex).some((stmt)=>
    /grant execute on function[^;]*to\s+(?:service_role|anon|authenticated|public)\b/i.test(stmt)),false);
  const calls=[];
  const out=await migrate.applyMigrations({files:['0005.sql'],read:()=>sql,
    exec:async(stmt)=>{calls.push(stmt);return{success:calls.length!==grantIndex};}});
  assert.equal(out.ok,false);
  assert.equal(calls.some((stmt)=>stmt.includes('$function_privilege_assert$')),false);
});

test('0005 rejects unsafe function ownership before any schema or grant statement', () => {
  const sql=fs.readFileSync(path.join(__dirname,'../migrations/0005_atomic_paid_admission_claims.sql'),'utf8');
  const statements=migrate._test.splitStatements(sql);
  assert.match(statements[0],/\$paid_function_owner_preflight\$/);
  assert.match(statements[0],/pg_has_role\('service_role',owner_oid,'MEMBER'\)/);
  assert.match(statements[0],/pg_has_role\('anon',owner_oid,'MEMBER'\)/);
  assert.match(statements[0],/pg_has_role\('authenticated',owner_oid,'MEMBER'\)/);
  assert.match(statements[0],/unsafe function owner/);
  assert.ok(statements.findIndex((stmt)=>/^create table/i.test(stmt))>0);
  const final=statements.find((stmt)=>stmt.includes('$function_privilege_assert$'));
  assert.match(final,/owner_oid=service_oid/);
  assert.match(final,/pg_has_role\('service_role',owner_oid,'MEMBER'\)/);
});

test('0005 preserves only the safe owner while revoking pre-grant function callers', () => {
  const sql=fs.readFileSync(path.join(__dirname,'../migrations/0005_atomic_paid_admission_claims.sql'),'utf8');
  const statements=migrate._test.splitStatements(sql);
  const revoke=statements.find((stmt)=>stmt.includes('$retired_overloads$'));
  const final=statements.find((stmt)=>stmt.includes('$function_privilege_assert$'));
  assert.match(revoke,/select proc\.proowner,pg_get_userbyid\(proc\.proowner\)/);
  assert.match(revoke,/grant execute on function %s to %I/);
  assert.match(revoke,/acl\.grantee<>owner_oid/);
  assert.ok(revoke.indexOf('grant execute on function %s to %I')<revoke.indexOf('for acl_row in select'));
  assert.match(final,/grant execute on function %s to service_role/);
  assert.ok(statements.indexOf(revoke)<statements.indexOf(final));
  assert.match(statements[0],/pg_has_role\('anon',owner_oid,'MEMBER'\)/);
  assert.match(statements[0],/pg_has_role\('authenticated',owner_oid,'MEMBER'\)/);
});

test('every 0005 statement has balanced SQL parentheses outside comments and strings', () => {
  const sql=fs.readFileSync(path.join(__dirname,'../migrations/0005_atomic_paid_admission_claims.sql'),'utf8');
  const statements=migrate._test.splitStatements(sql);
  for(const [statementIndex,stmt] of statements.entries()){
    let depth=0,inString=false,lineComment=false,blockComment=false;
    for(let i=0;i<stmt.length;i+=1){
      const pair=stmt.slice(i,i+2),char=stmt[i];
      if(lineComment){if(char==='\n')lineComment=false;continue;}
      if(blockComment){if(pair==='*/'){blockComment=false;i+=1;}continue;}
      if(inString){if(char==="'"&&stmt[i+1]==="'"){i+=1;continue;}if(char==="'")inString=false;continue;}
      if(pair==='--'){lineComment=true;i+=1;continue;}
      if(pair==='/*'){blockComment=true;i+=1;continue;}
      if(char==="'"){inString=true;continue;}
      if(char==='(')depth+=1;
      if(char===')')depth-=1;
      assert.ok(depth>=0,'statement '+statementIndex+' closes a parenthesis it did not open');
    }
    assert.equal(depth,0,'statement '+statementIndex+' leaves a parenthesis unclosed');
    assert.equal(inString,false,'statement '+statementIndex+' leaves a SQL string unclosed');
    assert.equal(blockComment,false,'statement '+statementIndex+' leaves a block comment unclosed');
  }
});

test('0005 normalizes PostgreSQL boolean catalog flags before exact column comparison', () => {
  const sql=fs.readFileSync(path.join(__dirname,'../migrations/0005_atomic_paid_admission_claims.sql'),'utf8');
  const assertion=migrate._test.splitStatements(sql).find((stmt)=>stmt.includes('$schema_and_privilege_assert$'));
  assert.match(assertion,/case when attr\.attnotnull then 'true' else 'false' end/);
  assert.doesNotMatch(assertion,/format_type\(attr\.atttypid,attr\.atttypmod\),attr\.attnotnull/);
});

test('0004 touches only the canonical bank and removes the retired backfill parser', () => {
  const sql=fs.readFileSync(path.join(__dirname,'../migrations/0004_acl_tier_structural_people_ladder.sql'),'utf8');
  const statements=migrate._test.splitStatements(sql);
  assert.equal(statements.length,2);
  assert.equal(statements.some((stmt)=>/update\s+(?:memory_bank\.beads|abacia_core\.aibe_brain)/i.test(stmt)),false);
  assert.equal(statements.some((stmt)=>/abacia_core\.aibe_brain/i.test(stmt)),false);
  assert.match(statements[1],/^drop function if exists public\.acl_tier_from_content\(text\)$/i);
  assert.equal(statements.some((stmt)=>/create or replace function public\.acl_tier_from_content/i.test(stmt)),false);
  assert.match(sql,/Historical NULL stays NULL/);
  assert.match(sql,/governed, bounded wonder with durable progress/);
});

test('a clean 0004 rerun reaches every paid-admission statement in 0005', async () => {
  const calls=[];
  const out=await migrate.applyMigrations({files:['0004_acl_tier_structural_people_ladder.sql','0005_atomic_paid_admission_claims.sql'],
    read:(file)=>fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8'),
    exec:async(stmt)=>{calls.push(stmt);return{success:true};}});
  assert.equal(out.ok,true);
  assert.equal(out.applied[0].statements,2);
  assert.equal(out.applied[1].statements,31);
  assert.match(calls.at(-1),/notify pgrst/i);
});

test('the lexical migration tail places provider receipt storage before its atomic RPCs', () => {
  const files=fs.readdirSync(path.join(__dirname,'../migrations'))
    .filter((file)=>/\.sql$/.test(file)).sort();
  // The law this tripwire holds: 0006 creates the provider receipt storage and
  // 0007 the atomic RPCs that depend on it, so 0006 must sort first. The tail
  // snapshot fires whenever a migration is appended, so the author updates it
  // consciously: 0010 (signing_records, the document portal) is the new tail.
  assert.ok(files.indexOf('0006_provider_spend_receipts.sql')
    <files.indexOf('0007_provider_spend_atomic_admission.sql'),
    'provider receipt storage must apply before its atomic RPCs');
  assert.deepEqual(files.slice(-3),[
    '0008_provider_spend_unlimited_ceiling.sql',
    '0009_provider_spend_reconciliation.sql',
    '0010_signing_records.sql'
  ]);
});

test('atomic admission and provider receipt migrations all apply in canonical order', async () => {
  const files=['0005_atomic_paid_admission_claims.sql','0006_provider_spend_receipts.sql',
    '0007_provider_spend_atomic_admission.sql','0008_provider_spend_unlimited_ceiling.sql',
    '0009_provider_spend_reconciliation.sql'];
  const atomicSql=fs.readFileSync(path.join(__dirname,'../migrations',files[0]),'utf8');
  const providerSql=fs.readFileSync(path.join(__dirname,'../migrations',files[1]),'utf8');
  const atomicStatements=migrate._test.splitStatements(atomicSql);
  const providerStatements=migrate._test.splitStatements(providerSql);
  const providerAtomicSql=fs.readFileSync(path.join(__dirname,'../migrations',files[2]),'utf8');
  const providerAtomicStatements=migrate._test.splitStatements(providerAtomicSql);
  const unlimitedStatements=migrate._test.splitStatements(fs.readFileSync(
    path.join(__dirname,'../migrations',files[3]),'utf8'));
  const reconciliationStatements=migrate._test.splitStatements(fs.readFileSync(
    path.join(__dirname,'../migrations',files[4]),'utf8'));
  const calls=[];
  const out=await migrate.applyMigrations({files:files,
    read:(file)=>fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8'),
    exec:async(stmt)=>{calls.push(stmt);return{success:true};}});
  assert.equal(out.ok,true);
  assert.deepEqual(out.applied.map((entry)=>entry.file),files);
  assert.equal(out.applied[0].statements,atomicStatements.length);
  assert.equal(out.applied[1].statements,providerStatements.length);
  assert.equal(out.applied[2].statements,providerAtomicStatements.length);
  assert.equal(out.applied[3].statements,unlimitedStatements.length);
  assert.equal(out.applied[4].statements,reconciliationStatements.length);
  assert.match(calls[atomicStatements.length],
    /^create table if not exists memory_bank\.provider_spend_receipts/i);
  assert.equal(calls.findIndex((stmt)=>/memory_bank\.provider_spend_receipts/i.test(stmt))
    >=atomicStatements.length,true,'provider DDL must execute only after all atomic DDL');
  assert.match(providerStatements.at(-1),/^notify pgrst,\s*'reload schema'$/i);
  assert.match(providerAtomicStatements.at(-1),/^notify pgrst,\s*'reload schema'$/i);
  assert.equal(calls.at(-1),reconciliationStatements.at(-1));
});

test('an atomic admission failure prevents provider receipt DDL and schema reload', async () => {
  const files=['0005_atomic_paid_admission_claims.sql','0006_provider_spend_receipts.sql'];
  const calls=[];
  const out=await migrate.applyMigrations({files:files,
    read:(file)=>fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8'),
    exec:async(stmt)=>{
      calls.push(stmt);
      return {success:!stmt.includes('$function_privilege_assert$'),error:'atomic_fixture'};
    }});
  assert.equal(out.ok,false);
  assert.equal(out.halted,true);
  assert.deepEqual(out.applied.map((entry)=>entry.file),[files[0]]);
  assert.equal(calls.some((stmt)=>/provider_spend_receipts/i.test(stmt)),false);
  assert.equal(calls.some((stmt)=>/^notify pgrst/i.test(stmt)),false);
});

test('0006 creates one canonical Memory Bank ledger and no retired-brain mirror', () => {
  const sql=fs.readFileSync(path.join(__dirname,
    '../migrations/0006_provider_spend_receipts.sql'),'utf8');
  const statements=migrate._test.splitStatements(sql);
  const creates=statements.filter((stmt)=>/^create table/i.test(stmt));
  assert.equal(creates.length,1);
  assert.match(creates[0],
    /^create table if not exists memory_bank\.provider_spend_receipts/i);
  assert.doesNotMatch(sql,/\babacia_core\b/i);
  assert.doesNotMatch(sql,/foreach\s+target_schema/i);
  assert.doesNotMatch(sql,/grant\s+(?:select|insert|update|delete|all)[\s\S]*service_role/i);
  assert.match(sql,/revoke all on table memory_bank\.provider_spend_receipts[\s\S]*service_role/i);
  assert.match(statements.at(-1),/^notify pgrst,\s*'reload schema'$/i);
});

// The exec_sql contract must match the proven in-repo callers exactly: {query} arg,
// success on any 2xx (an empty 204 is normal success), no profile headers.
function withStubbedFetch(fn) {
  return async () => {
    const orig = global.fetch;
    const u = process.env.MEMORY_BANK_URL, k = process.env.MEMORY_BANK_KEY;
    process.env.MEMORY_BANK_URL = 'https://bank.example';
    process.env.MEMORY_BANK_KEY = 'svc-key';
    try { await fn((impl) => { global.fetch = impl; }); }
    finally {
      global.fetch = orig;
      if (u === undefined) delete process.env.MEMORY_BANK_URL; else process.env.MEMORY_BANK_URL = u;
      if (k === undefined) delete process.env.MEMORY_BANK_KEY; else process.env.MEMORY_BANK_KEY = k;
    }
  };
}

test('execSql posts {sql} to the public-schema RPC and treats {success:true}/2xx as success', withStubbedFetch(async (setFetch) => {
  let captured = null;
  // The memory-bank exec_sql returns 200 {"success":true} (verified live).
  setFetch(async (url, opts) => { captured = { url: String(url), opts }; return { ok: true, status: 200, text: async () => '{"success":true}' }; });
  const r = await migrate.execSql('CREATE INDEX IF NOT EXISTS a ON t (x)');
  assert.equal(r.success, true);
  assert.ok(captured.url.endsWith('/rest/v1/rpc/exec_sql'));
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.sql, 'CREATE INDEX IF NOT EXISTS a ON t (x)');     // verified param name on this bank
  assert.equal('query' in body, false);                                // NOT {query} (that 404s here)
  assert.equal(captured.opts.headers['Accept-Profile'], undefined);    // exec_sql is public schema
  assert.equal(captured.opts.headers['Content-Profile'], undefined);
}));

test('execSql reports a non-2xx as failure', withStubbedFetch(async (setFetch) => {
  setFetch(async () => ({ ok: false, status: 400, text: async () => 'boom' }));
  const r = await migrate.execSql('BROKEN');
  assert.equal(r.success, false);
  assert.equal(r.error, 'http_400');
}));

test('execSql honors an explicit {success:false} body even inside a 200', withStubbedFetch(async (setFetch) => {
  setFetch(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ success: false, error: 'syntax error' }) }));
  const r = await migrate.execSql('ALSO BROKEN');
  assert.equal(r.success, false);
  assert.equal(r.error, 'syntax error');
}));

test('retired-brain credentials cannot receive a canonical Memory Bank migration', async () => {
  const keys = ['MEMORY_BANK_URL','MEMORY_BANK_KEY','AIBE_BRAIN_URL','AIBE_BRAIN_KEY'];
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  delete process.env.MEMORY_BANK_URL;
  delete process.env.MEMORY_BANK_KEY;
  process.env.AIBE_BRAIN_URL = 'https://retired.example';
  process.env.AIBE_BRAIN_KEY = 'retired-key';
  let fetches = 0;
  const originalFetch = global.fetch;
  global.fetch = async function () { fetches += 1; throw new Error('must_not_run'); };
  try {
    const result = await migrate.execSql('SELECT canonical_only');
    assert.deepEqual(result, { success:false, error:'exec_sql_unconfigured' });
    assert.equal(fetches, 0);
  } finally {
    global.fetch = originalFetch;
    keys.forEach(function (key) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    });
  }
});
