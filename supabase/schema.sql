-- Winloo backend schema
-- Apply to the dedicated Winloo Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  department text,
  location text not null default 'Saudi Arabia',
  employment_type text,
  experience text,
  description text not null,
  requirements text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','published','closed')),
  closing_date date,
  published_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  contact_person text not null,
  company text,
  email text not null,
  phone text not null,
  project_name text not null,
  project_location text not null,
  required_service text not null,
  project_stage text,
  expected_start_date date,
  project_description text not null,
  status text not null default 'new' check (status in ('new','contacted','in_progress','closed','spam')),
  internal_notes text,
  source text not null default 'website',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enquiry_files (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text not null,
  current_location text,
  position text not null,
  years_experience integer check (years_experience is null or years_experience >= 0),
  message text,
  status text not null default 'new' check (status in ('new','reviewing','shortlisted','interview','hired','rejected','archived')),
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.application_files (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at before update on public.jobs
for each row execute function public.set_updated_at();

drop trigger if exists enquiries_set_updated_at on public.enquiries;
create trigger enquiries_set_updated_at before update on public.enquiries
for each row execute function public.set_updated_at();

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at before update on public.applications
for each row execute function public.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.jobs enable row level security;
alter table public.enquiries enable row level security;
alter table public.enquiry_files enable row level security;
alter table public.applications enable row level security;
alter table public.application_files enable row level security;

drop policy if exists "admin users can view self" on public.admin_users;
create policy "admin users can view self"
on public.admin_users for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "published jobs are public" on public.jobs;
create policy "published jobs are public"
on public.jobs for select to anon, authenticated
using (
  status = 'published'
  and (published_at is null or published_at <= now())
  and (closing_date is null or closing_date >= current_date)
);

drop policy if exists "admins manage jobs" on public.jobs;
create policy "admins manage jobs"
on public.jobs for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

drop policy if exists "admins manage enquiries" on public.enquiries;
create policy "admins manage enquiries"
on public.enquiries for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

drop policy if exists "admins manage enquiry files" on public.enquiry_files;
create policy "admins manage enquiry files"
on public.enquiry_files for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

drop policy if exists "admins manage applications" on public.applications;
create policy "admins manage applications"
on public.applications for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

drop policy if exists "admins manage application files" on public.application_files;
create policy "admins manage application files"
on public.application_files for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

grant usage on schema public to anon, authenticated;
grant select on public.jobs to anon, authenticated;
grant select, insert, update, delete on public.jobs to authenticated;
grant select, insert, update, delete on public.enquiries, public.enquiry_files, public.applications, public.application_files to authenticated;
grant select on public.admin_users to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('winloo-submissions', 'winloo-submissions', false, 10485760)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "admins read submission files" on storage.objects;
create policy "admins read submission files"
on storage.objects for select to authenticated
using (
  bucket_id = 'winloo-submissions'
  and exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
);

drop policy if exists "admins delete submission files" on storage.objects;
create policy "admins delete submission files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'winloo-submissions'
  and exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
);


-- Security/performance hardening
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

create index if not exists idx_application_files_application_id on public.application_files(application_id);
create index if not exists idx_applications_job_id on public.applications(job_id);
create index if not exists idx_enquiry_files_enquiry_id on public.enquiry_files(enquiry_id);
create index if not exists idx_jobs_public_listing on public.jobs(status, sort_order, published_at, closing_date);
create index if not exists idx_enquiries_created_at on public.enquiries(created_at desc);
create index if not exists idx_applications_created_at on public.applications(created_at desc);

drop policy if exists "published jobs are public" on public.jobs;
drop policy if exists "admins manage jobs" on public.jobs;
drop policy if exists "jobs select access" on public.jobs;
drop policy if exists "admins insert jobs" on public.jobs;
drop policy if exists "admins update jobs" on public.jobs;
drop policy if exists "admins delete jobs" on public.jobs;

create policy "jobs select access"
on public.jobs for select to anon, authenticated
using (
  (
    status = 'published'
    and (published_at is null or published_at <= now())
    and (closing_date is null or closing_date >= current_date)
  )
  or (
    (select auth.uid()) is not null
    and exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
  )
);

create policy "admins insert jobs"
on public.jobs for insert to authenticated
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

create policy "admins update jobs"
on public.jobs for update to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

create policy "admins delete jobs"
on public.jobs for delete to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));


-- Runtime grants required by PostgREST/Edge Functions.
grant usage on schema public to anon, authenticated, service_role;

grant select on public.jobs to anon, authenticated, service_role;
grant select on public.admin_users to anon;

grant select, insert, update, delete on
  public.admin_users,
  public.jobs,
  public.enquiries,
  public.enquiry_files,
  public.applications,
  public.application_files
to authenticated, service_role;


-- Soft-delete support for admin Trash.
alter table public.enquiries add column if not exists deleted_at timestamptz;
alter table public.applications add column if not exists deleted_at timestamptz;
alter table public.jobs add column if not exists deleted_at timestamptz;

create index if not exists idx_enquiries_deleted_at on public.enquiries(deleted_at);
create index if not exists idx_applications_deleted_at on public.applications(deleted_at);
create index if not exists idx_jobs_deleted_at on public.jobs(deleted_at);

drop policy if exists "jobs select access" on public.jobs;
create policy "jobs select access"
on public.jobs for select to anon, authenticated
using (
  (
    deleted_at is null
    and status = 'published'
    and (published_at is null or published_at <= now())
    and (closing_date is null or closing_date >= current_date)
  )
  or (
    (select auth.uid()) is not null
    and exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
  )
);


-- Admin audit history.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null references auth.users(id) on delete set null,
  entity_type text not null check (entity_type in ('enquiry','application','job')),
  entity_id uuid not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);
create index if not exists idx_audit_logs_actor_user_id on public.audit_logs(actor_user_id);

alter table public.audit_logs enable row level security;
grant select, insert on public.audit_logs to authenticated, service_role;

drop policy if exists "admins can read audit logs" on public.audit_logs;
create policy "admins can read audit logs"
on public.audit_logs for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

drop policy if exists "admins can write audit logs" on public.audit_logs;
create policy "admins can write audit logs"
on public.audit_logs for insert to authenticated
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

create or replace function public.log_admin_audit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_type text;
  v_id uuid;
  v_action text;
  v_details jsonb := '{}'::jsonb;
begin
  v_type := case TG_TABLE_NAME
    when 'enquiries' then 'enquiry'
    when 'applications' then 'application'
    when 'jobs' then 'job'
  end;

  if TG_OP = 'INSERT' then
    v_id := NEW.id;
    v_action := 'created';
    v_details := jsonb_build_object('status', NEW.status);
  elsif TG_OP = 'DELETE' then
    v_id := OLD.id;
    v_action := 'deleted_forever';
    v_details := jsonb_build_object('status', OLD.status);
  else
    v_id := NEW.id;
    if OLD.deleted_at is null and NEW.deleted_at is not null then
      v_action := 'moved_to_trash';
    elsif OLD.deleted_at is not null and NEW.deleted_at is null then
      v_action := 'restored';
    elsif OLD.status is distinct from NEW.status then
      v_action := 'status_changed';
      v_details := jsonb_build_object('from', OLD.status, 'to', NEW.status);
    else
      v_action := 'updated';
    end if;
  end if;

  insert into public.audit_logs(actor_user_id, entity_type, entity_id, action, details)
  values ((select auth.uid()), v_type, v_id, v_action, v_details);

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_audit_enquiries on public.enquiries;
create trigger trg_audit_enquiries after insert or update or delete on public.enquiries
for each row execute function public.log_admin_audit();

drop trigger if exists trg_audit_applications on public.applications;
create trigger trg_audit_applications after insert or update or delete on public.applications
for each row execute function public.log_admin_audit();

drop trigger if exists trg_audit_jobs on public.jobs;
create trigger trg_audit_jobs after insert or update or delete on public.jobs
for each row execute function public.log_admin_audit();
