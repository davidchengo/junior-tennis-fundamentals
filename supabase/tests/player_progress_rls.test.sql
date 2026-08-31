begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Stable identities make failures readable and reproducible.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'coach-a@example.test', 'not-used', now(), '{}', '{"first_name":"Coach","last_name":"A"}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'coach-b@example.test', 'not-used', now(), '{}', '{"first_name":"Coach","last_name":"B"}', now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'parent-a@example.test', 'not-used', now(), '{}', '{"first_name":"Parent","last_name":"A"}', now(), now()),
  ('10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'unrelated@example.test', 'not-used', now(), '{}', '{"first_name":"Unrelated","last_name":"User"}', now(), now());

insert into public.profile_roles (profile_id, role) values
  ('10000000-0000-0000-0000-000000000001', 'coach'),
  ('10000000-0000-0000-0000-000000000002', 'coach'),
  ('10000000-0000-0000-0000-000000000003', 'parent');

insert into public.players (id, first_name, last_name, current_ball_stage, current_development_stage, target_stage, created_by)
values
  ('20000000-0000-0000-0000-000000000001', 'Player', 'One', 'green', 'Beginner', 'Developing rally player', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'Player', 'Two', 'green', 'Beginner', 'Developing rally player', '10000000-0000-0000-0000-000000000002');

insert into public.player_access (player_id, profile_id, access_role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'coach'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'parent'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'coach');

-- Coach A: Player 1 allowed; Player 2 denied.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.players where id = '20000000-0000-0000-0000-000000000001'), 1::bigint, 'Coach A can select assigned Player 1');
select is((select count(*) from public.players where id = '20000000-0000-0000-0000-000000000002'), 0::bigint, 'Coach A cannot select unassigned Player 2');
select lives_ok($$select public.create_player('{"first_name":"Atomic","last_name":"Player","current_ball_stage":"red","current_focus_areas":[]}'::jsonb)$$, 'Authorized coach can atomically create a player and initial assignment');
select is((select count(*) from public.players where first_name = 'Atomic'), 1::bigint, 'Newly created player is immediately visible through its assignment');
select lives_ok($$select public.publish_training_report('20000000-0000-0000-0000-000000000001', now(), 60, array['forehand'], 'Published summary', 'Private only', '[]')$$, 'Coach A can atomically publish Player 1 report');
insert into public.goals (id, player_id, skill, metric, baseline_value, current_value, target_value, created_by)
values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Forehand', 'Targets out of 10', 2, 2, 8, '10000000-0000-0000-0000-000000000001');
select pass('Coach A can create a goal for Player 1');
insert into public.assessments (id, player_id, skill, difficulty_context, control_placement, evaluated_at, coach_id)
values ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Forehand', 'A', 1, now(), '10000000-0000-0000-0000-000000000001');
select pass('Coach A can append an assessment for Player 1');
select is((with changed as (update public.players set first_name = 'Blocked' where id = '20000000-0000-0000-0000-000000000002' returning 1) select count(*) from changed), 0::bigint, 'Coach A cannot mutate Player 2');
select throws_ok($$insert into public.goals (player_id, skill, metric, baseline_value, current_value, target_value, created_by) values ('20000000-0000-0000-0000-000000000002', 'Serve', 'In', 1, 1, 5, '10000000-0000-0000-0000-000000000001')$$, '42501', 'Coach A cannot add a goal to Player 2');
select throws_ok($$insert into public.player_access (player_id, profile_id, access_role) values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'coach')$$, '42501', 'Coach A cannot manipulate player_access');
select throws_ok($$insert into public.profile_roles (profile_id, role) values ('10000000-0000-0000-0000-000000000001', 'parent')$$, '42501', 'Coach A cannot manipulate profile_roles');
select throws_ok($$update public.players set created_by = '10000000-0000-0000-0000-000000000003' where id = '20000000-0000-0000-0000-000000000001'$$, '22000', 'Player created_by is immutable');

-- Removed assignment takes effect immediately and cannot be restored by the former coach.
reset role;
delete from public.player_access where player_id = '20000000-0000-0000-0000-000000000001' and profile_id = '10000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.players where id = '20000000-0000-0000-0000-000000000001'), 0::bigint, 'Former coach immediately loses Player 1 access');
select throws_ok($$select public.publish_training_report('20000000-0000-0000-0000-000000000001', now(), 30, array['serve'], 'Denied', null, '[]')$$, '42501', 'Former coach cannot publish for Player 1');
select throws_ok($$insert into public.player_access (player_id, profile_id, access_role) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'coach')$$, '42501', 'Former coach cannot re-add themselves');
reset role;
insert into public.player_access values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'coach', now());

-- Parent A: assigned reads allowed, all coaching writes and private notes denied.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.players where id = '20000000-0000-0000-0000-000000000001'), 1::bigint, 'Parent A can select assigned Player 1');
select is((select count(*) from public.training_sessions where player_id = '20000000-0000-0000-0000-000000000001'), 1::bigint, 'Parent A can select Player 1 sessions');
select is((select count(*) from public.assessments where player_id = '20000000-0000-0000-0000-000000000001'), 1::bigint, 'Parent A can select Player 1 assessments');
select is((select count(*) from public.goals where player_id = '20000000-0000-0000-0000-000000000001'), 1::bigint, 'Parent A can select Player 1 goals');
select is((select count(*) from public.training_report_snapshots where player_id = '20000000-0000-0000-0000-000000000001'), 1::bigint, 'Parent A can select Player 1 historical reports');
select is((select count(*) from public.session_private_notes), 0::bigint, 'Parent A cannot read private notes through direct SQL/API');
select is((select count(*) from public.players where id = '20000000-0000-0000-0000-000000000002'), 0::bigint, 'Parent A cannot select Player 2');
select is((with changed as (update public.players set first_name = 'Blocked' where id = '20000000-0000-0000-0000-000000000001' returning 1) select count(*) from changed), 0::bigint, 'Parent A cannot update Player 1');
select throws_ok($$insert into public.assessments (player_id, skill, difficulty_context, coach_id) values ('20000000-0000-0000-0000-000000000001', 'Serve', 'A', '10000000-0000-0000-0000-000000000003')$$, '42501', 'Parent A cannot append assessments');
select throws_ok($$insert into public.goals (player_id, skill, metric, baseline_value, current_value, target_value, created_by) values ('20000000-0000-0000-0000-000000000001', 'Serve', 'In', 1, 1, 5, '10000000-0000-0000-0000-000000000003')$$, '42501', 'Parent A cannot insert goals');
select throws_ok($$select public.publish_training_report('20000000-0000-0000-0000-000000000001', now(), 30, array['serve'], 'Denied', null, '[]')$$, '42501', 'Parent A cannot publish reports');
select throws_ok($$select public.create_player('{"first_name":"Denied","last_name":"Player","current_ball_stage":"red","current_focus_areas":[]}'::jsonb)$$, '42501', 'Parent A cannot create players');
select throws_ok($$update public.training_report_snapshots set parent_summary = 'Changed'$$, '42501', 'Parent A cannot update snapshots');
select throws_ok($$delete from public.training_sessions$$, '42501', 'Parent A cannot delete sessions');

-- Unrelated authenticated and signed-out anon roles receive nothing.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is((select count(*) from public.players), 0::bigint, 'Unrelated authenticated user cannot read players');
select is((select count(*) from public.training_report_snapshots), 0::bigint, 'Unrelated authenticated user cannot read reports');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select * from public.players$$, '42501', 'Anonymous role cannot read players');
select throws_ok($$select * from public.training_report_snapshots$$, '42501', 'Anonymous role cannot read reports');

-- Historical snapshot remains unchanged when current state changes.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.publish_training_report('20000000-0000-0000-0000-000000000001', now(), 45, array['forehand'], 'Historical baseline', null, '[]')$$, 'Coach publishes snapshot with current goal/profile state');
update public.players set current_development_stage = 'Advanced' where id = '20000000-0000-0000-0000-000000000001';
update public.goals set current_value = 7 where id = '30000000-0000-0000-0000-000000000001';
select is((select player_snapshot ->> 'current_development_stage' from public.training_report_snapshots where parent_summary = 'Historical baseline'), 'Beginner', 'Historical report retains original development stage');
select is((select goals_snapshot -> 0 ->> 'current_value' from public.training_report_snapshots where parent_summary = 'Historical baseline'), '2', 'Historical report retains original goal value');

-- Assessment correction lineage is append-only, unique, and player-safe.
insert into public.assessments (id, player_id, skill, difficulty_context, control_placement, coach_id, supersedes_assessment_id, correction_reason, correction_kind)
values ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Forehand', 'A', 2, '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Score entered incorrectly', 'correction');
select is((select count(*) from public.assessments where id in ('40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002')), 2::bigint, 'Original and correction both remain');
select is((select supersedes_assessment_id from public.assessments where id = '40000000-0000-0000-0000-000000000002'), '40000000-0000-0000-0000-000000000001'::uuid, 'Correction links to original');
select throws_ok($$insert into public.assessments (player_id, skill, difficulty_context, coach_id, supersedes_assessment_id, correction_reason, correction_kind) values ('20000000-0000-0000-0000-000000000001', 'Forehand', 'A', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Second replacement', 'correction')$$, '23505', 'Only one direct correction may supersede an assessment');
select throws_ok($$update public.assessments set note = 'Changed' where id = '40000000-0000-0000-0000-000000000001'$$, '42501', 'Authenticated clients cannot update original assessments');

reset role;
select throws_ok($$insert into public.assessments (player_id, skill, difficulty_context, coach_id, supersedes_assessment_id, correction_reason, correction_kind) values ('20000000-0000-0000-0000-000000000002', 'Forehand', 'A', '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'Wrong player', 'correction')$$, '23503', 'Cross-player assessment supersession fails');
select throws_ok($$update public.training_report_snapshots set parent_summary = 'Admin change'$$, '22000', 'Snapshot immutability is enforced even for table owner');
select throws_ok($$update public.training_sessions set coach_id = '10000000-0000-0000-0000-000000000002'$$, '22000', 'Session coach identity is database-immutable');
select throws_ok($$update public.goals set player_id = '20000000-0000-0000-0000-000000000002' where id = '30000000-0000-0000-0000-000000000001'$$, '22000', 'Goal player identity is database-immutable');

select * from finish();
rollback;
