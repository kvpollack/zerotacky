-- 022: changing the admin PIN revokes every grant issued for the meet (Astra DR-01, dry run 2026-10-21).
-- Grants (011) are minted by zt_check_admin_pin and checked by zt_has_grant against the current join code only, so a
-- judge phone that unlocked with the old PIN kept writing after the promoter changed it. Rotating the code already
-- cut them off; the PIN now does too. Signed-in owners and members never use grants, so they are unaffected.
-- Same file for staging and prod. Idempotent.

create or replace function zt_revoke_grants_on_pin_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.admin_pin is distinct from old.admin_pin then
    update meet_grants set revoked_at = now() where meet_id = new.id and revoked_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists meets_pin_change_revokes_grants on meets;
create trigger meets_pin_change_revokes_grants
  after update of admin_pin on meets
  for each row execute function zt_revoke_grants_on_pin_change();

revoke execute on function zt_revoke_grants_on_pin_change() from public, anon, authenticated;
