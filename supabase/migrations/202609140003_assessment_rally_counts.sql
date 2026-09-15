begin;

alter table public.assessments
  add column if not exists longest_rally_with_trainees integer
  check (longest_rally_with_trainees >= 0);

commit;
