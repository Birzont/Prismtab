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
