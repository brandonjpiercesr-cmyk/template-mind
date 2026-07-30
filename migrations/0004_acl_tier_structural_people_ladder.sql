-- ⬡B:migrations.0004:GROUND:acl_tier_makes_the_people_ladder_a_database_predicate:20260726⬡
-- THE PEOPLE LADDER BECOMES STRUCTURE. The founder's 20260724 doctrine puts every person on
-- an inverted tier ladder: T0 is the founder and holds everything, T1 is the highest circle,
-- T2 is ENVOLVE only with no external-org connection, T3 early testers, T4 the wider
-- collective, and each tier inherits everything beneath it. LOWER NUMBER, MORE PRIVILEGE.
--
-- Before this migration the only place a bead's tier could live was inside content, and
-- content is a TEXT column on the legacy bank (verified live 20260726: a seeded row came
-- back with typeof content 'string', and content->privacy->>tier=gte.1 matched nothing at
-- all, including rows that genuinely carried tier 1). A ceiling you cannot express as a
-- predicate is not a ceiling: it degrades into trimming a string after the fact, which is
-- precisely what must not happen when four personalised worlds are open in one room.
--
-- So the tier gets a real, indexed, first-class column. A world's read becomes
-- acl_tier=gte.<its own tier>, evaluated by Postgres, and content above the reader's tier is
-- never SELECTED: it does not travel the wire, does not land in a variable, does not reach a
-- log line, and cannot be leaked by the next caller who forgets to filter.
--
-- FAILS CLOSED BY CONSTRUCTION, and this is the important part. The column is NULLABLE with
-- NO default, so every bead written before the mark existed carries NULL. In SQL, NULL >= 1
-- is NULL, and PostgREST drops the row. Unclassified legacy memory is therefore INVISIBLE to
-- every non-T0 reader without anyone having to classify it first. T0 is filtered by nothing
-- at all, so the founder's own world keeps every bead it has ever had and no existing
-- behaviour changes anywhere.
--
-- Additive and idempotent: no existing column, index, read path or write path is altered, so
-- re-applying is safe and rolling back is a single drop column.
--
-- Applied to both banks by the runner. The legacy bank (abacia_core.aibe_brain) is the
-- current canonical brain per core/brain.client.js; memory_bank.beads is the live bank. Each
-- statement is guarded so whichever table is absent in a given project is simply skipped.

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'abacia_core' and table_name = 'aibe_brain') then
    execute 'alter table abacia_core.aibe_brain add column if not exists acl_tier smallint';
    execute 'create index if not exists aibe_brain_acl_tier_idx on abacia_core.aibe_brain (acl_tier)';
    execute $c$comment on column abacia_core.aibe_brain.acl_tier is
      'Inverted people ladder, T0..T4. LOWER is MORE private: 0 owner only, 1 highest circle, 2 company only, 3 early testers, 4 collective. A reader at tier N selects acl_tier >= N. NULL means never classified and is invisible to every reader above T0, by design.'$c$;
  end if;

  if exists (select 1 from information_schema.tables
             where table_schema = 'memory_bank' and table_name = 'beads') then
    execute 'alter table memory_bank.beads add column if not exists acl_tier smallint';
    execute 'create index if not exists beads_acl_tier_idx on memory_bank.beads (acl_tier)';
    execute $c$comment on column memory_bank.beads.acl_tier is
      'Inverted people ladder, T0..T4. LOWER is MORE private: 0 owner only, 1 highest circle, 2 company only, 3 early testers, 4 collective. A reader at tier N selects acl_tier >= N. NULL means never classified and is invisible to every reader above T0, by design.'$c$;
  end if;
end
$$;

-- A GUARDED READER for the tier that may already be sitting inside content. Not decoration:
-- the naive cast was tried against the live bank on 20260726 and Postgres refused the whole
-- statement with 22P02, "Unicode low surrogate must follow a high surrogate", because real
-- beads in the bank hold content text that is not valid JSON. One malformed row out of tens
-- of thousands aborts an unguarded UPDATE, which would leave a migration that appears to have
-- run and has classified nothing. This returns NULL for anything it cannot read cleanly, and
-- NULL is the safe answer here: an unreadable bead stays unclassified, which means invisible
-- to every reader above T0. Immutable and idempotent, so re-applying is free.
create or replace function public.acl_tier_from_content(raw text)
returns smallint
language plpgsql
immutable
as $f$
declare
  parsed jsonb;
  value text;
begin
  if raw is null or ltrim(raw) not like '{%' then return null; end if;
  begin
    parsed := raw::jsonb;
  exception when others then
    return null;
  end;
  value := parsed -> 'privacy' ->> 'tier';
  if value in ('0','1','2','3','4') then return value::smallint; end if;
  return null;
exception when others then
  return null;
end
$f$;

-- BACKFILL, one direction only and only where a mark already exists. Beads whose content
-- already carries a privacy envelope (written by core/privacy.WONDER.classification.20260726.js
-- or seeded by the doctrine feed) get their column populated from it. Everything else is left
-- NULL on purpose: a bead nobody classified must not be promoted to shareable by a migration.
-- Handles both content shapes, jsonb on the live bank and text on the legacy one, and it
-- never overwrites a column value that is already set.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'abacia_core' and table_name = 'aibe_brain'
               and column_name = 'content') then
    execute $u$
      update abacia_core.aibe_brain
         set acl_tier = public.acl_tier_from_content(content::text)
       where acl_tier is null
         and public.acl_tier_from_content(content::text) is not null
    $u$;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'memory_bank' and table_name = 'beads'
               and column_name = 'content') then
    execute $u$
      update memory_bank.beads
         set acl_tier = public.acl_tier_from_content(content::text)
       where acl_tier is null
         and public.acl_tier_from_content(content::text) is not null
    $u$;
  end if;
end
$$;
