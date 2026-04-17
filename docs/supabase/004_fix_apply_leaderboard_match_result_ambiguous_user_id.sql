-- Fixes RPC error:
-- code 42702: column reference "user_id" is ambiguous
-- Safe to run multiple times.

drop function if exists public.apply_leaderboard_match_result(uuid, text, text);
create or replace function public.apply_leaderboard_match_result(
  p_user_id uuid,
  p_display_name text,
  p_result text
)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  leaderboard_points int,
  wins int,
  losses int,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result text;
  v_display_name text;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  v_result := lower(trim(coalesce(p_result, '')));
  if v_result not in ('win', 'loss') then
    raise exception 'p_result must be win or loss';
  end if;

  v_display_name := left(coalesce(nullif(trim(p_display_name), ''), 'Traveler'), 16);

  insert into public.leaderboard_profiles (user_id, display_name)
  values (p_user_id, v_display_name)
  on conflict on constraint leaderboard_profiles_user_id_key
  do update set
    display_name = excluded.display_name,
    updated_at = now();

  if v_result = 'win' then
    update public.leaderboard_profiles lp
    set
      display_name = v_display_name,
      wins = coalesce(lp.wins, 0) + 1,
      leaderboard_points = coalesce(lp.leaderboard_points, 0) + 3,
      updated_at = now()
    where lp.user_id = p_user_id;
  else
    update public.leaderboard_profiles lp
    set
      display_name = v_display_name,
      losses = coalesce(lp.losses, 0) + 1,
      leaderboard_points = greatest(0, coalesce(lp.leaderboard_points, 0) - 3),
      updated_at = now()
    where lp.user_id = p_user_id;
  end if;

  return query
  select
    lp.id,
    lp.user_id,
    lp.display_name,
    lp.leaderboard_points,
    lp.wins,
    lp.losses,
    lp.created_at,
    lp.updated_at
  from public.leaderboard_profiles lp
  where lp.user_id = p_user_id
  limit 1;
end;
$$;

grant execute on function public.apply_leaderboard_match_result(uuid, text, text) to authenticated;
