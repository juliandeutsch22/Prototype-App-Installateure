-- ===========================================================================
-- Erwarteter Liefertermin und „abholbereit seit" (Nachtest 01.10.2026,
-- Paket B — Startseite)
-- ===========================================================================
--
-- Die neue Startseite der Verwaltung fragt dreierlei, was die Datenbank bisher
-- nicht wusste:
--
--   „Bestellt und überfällig“   — wann sollte die Ware da sein?
--   „Lieferungen heute“         — was kommt heute?
--   „Seit über 3 Tagen abholbereit“ — seit wann liegt es da?
--
-- LIEFERTERMIN: ein Datum, das das Lager beim Bestellen einträgt (oder später,
-- wenn der Großhändler bestätigt). Freiwillig: ohne Termin steht die Zeile
-- weiter unter „bestellt“, nur eben nicht unter „überfällig“. Sinn hat er nur
-- an einer bestellten Zeile — die Prüfung steht deshalb hier.
--
-- ABHOLBEREIT SEIT: setzt ausschließlich die Datenbank, beim Übergang auf
-- „Abholbereit“; was die App schickt, zählt nicht. `updated_at` taugt dafür
-- nicht — es ändert sich bei jeder Bearbeitung, auch bei einer Notiz.

alter table public.material_orders
  add column if not exists liefertermin date,
  add column if not exists abholbereit_seit timestamptz;

alter table public.einkauf_posten
  add column if not exists liefertermin date;

alter table public.material_orders drop constraint if exists material_orders_liefertermin_bestellt;
alter table public.material_orders
  add constraint material_orders_liefertermin_bestellt
  check (liefertermin is null or bestellt_am is not null);

alter table public.einkauf_posten drop constraint if exists einkauf_posten_liefertermin_bestellt;
alter table public.einkauf_posten
  add constraint einkauf_posten_liefertermin_bestellt
  check (liefertermin is null or bestellt_am is not null);

comment on column public.material_orders.liefertermin is
  'Erwarteter Liefertermin beim Großhändler — nur an bestellten Zeilen, vom Lager gesetzt';
comment on column public.material_orders.abholbereit_seit is
  'Seit wann die Anforderung abholbereit ist — setzt nur die Datenbank';
comment on column public.einkauf_posten.liefertermin is
  'Erwarteter Liefertermin beim Großhändler — nur an bestellten Posten';

-- ---------------------------------------------------------------------------
-- 1. „Abholbereit seit“ stempelt die Datenbank
-- ---------------------------------------------------------------------------
create or replace function app.abholbereit_stempeln() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.status = 'Abholbereit' then
    if tg_op = 'INSERT' or old.status is distinct from 'Abholbereit' then
      new.abholbereit_seit := now();
    else
      new.abholbereit_seit := old.abholbereit_seit;
    end if;
  else
    new.abholbereit_seit := null;
  end if;
  return new;
end;
$$;

-- Das „z_“ ist Absicht: dieser Trigger läuft nach allen anderen und hat das
-- letzte Wort über die Spalte.
drop trigger if exists material_orders_z_abholbereit_seit on public.material_orders;
create trigger material_orders_z_abholbereit_seit
  before insert or update on public.material_orders
  for each row execute function app.abholbereit_stempeln();

-- Was heute schon abholbereit ist: der beste bekannte Zeitpunkt ist die
-- letzte Änderung. Ohne den Zeitstempel-Trigger, damit `updated_at` bleibt,
-- wie es war.
alter table public.material_orders disable trigger material_orders_updated_at;
update public.material_orders
   set abholbereit_seit = coalesce(updated_at, created_at)
 where status = 'Abholbereit' and abholbereit_seit is null;
alter table public.material_orders enable trigger material_orders_updated_at;

-- ---------------------------------------------------------------------------
-- 2. Den Liefertermin setzt das Lager, nicht der Monteur
-- ---------------------------------------------------------------------------
create or replace function app.anforderung_besitzer_offen() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() or current_user <> 'authenticated' then
    return new;
  end if;
  if app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung() then
    return new;
  end if;

  if old.status <> 'Offen' or old.processed or old.beschaffung is not null then
    raise exception 'Das Lager hat die Anforderung schon in Arbeit — ändern kann sie jetzt nur das Lager'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     or new.processed is distinct from old.processed
     or new.beschaffung is distinct from old.beschaffung
     or new.supplier_id is distinct from old.supplier_id
     or new.bestellt_am is distinct from old.bestellt_am
     or new.geliefert_am is distinct from old.geliefert_am
     or new.liefertermin is distinct from old.liefertermin
     or new.transaction_type is distinct from old.transaction_type
     or new.condition is distinct from old.condition
     or new.user_id is distinct from old.user_id then
    raise exception 'Den Stand einer Anforderung setzt das Lager — abgeholt wird über „Abgeholt“'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
