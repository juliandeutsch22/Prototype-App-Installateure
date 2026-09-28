/*
  EINE ALTE BAUSTELLENNUMMER FINDET IHRE BAUSTELLE (offene Punkte C8).

  `baustelle_umnummern` zieht alles mit, was in dem Moment in der Datenbank
  steht. Was noch NICHT dort steht, bleibt zurück: eine Buchung, die der
  Monteur im Keller auf die alte Nummer getippt hat und die im Ausgangsfach
  wartet; eine Anforderung aus einem Browserfenster, das seit dem Vormittag
  offen ist. Sie kamen später an, fanden keine Baustelle mit dieser Nummer
  und standen dann ohne Baustelle da — in keiner Auswertung, auf keiner
  Rechnung.

  JETZT MERKT SICH DIE DATENBANK DIE ALTE NUMMER, und `baustelle_aufloesen`
  (der Auslöser an jeder Tabelle mit `project_number`) schlägt dort nach,
  wenn es keine Baustelle mit der getippten Nummer gibt. Die Zeile bekommt
  dann die heutige Nummer und die Kennung der Baustelle. So gilt es für jeden
  Schreibweg, nicht nur fürs Ausgangsfach.

  WAS NICHT ÜBERSETZT WIRD:
    - eine Nummer, die heute einer Baustelle gehört — auch wenn sie früher
      einer anderen gehörte. Die heutige gewinnt;
    - eine Nummer, die es nie gab: sie bleibt, wie getippt, und wird wie
      bisher aufgelöst, sobald das Büro die Baustelle anlegt;
    - eine Zeile, deren Nummer sich beim Ändern nicht bewegt. Bestehende
      Zeilen tragen nie eine alte Nummer (`baustelle_umnummern` nimmt alle
      mit oder weigert sich), und eingefrorene Belege sollen nichts sehen,
      was sie nicht selbst geschrieben haben.
*/

create table public.baustelle_alte_nummern (
  -- Eine eigene Kennung wie jede Tabelle, die die App blättert (`zeilengrenze`).
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references public.companies (id),
  nummer      text not null,
  -- Die Kennung, nicht die neue Nummer: nach zweimal Umnummern führt die
  -- erste Nummer so trotzdem zur heutigen.
  project_id  uuid not null references public.projects (id) on delete cascade,
  geaendert_am timestamptz not null default now(),
  unique (company_id, nummer)
);

create index baustelle_alte_nummern_projekt on public.baustelle_alte_nummern (project_id);

alter table public.baustelle_alte_nummern enable row level security;

-- Lesen muss, wer schreibt: `baustelle_aufloesen` läuft mit den Rechten des
-- Aufrufers. Geschrieben wird nur vom Auslöser unten (Eigentümerrechte).
create policy baustelle_alte_nummern_lesen on public.baustelle_alte_nummern
  for select using (app.darf(company_id));

revoke all on public.baustelle_alte_nummern from anon, authenticated;
grant select on public.baustelle_alte_nummern to authenticated;

-- Derselbe Riegel wie überall: ein Supportzugang schreibt hier nur, wo er
-- auch die Baustelle selbst ändern dürfte.
create trigger baustelle_alte_nummern_kein_support_schreiben
  before insert or update or delete on public.baustelle_alte_nummern
  for each row execute function app.support_schreibt_nicht();

create or replace function app.alte_nummer_merken() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if coalesce(old.project_number, '') <> '' then
    insert into public.baustelle_alte_nummern (company_id, nummer, project_id)
    values (old.company_id, old.project_number, new.id)
    on conflict (company_id, nummer)
      do update set project_id = excluded.project_id, geaendert_am = now();
  end if;
  return null;
end;
$$;

revoke all on function app.alte_nummer_merken() from public, anon, authenticated;

create trigger projects_alte_nummer
  after update of project_number on public.projects
  for each row
  when (old.project_number is distinct from new.project_number)
  execute function app.alte_nummer_merken();

-- In ganzer Fassung; neu ist nur der Teil ab „Keine Baustelle mit dieser
-- Nummer". Stand vorher: `20260911120000_stammdaten.sql`.
create or replace function app.baustelle_aufloesen() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  heute_id uuid;
  heute_nummer text;
begin
  if new.project_number is null or new.project_number = '' then
    new.project_id := null;
    return new;
  end if;

  select p.id into new.project_id
    from public.projects p
   where p.company_id = new.company_id
     and p.project_number = new.project_number;

  -- Keine Baustelle mit dieser Nummer — vielleicht hatte sie eine, bevor sie
  -- umnummeriert wurde.
  if new.project_id is null
     and (tg_op = 'INSERT' or new.project_number is distinct from old.project_number) then
    select p.id, p.project_number into heute_id, heute_nummer
      from public.baustelle_alte_nummern a
      join public.projects p on p.id = a.project_id
     where a.company_id = new.company_id
       and a.nummer = new.project_number;
    if heute_id is not null then
      new.project_id := heute_id;
      new.project_number := heute_nummer;
    end if;
  end if;
  return new;
end;
$$;
