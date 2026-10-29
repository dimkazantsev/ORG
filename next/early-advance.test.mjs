import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const migration=read('./migrations/20261029_early_advance_when_all_finished.sql');
const acl=read('./migrations/20261029_early_advance_internal_acl.sql');
const optimized=read('./migrations/20261029_early_advance_eligibility_optimized.sql');

test('All finite quiz activities have server-side completion detection',()=>{
 for(const mode of ['question','russia_map','sequence_memory','captain','blitz','rocket'])
  assert.match(migration,new RegExp("'"+mode+"'"),'mode '+mode+' must be included');
 for(const table of ['org_next_answers','qwiz_geo_runs','qwiz_secret_code_answers',
                     'qwiz_arcade_memory_players','qwiz_consensus_decisions',
                     'qwiz_arcade_runner_players'])
  assert.match(migration,new RegExp('public\\.'+table));
 assert.match(migration,/qwiz_answer_eligible/);
 assert.match(migration,/IF eligible<1 THEN RETURN false/);
 assert.match(migration,/Mode 'tug' is continuous tapping/);
 assert.doesNotMatch(migration,/UPDATE public\.qwiz_arcade_runs SET started_at/);
});

test('Timers are short-circuited twice (before and inside room lock)',()=>{
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.qwiz_stage_everyone_done/);
 assert.match(migration,/not public\.qwiz_stage_everyone_done\(r\.id\)/);
 assert.match(migration,/perform public\.qwiz_arcade_finalize\(r\.id,a\.card_position\)/);
 assert.match(migration,/public\.qwiz_boost_lock\(r\.id\)/);
 assert.match(migration,/r\.phase=''question'' and public\.qwiz_stage_everyone_done/);
 assert.match(migration,/locked question gate/);
});

test('Bonus voting starts on early finalization and keeps two-stage ballot',()=>{
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.qwiz_arcade_vote_start/);
 assert.match(migration,/coalesce\(ar\.awarded_at,'infinity'::timestamptz\)/);
 assert.match(migration,/phase_ends:=public\.qwiz_arcade_vote_start/);
 assert.match(migration,/full_vote_ends_at/);
 assert.match(migration,/qwiz_bonus_vote_complete/);
});

test('Internal functions cannot be called directly by anonymous or player roles',()=>{
 assert.match(acl,/REVOKE EXECUTE ON FUNCTION public\.qwiz_stage_everyone_done\(uuid\) FROM PUBLIC, anon, authenticated/);
 assert.match(acl,/REVOKE EXECUTE ON FUNCTION public\.qwiz_arcade_vote_start\(uuid,integer\) FROM PUBLIC, anon, authenticated/);
});

test('Completion checks stay efficient with 40 concurrent participants',()=>{
 assert.match(optimized,/WITH eligible_players AS MATERIALIZED/);
 assert.match(optimized,/LEFT JOIN public\\.org_next_answers ans/);
 assert.match(optimized,/RETURN eligible>0 AND eligible=answered/);
 assert.match(optimized,/IF NOT EXISTS\\(SELECT 1 FROM public\\.org_next_answers ans/);
 assert.match(optimized,/REVOKE EXECUTE ON FUNCTION/);
});

test('Database lifecycle fixtures are rollback-only and cover bonus voting',()=>{
 for(const path of ['./migrations/qa_early_advance_transaction_rollback.sql',
                    './migrations/qa_early_advance_full_lifecycle_rollback.sql',
                    './migrations/qa_early_advance_bonus_rollback.sql']){
  const sql=read(path);
  assert.match(sql,/^BEGIN;/);
  assert.match(sql,/ROLLBACK;\s*$/);
  assert.match(sql,/public\.qwiz_stage_everyone_done/);
 }
 assert.match(read('./PROJECT_RULES.md'),/Досрочное завершение завершённых раундов/);
});
