begin;

alter table public.assessments
  add column if not exists assessment_area text,
  add column if not exists groundstroke_stroke text,
  add column if not exists longest_rally_band text,
  add column if not exists longest_deep_ball_streak_band text,
  add column if not exists training_duration_minutes integer;

alter table public.assessments
  alter column difficulty_context drop not null;

alter table public.assessments
  alter column assessment_area set default 'Groundstrokes';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assessments_area_check'
  ) then
    alter table public.assessments
      add constraint assessments_area_check
      check (
        assessment_area is null
        or assessment_area in (
          'Groundstrokes',
          'Serve',
          'Return',
          'Point Play'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assessments_groundstroke_stroke_check'
  ) then
    alter table public.assessments
      add constraint assessments_groundstroke_stroke_check
      check (
        groundstroke_stroke is null
        or groundstroke_stroke in ('Both','Forehand','Backhand')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assessments_longest_rally_band_check'
  ) then
    alter table public.assessments
      add constraint assessments_longest_rally_band_check
      check (
        longest_rally_band is null
        or longest_rally_band in ('1-5','6-10','11-20','21+')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assessments_deep_ball_streak_band_check'
  ) then
    alter table public.assessments
      add constraint assessments_deep_ball_streak_band_check
      check (
        longest_deep_ball_streak_band is null
        or longest_deep_ball_streak_band in ('1-5','6-10','11-20','21+')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assessments_training_duration_check'
  ) then
    alter table public.assessments
      add constraint assessments_training_duration_check
      check (
        training_duration_minutes is null
        or training_duration_minutes in (60,90,120)
      );
  end if;
end $$;

create table if not exists public.assessment_deletions (
  assessment_id uuid primary key
    references public.assessments(id) on delete restrict,
  player_id uuid not null
    references public.players(id) on delete restrict,
  deleted_by uuid
    references public.profiles(id) on delete set null,
  deleted_at timestamptz not null default now()
);

alter table public.assessment_deletions enable row level security;

create or replace function private.is_assessment_deleted(
  p_assessment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assessment_deletions d
    where d.assessment_id = p_assessment_id
  );
$$;

revoke all
on function private.is_assessment_deleted(uuid)
from public, anon, authenticated;

grant execute
on function private.is_assessment_deleted(uuid)
to authenticated;

drop policy if exists assessment_deletions_coach_insert
on public.assessment_deletions;

create policy assessment_deletions_coach_insert
on public.assessment_deletions
for insert
to authenticated
with check (
  private.can_manage_player(player_id)
  and deleted_by = auth.uid()
  and exists (
    select 1
    from public.assessments a
    where a.id = assessment_id
      and a.player_id = assessment_deletions.player_id
  )
);

drop policy if exists assessments_read_assigned
on public.assessments;

create policy assessments_read_assigned
on public.assessments
for select
to authenticated
using (
  private.can_read_player(player_id)
  and not private.is_assessment_deleted(id)
);

revoke all
on table public.assessment_deletions
from public, anon, authenticated;

grant insert
on table public.assessment_deletions
to authenticated;

commit;
