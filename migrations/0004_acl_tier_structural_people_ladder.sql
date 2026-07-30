-- ⬡B:migrations.0004:GROUND:acl_tier_makes_the_people_ladder_a_database_predicate:20260726⬡
-- THE PEOPLE LADDER BECOMES STRUCTURE. The founder's 20260724 doctrine puts every person on
-- an inverted tier ladder: T0 is the founder and holds everything, T1 is the highest circle,
-- T2 is ENVOLVE only with no external-org connection, T3 early testers, T4 the wider
-- collective, and each tier inherits everything beneath it. LOWER NUMBER, MORE PRIVILEGE.
--
-- Before this migration the only place a bead's tier could live was inside content. A
-- ceiling you cannot express as a structural database predicate is not a ceiling: it
-- degrades into trimming a string after the fact, which is
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
-- The structural addition is idempotent. The only subtractive step removes the orphaned
-- parser left by the retired backfill, without CASCADE and therefore without hidden deletion.
--
-- Applied only to the canonical Memory Bank. The retired abacia_core brain is not a target
-- and receives no schema write from this runner.

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'memory_bank' and table_name = 'beads') then
    execute 'alter table memory_bank.beads add column if not exists acl_tier smallint';
    execute 'create index if not exists beads_acl_tier_idx on memory_bank.beads (acl_tier)';
    execute $c$comment on column memory_bank.beads.acl_tier is
      'Inverted people ladder, T0..T4. LOWER is MORE private: 0 owner only, 1 highest circle, 2 company only, 3 early testers, 4 collective. A reader at tier N selects acl_tier >= N. NULL means never classified and is invisible to every reader above T0, by design.'$c$;
  end if;
end
$$;

-- ⬡B:migrations.0004:FIX:remove_orphan_parser_left_by_retired_backfill:20260730⬡
-- The historical backfill is gone, so its public parser has no owner or caller. Remove the
-- already-deployed orphan explicitly. DROP without CASCADE fails safe if an unknown database
-- dependency exists rather than silently deleting another component.
drop function if exists public.acl_tier_from_content(text);

-- ⬡B:migrations.0004:FIX:eager_history_scan_cannot_block_every_later_migration:20260730⬡
-- The original third statement rescanned every NULL-tier bead and parsed content twice on
-- every invocation of the idempotent runner. The canonical bank is now large enough that
-- PostgreSQL cancels that statement at its fixed statement timeout. Because the runner is
-- fail-fast, the scan also prevented every later schema migration from executing.
--
-- Historical NULL stays NULL here. That is the doctrine's fail-closed state for legacy
-- memory, not a promotion failure. Live classification writes acl_tier on the target bead
-- through its governed wonder. Any historical classification campaign belongs to that
-- governed, bounded wonder with durable progress, not inside a synchronous schema runner.
-- There is deliberately no data UPDATE in this migration anymore.
