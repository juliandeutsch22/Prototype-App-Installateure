-- Der Dienstschluessel muss durch die Trigger kommen — durch manche.
--
-- DER FUND. Postgres umgeht den ZEILENSCHUTZ fuer den Dienstschluessel
-- (`service_role` traegt BYPASSRLS), aber TRIGGER laufen weiter. In Firestore
-- war das anders: das Admin-SDK umging die Regeln vollstaendig, und
-- serverseitiger Code musste sich um sie nicht kuemmern.
--
-- Ohne diese Datei sperrt der Riegel gegen die Ernennung von Administratoren
-- ausgerechnet die Funktion aus, die den ERSTEN Administrator eines neuen
-- Betriebs anlegt. Aufgefallen ist das beim Portieren der Regelpruefungen —
-- der Test wollte einen Administrator anlegen und bekam keine Zeile.
--
-- Welche Trigger den Dienstschluessel durchlassen, ist eine Entscheidung je
-- Trigger und keine pauschale:
--
--   DURCH:  Was serverseitige Ablaeufe tun muessen — den ersten Administrator
--           anlegen, ueber Urlaub entscheiden, die Pruefsumme auf einen
--           unterschriebenen Schein schreiben, einen Katalog importieren,
--           einen Abrechnungslauf kennzeichnen.
--
--   NICHT:  Was den Beleg selbst schuetzt — der Betrieb einer Zeile, die
--           eingefrorene Rechnung, die eingefrorenen Scheinpositionen. Ein
--           Server, der diese Riegel braucht, tut etwas Falsches, und dann
--           soll er anstehen.

create or replace function app.ist_dienst() returns boolean
  language sql stable
  set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    current_user
  ) = 'service_role'
$$;

grant execute on function app.ist_dienst() to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------

create or replace function app.adminrolle_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'Administrator' and not app.hat_rolle(array['Administrator']) then
      raise exception 'Einen Administrator entfernt nur ein Administrator'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if (new.role = 'Administrator' or (tg_op = 'UPDATE' and old.role = 'Administrator'))
     and not app.hat_rolle(array['Administrator']) then
    raise exception 'Die Rolle Administrator vergibt und ändert nur ein Administrator'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function app.firmeneinstellungen_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() then return new; end if;
  if new.modules is distinct from old.modules
     and not app.hat_rolle(array['Administrator']) then
    raise exception 'Module schaltet nur die Administration' using errcode = '42501';
  end if;
  if new.vacation_approvers is distinct from old.vacation_approvers
     and not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Die Genehmigenden legt nur die Geschäftsführung fest'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function app.urlaub_entscheidung_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- urlaubEntscheiden laeuft serverseitig und legt die Zeiteintraege gleich mit an.
  if app.ist_dienst() then return new; end if;

  if new.status = 'Storniert' and old.user_id = auth.uid() and old.status = 'Beantragt' then
    return new;
  end if;

  if new.status is distinct from old.status
     and new.status in ('Genehmigt', 'Abgelehnt')
     and not app.darf_urlaub_entscheiden(new.company_id) then
    raise exception 'Über diesen Urlaubsantrag entscheidet jemand anderer'
      using errcode = '42501';
  end if;

  if old.status in ('Genehmigt', 'Abgelehnt')
     and not app.darf_urlaub_entscheiden(new.company_id) then
    raise exception 'Der Antrag ist bereits entschieden' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function app.materialfelder_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  pflegt boolean := app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung();
  spitze boolean := app.hat_rolle(array['Geschäftsführung', 'Administrator']);
begin
  -- Ein Datanorm-Import bringt Einkaufspreise mit; er laeuft serverseitig.
  if app.ist_dienst() then return new; end if;

  if tg_op = 'INSERT' then
    if new.einkaufspreis is not null and not spitze then
      raise exception 'Den Einkaufspreis setzt nur die Geschäftsführung'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.einkaufspreis is distinct from old.einkaufspreis and not spitze then
    raise exception 'Den Einkaufspreis ändert nur die Geschäftsführung'
      using errcode = '42501';
  end if;

  if (new.name is distinct from old.name
      or new.category is distinct from old.category
      or new.article_number is distinct from old.article_number
      or new.unit is distinct from old.unit
      or new.verkaufspreis is distinct from old.verkaufspreis)
     and not pflegt then
    raise exception 'Den Katalog pflegt die Verwaltung oder die Führung'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function app.verrechnung_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() then return new; end if;
  if (new.is_billed is distinct from old.is_billed
      or new.invoice_number is distinct from old.invoice_number)
     and not app.ist_buch_oder_spitze() then
    raise exception 'Nur die Buchhaltung darf den Verrechnungsstand aendern'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function app.schein_zustandswechsel() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- scheinPruefsumme schreibt den Hash AUF den bereits unterschriebenen
  -- Schein. Ohne diesen Durchlass waere der Manipulationsschutz das Erste,
  -- was am Manipulationsschutz scheitert.
  if app.ist_dienst() then return new; end if;

  if old.status = 'Entwurf' then return new; end if;
  if old.status = 'Verworfen' and new.status = 'Entwurf' then return new; end if;

  if old.status = 'Unterschrieben' and new.status = 'Storniert' then
    if not app.ist_fuehrung() then
      raise exception 'Nur die Führung darf einen unterschriebenen Schein stornieren'
        using errcode = '42501';
    end if;
    if coalesce(new.storno_grund, '') = '' then
      raise exception 'Ein Storno braucht einen Grund' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Ein Schein im Zustand % lässt sich nicht mehr ändern (Ziel: %)',
    old.status, new.status using errcode = '42501';
end;
$$;

create or replace function app.ruestliste_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() or app.ist_fuehrung() then return new; end if;

  if new.date is distinct from old.date
     or new.project_number is distinct from old.project_number
     or new.uids is distinct from old.uids then
    raise exception 'Die Rüstliste plant die Leitung' using errcode = '42501';
  end if;

  if new.geladen is distinct from old.geladen
     and not (auth.uid() = any(old.uids)) then
    raise exception 'Abhaken darf nur, wer für diesen Einsatz eingeteilt ist'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
