Diesen code die variablen belegen und dann in den SQL Editor von supabase copy pasten um die raw-version
einer z.B users tabelle zu erstellen, die mit der internen auth-tabelle interlocked ist 
(also die id der auth-tabelle und deiner tabelle ist gleich, beim insert und delete in der auth-tabelle -> auch in deiner Tabelle)

WICHTIG: NUR EINS SOLCH EINER TABELLE IM PROJEKT HABEN (wenn du diesen code mehrmals laufen lässt wird der trigger überschrieben und die alte tabelle die du damit erstellt hast im projekt hat den trigger nicht mehr, also kann es nur eins solch einer tabelle geben..., auch besser so! du brauchst nur eine solcher Tabellen.)

WICHTIG: RLS AKTIVIEREN (hat kein RLS)
````sql

 -- 1) Eigene User-Tabelle anlegen
create table if not exists public.{{TABLENAME}} ( -- {{TABLENAME}} ist der Name der Tabelle, die du anlegen möchtest
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 2) Trigger-Funktion
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.{{TABLENAME}} (id) -- {{TABLENAME}} ist der Name der Tabelle, die du anlegen möchtest
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- 3) Trigger auf auth.users
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

````
