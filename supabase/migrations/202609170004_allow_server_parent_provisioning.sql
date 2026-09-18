begin;

-- The service-role key is kept only inside the coach-provision-player Edge
-- Function. These grants let that server-only function create a parent
-- account's role and player assignment; browser sessions remain governed by
-- the existing RLS policies and do not receive any new privileges.
grant select on public.profiles to service_role;
grant select, insert on public.profile_roles to service_role;
grant select, insert, delete on public.players to service_role;
grant insert on public.player_access to service_role;

commit;
