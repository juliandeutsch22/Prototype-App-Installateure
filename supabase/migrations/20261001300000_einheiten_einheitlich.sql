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

/*
  DER BESTAND EINMAL VEREINHEITLICHT — ohne den Zeitstempel der letzten
  Änderung zu verschieben, denn geändert hat sich nur die Schreibweise.

  NACHGEZOGEN AM 02.10.2026: Der erste Anlauf scheiterte beim Einspielen in
  das Projekt („Den Katalog pflegt die Verwaltung oder die Führung“). Beim
  Einspielen ist niemand angemeldet, und die Sperren auf dem Katalog und auf
  den Mengen der Posten fragen nach einer Rolle. In der Prüfung von null an
  fiel das nicht auf — dort ist die Tabelle beim Einspielen leer. Deshalb
  ruhen während der Angleichung ALLE Trigger der beiden Tabellen (nur die
  eigenen, nicht die Fremdschlüssel): geändert wird ausschliesslich die
  Schreibweise der Einheit, und für sie gilt keine dieser Regeln. Als
  Funktion, damit `tests/supabase/einheiten.test.ts` genau diesen Weg mit
  bestehenden Zeilen nachstellt.
*/
create or replace function app.einheiten_angleichen() returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  n integer;
  m integer;
begin
  alter table public.materials disable trigger user;
  update public.materials
     set unit = app.einheit_norm(unit)
   where unit is distinct from app.einheit_norm(unit);
  get diagnostics n = row_count;
  alter table public.materials enable trigger user;

  alter table public.einkauf_posten disable trigger user;
  update public.einkauf_posten
     set einheit = app.einheit_norm(einheit)
   where einheit is distinct from app.einheit_norm(einheit);
  get diagnostics m = row_count;
  alter table public.einkauf_posten enable trigger user;

  return n + m;
end;
$$;

revoke all on function app.einheiten_angleichen() from public, anon, authenticated;

select app.einheiten_angleichen();
