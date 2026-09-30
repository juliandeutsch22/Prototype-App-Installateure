/*
  MENGEN JE EINHEIT (Testbericht 30.09.2026, M27)

  Die Spalten führen Mengen längst als numeric(12,3); „nur ganze Zahlen“
  stand allein in der Maske. Jetzt gilt dieselbe Regel hier wie dort
  (`src/lib/einheit.ts`, ein Test hält beide Listen gleich):
    - Meter, Laufmeter, Quadrat- und Kubikmeter, Kilo, Gramm, Tonnen und
      Liter nehmen bis zu drei Nachkommastellen;
    - alles andere zählt ganze Stück — „2,5 Stück“ ist ein Tippfehler.
  Und eine Menge ist grösser als null.

  Geprüft wird beim Anlegen und wenn sich Menge oder Artikel ändern;
  bestehende Zeilen bleiben, wie sie sind.
*/

create or replace function app.menge_mit_komma(p_einheit text) returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select lower(btrim(coalesce(p_einheit, ''))) in (
    'm', 'lfm', 'lm', 'meter', 'mtr', 'm²', 'm2', 'qm', 'm³', 'm3', 'cbm',
    'kg', 'g', 't', 'l', 'liter', 'ltr'
  );
$$;

/* Was an der Menge nicht stimmt — `null`, wenn sie passt. */
create or replace function app.menge_fehler(p_menge numeric, p_einheit text) returns text
  language plpgsql
  immutable
  set search_path = ''
as $$
begin
  if p_menge is null then
    return 'Bitte eine Menge eintragen.';
  end if;
  if p_menge <= 0 then
    return 'Die Menge muss größer als null sein.';
  end if;
  if not app.menge_mit_komma(p_einheit) and p_menge <> trunc(p_menge) then
    return format('In „%s“ zählen ganze Stück — bitte eine ganze Zahl eintragen.',
                  coalesce(nullif(btrim(p_einheit), ''), 'Stk'));
  end if;
  return null;
end;
$$;

/*
  Anforderungen und Retouren: die Einheit kommt vom Katalogartikel. Eine
  freie Zeile ohne Artikel hat keine — dort gilt nur „grösser als null“.
*/
create or replace function app.anforderung_menge_pruefen() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  einheit text;
  fehler text;
begin
  if tg_op = 'UPDATE'
     and new.quantity is not distinct from old.quantity
     and new.material_id is not distinct from old.material_id then
    return new;
  end if;
  if new.quantity is null or new.quantity <= 0 then
    raise exception 'Die Menge muss größer als null sein.' using errcode = '23514';
  end if;
  if new.material_id is not null then
    select m.unit into einheit from public.materials m where m.id = new.material_id;
    fehler := app.menge_fehler(new.quantity, einheit);
    if fehler is not null then
      raise exception '%', fehler using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists material_orders_menge on public.material_orders;
create trigger material_orders_menge before insert or update on public.material_orders
  for each row execute function app.anforderung_menge_pruefen();

create or replace function app.einkauf_posten_menge_pruefen() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  einheit text := new.einheit;
  fehler text;
begin
  if tg_op = 'UPDATE'
     and new.menge is not distinct from old.menge
     and new.einheit is not distinct from old.einheit
     and new.material_id is not distinct from old.material_id then
    return new;
  end if;
  if nullif(btrim(coalesce(einheit, '')), '') is null and new.material_id is not null then
    select m.unit into einheit from public.materials m where m.id = new.material_id;
  end if;
  if nullif(btrim(coalesce(einheit, '')), '') is null then
    return new; -- ohne Einheit keine Aussage über Stück oder Meter
  end if;
  fehler := app.menge_fehler(new.menge, einheit);
  if fehler is not null then
    raise exception '%', fehler using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists einkauf_posten_menge on public.einkauf_posten;
create trigger einkauf_posten_menge before insert or update on public.einkauf_posten
  for each row execute function app.einkauf_posten_menge_pruefen();
