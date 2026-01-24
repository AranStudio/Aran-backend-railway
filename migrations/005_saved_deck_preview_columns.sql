alter table public.decks
add column if not exists tool text default 'story_engine',
add column if not exists updated_at timestamp with time zone default now(),
add column if not exists tone_image_url text,
add column if not exists beats_count int default 0,
add column if not exists beats_preview text default '';

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_decks_updated_at on public.decks;

create trigger set_decks_updated_at
before update on public.decks
for each row
execute procedure public.set_updated_at();
