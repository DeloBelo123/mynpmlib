# Users Table

Diesen code die variablen belegen und dann in den SQL Editor von supabase copy pasten um die raw-version
einer z.B users tabelle zu erstellen, die mit der internen auth-tabelle interlocked ist 
(also die id der auth-tabelle und deiner tabelle ist gleich, beim insert und delete in der auth-tabelle -> auch in deiner Tabelle)

WICHTIG: NUR EINS SOLCH EINER TABELLE IM PROJEKT HABEN (wenn du diesen code mehrmals laufen lässt wird der trigger überschrieben und die alte tabelle die du damit erstellt hast im projekt hat den trigger nicht mehr, also kann es nur eins solch einer tabelle geben..., auch besser so! du brauchst nur eins solcher Tabellen.)

````sql

-- 1) Eigene User-Tabelle anlegen
create table if not exists public.{{TABLENAME}} (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 2) RLS aktivieren
alter table public.{{TABLENAME}} enable row level security;

-- 3) Policies
drop policy if exists "Users can view their own {{TABLENAME}}" on public.{{TABLENAME}};
drop policy if exists "Users can update their own {{TABLENAME}}" on public.{{TABLENAME}};
drop policy if exists "Users can delete their own {{TABLENAME}}" on public.{{TABLENAME}};

create policy "Users can view their own {{TABLENAME}}"
on public.{{TABLENAME}}
for select
to authenticated
using (auth.uid() = id);

create policy "Users can update their own {{TABLENAME}}"
on public.{{TABLENAME}}
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can delete their own {{TABLENAME}}"
on public.{{TABLENAME}}
for delete
to authenticated
using (auth.uid() = id);

-- 4) Trigger-Funktion
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.{{TABLENAME}} (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- 5) Trigger auf auth.users
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

````
