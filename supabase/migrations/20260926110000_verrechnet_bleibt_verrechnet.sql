-- EINE VERRECHNETE BUCHUNG ÄNDERT SICH NICHT MEHR.
--
-- Aus dem Prüflauf vom 25.09.2026 (P1-09, P2-07, P3-06 — dreimal unabhängig
-- gefunden): `app.verrechnung_geschuetzt` schützt nur das Kennzeichen und
-- die Rechnungsnummer. Die Stunden daneben nicht. Ein Monteur konnte seine
-- verrechnete Buchung über die Schnittstelle von 07:00–16:00 auf 07:00–12:00
-- kürzen oder ganz löschen — und ein spät nachgesendeter Vorgang aus dem
-- Ausgangsfach tat dasselbe ohne jede Absicht. Die Rechnung stand danach auf
-- Stunden, die es im Zeitkonto nicht mehr gab.
--
-- Die Maske sperrt das seit jeher („Dafür muss zuerst die Rechnung storniert
-- werden"). Jetzt sperrt es auch die Datenbank, und zwar für JEDEN — auch für
-- die Buchhaltung: wer eine verrechnete Buchung korrigieren will, storniert
-- die Rechnung. Genau das sagt die Maske ihr schon heute.
--
-- WAS DURCHGEHT, und warum:
--   - das Kennzeichen selbst und die Rechnungsnummer — der Storno gibt die
--     Buchung darüber frei, das Aufheben eines Stornos sperrt sie wieder;
--     wer das darf, regelt weiter `app.verrechnung_geschuetzt`;
--   - was nicht auf der Rechnung steht: Kommentar, Helfername, Kennzeichen
--     des Fahrzeugs, die aufgelöste Baustellenkennung;
--   - der Dienstschlüssel (Rücklauf aus der Sicherung).
--
-- `baustelle_umnummern` braucht keinen Durchlass: es verweigert die neue
-- Nummer ohnehin, sobald eine Buchung dieser Baustelle verrechnet ist.

create or replace function app.verrechnet_bleibt_verrechnet() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() or not old.is_billed then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Diese Buchung ist mit Rechnung % verrechnet und lässt sich nicht löschen — dafür muss zuerst die Rechnung storniert werden',
      coalesce(nullif(old.invoice_number, ''), '—')
      using errcode = '42501';
  end if;

  -- Auch im Schritt, der sie freigibt (Storno), bleiben die Stunden, wie
  -- sie verrechnet wurden: geändert wird danach, nicht im selben Zug.
  if new.user_id is distinct from old.user_id
     or new.date is distinct from old.date
     or new.status is distinct from old.status
     or new.start_time is distinct from old.start_time
     or new.end_time is distinct from old.end_time
     or new.break_duration is distinct from old.break_duration
     or new.travel_time is distinct from old.travel_time
     or new.hours is distinct from old.hours
     or new.is_night_work is distinct from old.is_night_work
     or new.is_emergency is distinct from old.is_emergency
     or new.is_helper is distinct from old.is_helper
     or new.project_number is distinct from old.project_number
     or new.customer_name is distinct from old.customer_name then
    raise exception 'Diese Buchung ist mit Rechnung % verrechnet und kann nicht mehr geändert werden — dafür muss zuerst die Rechnung storniert werden',
      coalesce(nullif(old.invoice_number, ''), '—')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists time_entries_verrechnet_fest on public.time_entries;
create trigger time_entries_verrechnet_fest
  before update or delete on public.time_entries
  for each row execute function app.verrechnet_bleibt_verrechnet();
