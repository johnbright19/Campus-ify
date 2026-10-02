-- Enable btree_gist extension for exclusion constraint
create extension if not exists btree_gist;

-- ENUMS
create type user_role as enum ('student', 'faculty', 'hod', 'admin');
create type booking_status as enum ('pending', 'approved', 'rejected', 'cancelled', 'completed', 'no_show');
create type waitlist_status as enum ('waiting', 'offered', 'confirmed', 'expired', 'cancelled');

-- PROFILES (extends Supabase auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  role user_role not null default 'student',
  department text,
  club text,
  no_show_count int not null default 0,
  created_at timestamptz default now()
);

-- Trigger to automatically populate profile when a user signs in via Google / Supabase Auth
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users for each row execute function handle_new_user();

-- RESOURCES
create table resources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,                      -- seminar_hall | lab | classroom | auditorium | ground | equipment
  location text,
  capacity int default 0,
  features jsonb default '[]'::jsonb,      -- ["projector","ac","mic","whiteboard"]
  requires_approval boolean default true,
  approver_role user_role default 'hod',
  owner_department text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- BOOKING GROUPS (for bundled equipment / rooms)
create table booking_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  created_at timestamptz default now()
);

-- BOOKINGS (one row per resource per time range)
create table bookings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references booking_groups(id) on delete set null,
  user_id uuid not null references profiles(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  title text not null,
  purpose text,
  event_type text not null default 'club',  -- exam | placement | academic | fest | club | personal
  attendees int default 0,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status booking_status not null default 'pending',
  priority_score numeric default 0,
  priority_breakdown jsonb default '{}'::jsonb,
  ai_meta jsonb default '{}'::jsonb,
  verified boolean default false,           -- approver verified high-priority claim
  qr_token text,
  checked_in_at timestamptz,
  created_at timestamptz default now(),
  constraint valid_range check (end_time > start_time),
  -- CORE GUARANTEE: no two approved bookings overlap on a resource
  constraint no_double_booking exclude using gist (
    resource_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  ) where (status = 'approved')
);

create index on bookings (resource_id, start_time, end_time);
create index on bookings (user_id);
create index on bookings (status);

-- WAITLIST
create table waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  title text,
  event_type text default 'club',
  start_time timestamptz not null,
  end_time timestamptz not null,
  priority_score numeric default 0,
  status waitlist_status default 'waiting',
  offer_expires_at timestamptz,
  created_at timestamptz default now()
);

create index on waitlist (resource_id, status, priority_score desc);

-- APPROVALS
create table approvals (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  approver_id uuid references profiles(id) on delete set null,
  stage int default 1,
  decision text,                            -- approved | rejected | changes_requested
  reason text,
  decided_at timestamptz
);

-- BLACKOUTS (maintenance, exams, holidays)
create table blackouts (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid references resources(id) on delete cascade,   -- null = global (holiday)
  reason text,
  start_time timestamptz not null,
  end_time timestamptz not null
);

-- NOTIFICATIONS
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text not null,
  link text default '/',
  is_read boolean default false,
  created_at timestamptz default now()
);

create index on notifications (user_id, is_read, created_at desc);

-- AUDIT LOGS
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- AI RUNS (observability)
create table ai_runs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid references profiles(id) on delete set null,
  input jsonb,
  output jsonb,
  latency_ms int,
  used_fallback boolean default false,
  outcome text,                             -- accepted | overridden | n/a
  created_at timestamptz default now()
);

-- ROW LEVEL SECURITY (RLS)
alter table profiles       enable row level security;
alter table resources      enable row level security;
alter table bookings       enable row level security;
alter table waitlist       enable row level security;
alter table approvals      enable row level security;
alter table blackouts      enable row level security;
alter table notifications  enable row level security;
alter table audit_logs     enable row level security;
alter table ai_runs        enable row level security;
alter table booking_groups enable row level security;

-- Policies for Authenticated Clients
create policy "read profiles"   on profiles   for select to authenticated using (true);
create policy "read resources"  on resources  for select to authenticated using (true);
create policy "read bookings"   on bookings   for select to authenticated using (true);
create policy "read blackouts"  on blackouts  for select to authenticated using (true);
create policy "own waitlist"    on waitlist   for select to authenticated using (user_id = auth.uid());
create policy "own notifs"      on notifications for select to authenticated using (user_id = auth.uid());
create policy "own notifs upd"  on notifications for update to authenticated using (user_id = auth.uid());

-- Realtime Publication for Live Updates
alter publication supabase_realtime add table bookings, notifications, waitlist;
