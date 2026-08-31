begin;

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum ('coach', 'parent');
create type public.ball_stage as enum ('red', 'orange', 'green', 'yellow');
create type public.access_role as enum ('coach', 'parent');
create type public.goal_status as enum ('active', 'achieved', 'paused', 'cancelled');
create type public.assessment_context as enum ('A', 'B', 'C', 'D');
create type public.assessment_correction_kind as enum ('correction', 'clarification');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, role)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text not null check (length(trim(last_name)) > 0),
  date_of_birth date,
  tennis_start_date date,
  tennis_experience_note text,
  current_ball_stage public.ball_stage not null,
  rally_school_start_date date,
  current_focus_areas text[] not null default '{}',
  current_development_stage text,
  target_stage text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_access (
  player_id uuid not null references public.players(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  access_role public.access_role not null,
  created_at timestamptz not null default now(),
  primary key (player_id, profile_id, access_role)
);

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id),
  coach_id uuid not null references public.profiles(id),
  session_started_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 1440),
  focus_areas text[] not null default '{}',
  parent_summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_sessions_id_player_unique unique (id, player_id)
);

-- Stored separately so parent-facing session/report queries cannot return it.
create table public.session_private_notes (
  session_id uuid primary key references public.training_sessions(id) on delete cascade,
  coach_id uuid not null references public.profiles(id),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id),
  session_id uuid,
  skill text not null check (length(trim(skill)) > 0),
  difficulty_context public.assessment_context not null,
  control_placement smallint check (control_placement between 0 and 3),
  shape_net_clearance smallint check (shape_net_clearance between 0 and 3),
  depth smallint check (depth between 0 and 3),
  movement_recovery smallint check (movement_recovery between 0 and 3),
  contact_preparation smallint check (contact_preparation between 0 and 3),
  rally_consistency smallint check (rally_consistency between 0 and 3),
  successful_target_balls smallint check (successful_target_balls between 0 and 10),
  target_ball_attempts smallint check (target_ball_attempts between 1 and 100),
  serve_attempts smallint check (serve_attempts between 0 and 1000),
  serves_in smallint check (serves_in between 0 and 1000),
  return_attempts smallint check (return_attempts between 0 and 1000),
  returns_in_play smallint check (returns_in_play between 0 and 1000),
  longest_rally integer check (longest_rally >= 0),
  evaluated_at timestamptz not null default now(),
  coach_id uuid not null references public.profiles(id),
  note text,
  supersedes_assessment_id uuid,
  correction_reason text,
  correction_kind public.assessment_correction_kind,
  created_at timestamptz not null default now(),
  constraint assessments_id_player_unique unique (id, player_id),
  constraint target_success_within_attempts check (successful_target_balls is null or target_ball_attempts is null or successful_target_balls <= target_ball_attempts),
  constraint serves_in_within_attempts check (serves_in is null or serve_attempts is null or serves_in <= serve_attempts),
  constraint returns_in_within_attempts check (returns_in_play is null or return_attempts is null or returns_in_play <= return_attempts),
  constraint assessment_session_matches_player foreign key (session_id, player_id) references public.training_sessions(id, player_id),
  constraint assessment_supersedes_same_player foreign key (supersedes_assessment_id, player_id) references public.assessments(id, player_id),
  constraint assessment_correction_metadata check (
    (supersedes_assessment_id is null and correction_reason is null and correction_kind is null)
    or
    (supersedes_assessment_id is not null and correction_reason is not null and length(trim(correction_reason)) > 0 and correction_kind is not null)
  )
);

create unique index assessments_one_direct_correction_idx
  on public.assessments(supersedes_assessment_id)
  where supersedes_assessment_id is not null;

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id),
  skill text not null check (length(trim(skill)) > 0),
  metric text not null check (length(trim(metric)) > 0),
  baseline_value numeric not null,
  current_value numeric not null,
  target_value numeric not null,
  target_date date,
  status public.goal_status not null default 'active',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  player_id uuid not null references public.players(id),
  published_at timestamptz not null default now(),
  schema_version integer not null default 1 check (schema_version > 0),
  parent_summary text not null,
  session_snapshot jsonb not null check (jsonb_typeof(session_snapshot) = 'object'),
  player_snapshot jsonb not null check (jsonb_typeof(player_snapshot) = 'object'),
  goals_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(goals_snapshot) = 'array'),
  assessments_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(assessments_snapshot) = 'array'),
  published_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint one_snapshot_per_session unique (session_id),
  constraint report_session_matches_player foreign key (session_id, player_id) references public.training_sessions(id, player_id)
);

create index player_access_profile_idx on public.player_access(profile_id, access_role);
create index sessions_player_date_idx on public.training_sessions(player_id, session_started_at desc);
create index assessments_player_skill_date_idx on public.assessments(player_id, skill, evaluated_at desc);
create index assessments_session_idx on public.assessments(session_id);
create index goals_player_status_idx on public.goals(player_id, status);
create index reports_player_date_idx on public.training_report_snapshots(player_id, published_at desc);

create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create function private.enforce_immutable_columns() returns trigger
language plpgsql set search_path = '' as $$
declare immutable_column text;
begin
  foreach immutable_column in array tg_argv loop
    if (to_jsonb(new) -> immutable_column) is distinct from (to_jsonb(old) -> immutable_column) then
      raise exception 'column % is immutable on %.%', immutable_column, tg_table_schema, tg_table_name using errcode = '22000';
    end if;
  end loop;
  return new;
end;
$$;

create function private.reject_row_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'historical rows in %.% are immutable', tg_table_schema, tg_table_name using errcode = '22000';
end;
$$;

create trigger profiles_updated before update on public.profiles for each row execute function private.set_updated_at();
create trigger players_updated before update on public.players for each row execute function private.set_updated_at();
create trigger sessions_updated before update on public.training_sessions for each row execute function private.set_updated_at();
create trigger private_notes_updated before update on public.session_private_notes for each row execute function private.set_updated_at();
create trigger goals_updated before update on public.goals for each row execute function private.set_updated_at();
create trigger profiles_immutable_identity before update on public.profiles for each row execute function private.enforce_immutable_columns('id', 'created_at');
create trigger players_immutable_relationships before update on public.players for each row execute function private.enforce_immutable_columns('id', 'created_by', 'created_at');
create trigger sessions_immutable_relationships before update on public.training_sessions for each row execute function private.enforce_immutable_columns('id', 'player_id', 'coach_id', 'created_at');
create trigger private_notes_immutable_relationships before update on public.session_private_notes for each row execute function private.enforce_immutable_columns('session_id', 'coach_id', 'created_at');
create trigger goals_immutable_relationships before update on public.goals for each row execute function private.enforce_immutable_columns('id', 'player_id', 'created_by', 'created_at');
create trigger assessments_are_append_only before update or delete on public.assessments for each row execute function private.reject_row_mutation();
create trigger report_snapshots_are_immutable before update or delete on public.training_report_snapshots for each row execute function private.reject_row_mutation();

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, first_name, last_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'first_name', ''), coalesce(new.raw_user_meta_data ->> 'last_name', ''), new.email);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create function private.has_role(requested_role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profile_roles where profile_id = auth.uid() and role = requested_role);
$$;

create function private.can_read_player(requested_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.player_access where player_id = requested_player and profile_id = auth.uid());
$$;

create function private.can_manage_player(requested_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('coach') and exists(
    select 1 from public.player_access
    where player_id = requested_player and profile_id = auth.uid() and access_role = 'coach'
  );
$$;

create function private.create_player(p_player jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := auth.uid(); new_player_id uuid;
begin
  if caller_id is null or not private.has_role('coach') then
    raise exception 'authorized coach role required' using errcode = '42501';
  end if;
  if p_player is null or jsonb_typeof(p_player) <> 'object' then
    raise exception 'player payload must be an object' using errcode = '22023';
  end if;
  insert into public.players (
    first_name, last_name, date_of_birth, tennis_start_date, tennis_experience_note,
    current_ball_stage, rally_school_start_date, current_focus_areas,
    current_development_stage, target_stage, created_by
  ) values (
    p_player ->> 'first_name', p_player ->> 'last_name',
    nullif(p_player ->> 'date_of_birth', '')::date,
    nullif(p_player ->> 'tennis_start_date', '')::date,
    nullif(p_player ->> 'tennis_experience_note', ''),
    (p_player ->> 'current_ball_stage')::public.ball_stage,
    nullif(p_player ->> 'rally_school_start_date', '')::date,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_player -> 'current_focus_areas', '[]'::jsonb))), '{}'),
    nullif(p_player ->> 'current_development_stage', ''),
    nullif(p_player ->> 'target_stage', ''), caller_id
  ) returning id into new_player_id;
  insert into public.player_access (player_id, profile_id, access_role)
  values (new_player_id, caller_id, 'coach');
  return new_player_id;
end;
$$;

create function public.create_player(p_player jsonb) returns uuid
language sql security invoker set search_path = '' as $$ select private.create_player(p_player); $$;

create function private.publish_training_report(
  p_player_id uuid, p_session_started_at timestamptz, p_duration_minutes integer,
  p_focus_areas text[], p_parent_summary text, p_private_note text default null,
  p_assessments jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := auth.uid(); new_session_id uuid; new_report_id uuid;
  assessment_payload jsonb; session_state jsonb; player_state jsonb; goal_state jsonb; assessment_state jsonb;
  publication_time timestamptz := now();
begin
  if caller_id is null or not private.can_manage_player(p_player_id) then
    raise exception 'assigned coach access required' using errcode = '42501';
  end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 or p_duration_minutes > 1440 then
    raise exception 'duration must be between 1 and 1440 minutes' using errcode = '22023';
  end if;
  if p_session_started_at is null or p_parent_summary is null then
    raise exception 'session date and parent summary are required' using errcode = '22023';
  end if;
  if p_assessments is null or jsonb_typeof(p_assessments) <> 'array' then
    raise exception 'assessments payload must be an array' using errcode = '22023';
  end if;
  insert into public.training_sessions (player_id, coach_id, session_started_at, duration_minutes, focus_areas, parent_summary)
  values (p_player_id, caller_id, p_session_started_at, p_duration_minutes, coalesce(p_focus_areas, '{}'), p_parent_summary)
  returning id into new_session_id;
  if p_private_note is not null and length(trim(p_private_note)) > 0 then
    insert into public.session_private_notes (session_id, coach_id, note) values (new_session_id, caller_id, p_private_note);
  end if;
  session_state := jsonb_build_object(
    'id', new_session_id,
    'session_started_at', p_session_started_at,
    'duration_minutes', p_duration_minutes,
    'focus_areas', coalesce(p_focus_areas, '{}')
  );
  for assessment_payload in select value from jsonb_array_elements(p_assessments) loop
    insert into public.assessments (
      player_id, session_id, skill, difficulty_context, control_placement, shape_net_clearance,
      depth, movement_recovery, contact_preparation, rally_consistency, successful_target_balls,
      target_ball_attempts, serve_attempts, serves_in, return_attempts, returns_in_play,
      longest_rally, evaluated_at, coach_id, note, supersedes_assessment_id, correction_reason, correction_kind
    ) values (
      p_player_id, new_session_id, assessment_payload ->> 'skill',
      (assessment_payload ->> 'difficulty_context')::public.assessment_context,
      nullif(assessment_payload ->> 'control_placement', '')::smallint,
      nullif(assessment_payload ->> 'shape_net_clearance', '')::smallint,
      nullif(assessment_payload ->> 'depth', '')::smallint,
      nullif(assessment_payload ->> 'movement_recovery', '')::smallint,
      nullif(assessment_payload ->> 'contact_preparation', '')::smallint,
      nullif(assessment_payload ->> 'rally_consistency', '')::smallint,
      nullif(assessment_payload ->> 'successful_target_balls', '')::smallint,
      nullif(assessment_payload ->> 'target_ball_attempts', '')::smallint,
      nullif(assessment_payload ->> 'serve_attempts', '')::smallint,
      nullif(assessment_payload ->> 'serves_in', '')::smallint,
      nullif(assessment_payload ->> 'return_attempts', '')::smallint,
      nullif(assessment_payload ->> 'returns_in_play', '')::smallint,
      nullif(assessment_payload ->> 'longest_rally', '')::integer,
      coalesce(nullif(assessment_payload ->> 'evaluated_at', '')::timestamptz, publication_time),
      caller_id, nullif(assessment_payload ->> 'note', ''),
      nullif(assessment_payload ->> 'supersedes_assessment_id', '')::uuid,
      nullif(assessment_payload ->> 'correction_reason', ''),
      nullif(assessment_payload ->> 'correction_kind', '')::public.assessment_correction_kind
    );
  end loop;
  select jsonb_build_object(
    'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
    'date_of_birth', p.date_of_birth, 'tennis_start_date', p.tennis_start_date,
    'tennis_experience_note', p.tennis_experience_note, 'current_ball_stage', p.current_ball_stage,
    'rally_school_start_date', p.rally_school_start_date, 'current_focus_areas', p.current_focus_areas,
    'current_development_stage', p.current_development_stage, 'target_stage', p.target_stage
  ) into player_state from public.players p where p.id = p_player_id;
  select coalesce(jsonb_agg(to_jsonb(g) order by g.created_at), '[]'::jsonb) into goal_state
  from public.goals g where g.player_id = p_player_id;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.evaluated_at, a.created_at), '[]'::jsonb) into assessment_state
  from public.assessments a where a.player_id = p_player_id;
  insert into public.training_report_snapshots (
    session_id, player_id, published_at, schema_version, parent_summary, session_snapshot,
    player_snapshot, goals_snapshot, assessments_snapshot, published_by
  ) values (
    new_session_id, p_player_id, publication_time, 1, p_parent_summary, session_state,
    player_state, goal_state, assessment_state, caller_id
  ) returning id into new_report_id;
  return new_report_id;
end;
$$;

create function public.publish_training_report(
  p_player_id uuid, p_session_started_at timestamptz, p_duration_minutes integer,
  p_focus_areas text[], p_parent_summary text, p_private_note text default null,
  p_assessments jsonb default '[]'::jsonb
) returns uuid
language sql security invoker set search_path = '' as $$
  select private.publish_training_report(p_player_id, p_session_started_at, p_duration_minutes,
    p_focus_areas, p_parent_summary, p_private_note, p_assessments);
$$;

alter table public.profiles enable row level security;
alter table public.profile_roles enable row level security;
alter table public.players enable row level security;
alter table public.player_access enable row level security;
alter table public.training_sessions enable row level security;
alter table public.session_private_notes enable row level security;
alter table public.assessments enable row level security;
alter table public.goals enable row level security;
alter table public.training_report_snapshots enable row level security;

create policy profiles_read_self on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy roles_read_self on public.profile_roles for select to authenticated using (profile_id = auth.uid());
create policy players_read_assigned on public.players for select to authenticated using (private.can_read_player(id));
create policy players_coach_update on public.players for update to authenticated using (private.can_manage_player(id)) with check (private.can_manage_player(id));
-- No player_access policies: assignments are administered outside browser sessions.
create policy sessions_read_assigned on public.training_sessions for select to authenticated using (private.can_read_player(player_id));
create policy private_notes_coach_read on public.session_private_notes for select to authenticated using (private.can_manage_player((select s.player_id from public.training_sessions s where s.id = session_id)));
create policy private_notes_coach_insert on public.session_private_notes for insert to authenticated with check (coach_id = auth.uid() and private.can_manage_player((select s.player_id from public.training_sessions s where s.id = session_id)));
create policy private_notes_coach_update on public.session_private_notes for update to authenticated using (private.can_manage_player((select s.player_id from public.training_sessions s where s.id = session_id))) with check (private.can_manage_player((select s.player_id from public.training_sessions s where s.id = session_id)));
create policy assessments_read_assigned on public.assessments for select to authenticated using (private.can_read_player(player_id));
create policy assessments_coach_append on public.assessments for insert to authenticated with check (private.can_manage_player(player_id) and coach_id = auth.uid());
create policy goals_read_assigned on public.goals for select to authenticated using (private.can_read_player(player_id));
create policy goals_coach_insert on public.goals for insert to authenticated with check (private.can_manage_player(player_id) and created_by = auth.uid());
create policy goals_coach_update on public.goals for update to authenticated using (private.can_manage_player(player_id)) with check (private.can_manage_player(player_id));
create policy reports_read_assigned on public.training_report_snapshots for select to authenticated using (private.can_read_player(player_id));

revoke all on table public.profiles, public.profile_roles, public.players, public.player_access,
  public.training_sessions, public.session_private_notes, public.assessments, public.goals,
  public.training_report_snapshots from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.profile_roles to authenticated;
grant select, update on public.players to authenticated;
grant select on public.training_sessions to authenticated;
grant select, insert, update on public.session_private_notes to authenticated;
grant select, insert on public.assessments to authenticated;
grant select, insert, update on public.goals to authenticated;
grant select on public.training_report_snapshots to authenticated;

revoke execute on function private.has_role(public.app_role) from public, anon, authenticated;
revoke execute on function private.can_read_player(uuid) from public, anon, authenticated;
revoke execute on function private.can_manage_player(uuid) from public, anon, authenticated;
revoke execute on function private.create_player(jsonb) from public, anon, authenticated;
revoke execute on function private.publish_training_report(uuid, timestamptz, integer, text[], text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.create_player(jsonb) from public, anon, authenticated;
revoke execute on function public.publish_training_report(uuid, timestamptz, integer, text[], text, text, jsonb) from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.has_role(public.app_role) to authenticated;
grant execute on function private.can_read_player(uuid) to authenticated;
grant execute on function private.can_manage_player(uuid) to authenticated;
grant execute on function private.create_player(jsonb) to authenticated;
grant execute on function private.publish_training_report(uuid, timestamptz, integer, text[], text, text, jsonb) to authenticated;
grant execute on function public.create_player(jsonb) to authenticated;
grant execute on function public.publish_training_report(uuid, timestamptz, integer, text[], text, text, jsonb) to authenticated;

commit;
