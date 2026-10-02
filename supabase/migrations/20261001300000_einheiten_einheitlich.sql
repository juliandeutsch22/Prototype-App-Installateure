-- ===========================================================================
-- Einheiten einheitlich (Nachtest 01.10.2026, U5)
-- ===========================================================================
--
-- Im Lager standen „Stk“, „Stck“ und „M“ (groß) nebeneinander. Die Maske
-- bietet jetzt eine feste Auswahl; was trotzdem anders ankommt — aus einer
-- DATANORM-Datei, einer alten Sicherung, über die Schnittstelle —, schreibt
-- die Datenbank in die übliche Form. Eine unbekannte Einheit bleibt, wie sie
-- ist: lieber „Karton“ als eine erfundene Zuordnung.
--
-- Nur Katalog und eigene Einkaufsposten. Belege (Scheine, Rechnungen,
-- Angebote) bleiben unberührt — sie stehen so beim Kunden, und Angebote
-- kennen zu Recht auch „h“ und „Pauschale“.

create or replace function app.einheit_norm(p text) returns text
  language sql
  immutable
  set search_path = ''
as $$
  select case lower(btrim(coalesce(p, '')))
    when '' then nullif(btrim(p), '')
    when 'stk' then 'Stk' when 'stk.' then 'Stk' when 'stck' then 'Stk' when 'stck.' then 'Stk'
    when 'st' then 'Stk' when 'st.' then 'Stk' when 'stück' then 'Stk' when 'stueck' then 'Stk'
    when 'm' then 'm' when 'meter' then 'm' when 'mtr' then 'm' when 'mtr.' then 'm'
    when 'lfm' then 'lfm' when 'lm' then 'lfm'
    when 'm²' then 'm²' when 'm2' then 'm²' when 'qm' then 'm²'
    when 'm³' then 'm³' when 'm3' then 'm³' when 'cbm' then 'm³'
    when 'kg' then 'kg'
    when 'l' then 'l' when 'liter' then 'l' when 'ltr' then 'l' when 'ltr.' then 'l'
    when 'pkg' then 'Pkg' when 'pkg.' then 'Pkg' when 'pak' then 'Pkg' when 'pack' then 'Pkg'
    when 'packung' then 'Pkg' when 'pck' then 'Pkg'
    when 'set' then 'Set'
    when 'rolle' then 'Rolle' when 'rl' then 'Rolle' when 'rl.' then 'Rolle'
    when 'sack' then 'Sack'
    when 'paar' then 'Paar' when 'pa' then 'Paar'
    else btrim(p)
  end;
$$;

comment on function app.einheit_norm(text) is
  'Schreibt eine Einheit in die übliche Form (Stk, m, lfm, m², m³, kg, l, Pkg, Set, Rolle, Sack, Paar); unbekannte bleiben.';

create or replace function app.material_einheit_norm() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.unit := app.einheit_norm(new.unit);
  return new;
end;
$$;

create or replace function app.posten_einheit_norm() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.einheit := app.einheit_norm(new.einheit);
  return new;
end;
$$;

drop trigger if exists materials_einheit_norm on public.materials;
create trigger materials_einheit_norm
  before insert or update of unit on public.materials
  for each row execute function app.material_einheit_norm();

drop trigger if exists einkauf_posten_einheit_norm on public.einkauf_posten;
create trigger einkauf_posten_einheit_norm
  before insert or update of einheit on public.einkauf_posten
  for each row execute function app.posten_einheit_norm();

-- Der Bestand einmal vereinheitlicht — ohne den Zeitstempel der letzten
-- Änderung zu verschieben, denn geändert hat sich nur die Schreibweise.
alter table public.materials disable trigger materials_updated_at;
update public.materials
   set unit = app.einheit_norm(unit)
 where unit is distinct from app.einheit_norm(unit);
alter table public.materials enable trigger materials_updated_at;

alter table public.einkauf_posten disable trigger einkauf_posten_updated_at;
update public.einkauf_posten
   set einheit = app.einheit_norm(einheit)
 where einheit is distinct from app.einheit_norm(einheit);
alter table public.einkauf_posten enable trigger einkauf_posten_updated_at;
