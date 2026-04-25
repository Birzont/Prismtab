-- Invite table for Prismtab organizations.
-- Uses shortcut_ prefix per project convention.

create table if not exists public.shortcut_org_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.shortcut_organizations(id) on delete cascade,
  invite_code text not null unique,
  expires_at timestamptz not null,
  created_by_user_id uuid references public.users(id) on delete set null,
  consumed_at timestamptz,
  consumed_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shortcut_org_invites_org_unique unique (organization_id)
);

alter table public.shortcut_org_invites
  add column if not exists organization_name text,
  add column if not exists organization_logo_url text;

create index if not exists shortcut_org_invites_code_idx on public.shortcut_org_invites(invite_code);
create index if not exists shortcut_org_invites_org_idx on public.shortcut_org_invites(organization_id);

alter table public.shortcut_org_invites enable row level security;

-- Organization owners can create/update active invite codes for their own org.
drop policy if exists "shortcut_org_invites_owner_upsert" on public.shortcut_org_invites;
create policy "shortcut_org_invites_owner_upsert"
on public.shortcut_org_invites
for all
to authenticated
using (
  exists (
    select 1
    from public.shortcut_organizations o
    where o.id = organization_id
      and o.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.shortcut_organizations o
    where o.id = organization_id
      and o.owner_id = auth.uid()
  )
);

-- Any authenticated user can resolve active invite codes.
drop policy if exists "shortcut_org_invites_lookup_active" on public.shortcut_org_invites;
create policy "shortcut_org_invites_lookup_active"
on public.shortcut_org_invites
for select
to authenticated
using (
  consumed_at is null
  and expires_at > now()
);

-- Accept invite via RPC to avoid direct shortcut_organizations RLS update failures.
create or replace function public.accept_shortcut_org_invite(p_invite_code text)
returns table (
  org_id uuid,
  org_name text,
  org_logo_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_code text;
  v_invite record;
  v_members uuid[];
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_code := upper(trim(coalesce(p_invite_code, '')));
  if v_code = '' then
    raise exception 'Invalid invite code';
  end if;

  select *
  into v_invite
  from public.shortcut_org_invites i
  where upper(i.invite_code) = v_code
    and i.consumed_at is null
    and i.expires_at > now()
  limit 1
  for update;

  if v_invite.id is null then
    raise exception 'Invite not found or expired';
  end if;

  select coalesce(o.member_user_ids, array[]::uuid[])
  into v_members
  from public.shortcut_organizations o
  where o.id = v_invite.organization_id
  for update;

  if v_members is null then
    raise exception 'Organization not found';
  end if;

  if not (v_uid = any(v_members)) then
    v_members := array_append(v_members, v_uid);
    update public.shortcut_organizations
    set member_user_ids = v_members
    where id = v_invite.organization_id;
  end if;

  update public.shortcut_org_invites
  set consumed_at = now(),
      consumed_by_user_id = v_uid,
      updated_at = now()
  where id = v_invite.id;

  return query
  select v_invite.organization_id, coalesce(v_invite.organization_name, ''), coalesce(v_invite.organization_logo_url, '');
end;
$$;

revoke all on function public.accept_shortcut_org_invite(text) from public;
grant execute on function public.accept_shortcut_org_invite(text) to authenticated;

create or replace function public.transfer_shortcut_org_owner(p_org_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_members uuid[];
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_org_id is null or p_new_owner_id is null then
    raise exception 'Invalid owner transfer params';
  end if;

  select coalesce(member_user_ids, array[]::uuid[])
  into v_members
  from public.shortcut_organizations
  where id = p_org_id
    and owner_id = v_uid
  for update;

  if v_members is null then
    raise exception 'Only owner can transfer ownership';
  end if;

  if not (p_new_owner_id = any(v_members)) then
    v_members := array_append(v_members, p_new_owner_id);
  end if;

  update public.shortcut_organizations
  set owner_id = p_new_owner_id,
      member_user_ids = v_members
  where id = p_org_id;
end;
$$;

revoke all on function public.transfer_shortcut_org_owner(uuid, uuid) from public;
grant execute on function public.transfer_shortcut_org_owner(uuid, uuid) to authenticated;

create or replace function public.leave_shortcut_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_org record;
  v_members uuid[];
  v_aliases jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_org_id is null then
    raise exception 'Invalid organization';
  end if;

  select id, owner_id, coalesce(member_user_ids, array[]::uuid[]) as member_user_ids, coalesce(member_aliases, '{}'::jsonb) as member_aliases
  into v_org
  from public.shortcut_organizations
  where id = p_org_id
  for update;

  if v_org.id is null then
    raise exception 'Organization not found';
  end if;
  if v_org.owner_id = v_uid then
    raise exception 'Owner must transfer ownership first';
  end if;
  if not (v_uid = any(v_org.member_user_ids)) then
    raise exception 'You are not a member of this organization';
  end if;

  v_members := array_remove(v_org.member_user_ids, v_uid);
  v_aliases := v_org.member_aliases - v_uid::text;

  update public.shortcut_organizations
  set member_user_ids = v_members,
      member_aliases = v_aliases
  where id = p_org_id;
end;
$$;

revoke all on function public.leave_shortcut_org(uuid) from public;
grant execute on function public.leave_shortcut_org(uuid) to authenticated;

create or replace function public.delete_shortcut_org(p_org_id uuid, p_confirm_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_confirm_text is distinct from 'Delete' then
    raise exception 'Type Delete to confirm';
  end if;

  delete from public.shortcut_organizations
  where id = p_org_id
    and owner_id = v_uid;

  if not found then
    raise exception 'Only owner can delete this organization';
  end if;
end;
$$;

revoke all on function public.delete_shortcut_org(uuid, text) from public;
grant execute on function public.delete_shortcut_org(uuid, text) to authenticated;
