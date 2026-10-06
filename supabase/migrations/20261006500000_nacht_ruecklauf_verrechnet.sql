-- ===========================================================================
-- NACHTKENNZEICHEN: VERRECHNET BLEIBT VERRECHNET, AUCH BEIM RÜCKLAUF
-- (Abnahme Runde 3, M4) — dazu die Rechte zweier Auslöser (H1, H3), unten
-- ===========================================================================
--
-- `time_entries_nacht` (20261006130000) setzt `is_night_work` aus Von und
-- Bis — beim Einfügen ohne Ausnahme. Der Rücklauf aus der Sicherung
-- (`scripts/ruecklauf.mjs`, Dienstschlüssel) fügt aber auch VERRECHNETE
-- Buchungen ein. Was vor dem 06.10. ohne Haken verrechnet wurde, bekam dabei
-- das Kennzeichen, und die Lohnliste eines alten Monats zeigte danach
-- Nachtstunden, die nie abgerechnet wurden. Beim Ändern war das schon
-- ausgenommen (`old.is_billed`), beim Einfügen nicht.
--
-- JETZT: Eine verrechnete Buchung, die der Dienstschlüssel einfügt, kommt so
-- zurück, wie sie war. Alles andere bleibt, wie es ist — auch beim Rücklauf
-- bekommt eine offene Buchung ihr Kennzeichen nach der Regel.
--
-- Rumpf wie 20261006130000, dazu die eine Bedingung.

create or replace function app.nacht_setzen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  m integer;
begin
  -- Verrechnet bleibt verrechnet — auch im Storno-Schritt (siehe `verrechnet_bleibt_verrechnet`).
  if tg_op = 'UPDATE' and coalesce(old.is_billed, false) then
    return new;
  end if;
  -- … und beim Rücklauf: er bringt die Buchung so, wie sie verrechnet wurde.
  if tg_op = 'INSERT' and coalesce(new.is_billed, false) and app.ist_dienst() then
    return new;
  end if;
  new.nacht_abgewaehlt := nullif(btrim(coalesce(new.nacht_abgewaehlt, '')), '');
  if new.status = 'Anwesend' and new.start_time is not null and new.end_time is not null then
    select app.nacht_minuten(new.start_time, new.end_time, c.nacht_von, c.nacht_bis) into m
      from public.companies c where c.id = new.company_id;
    new.is_night_work := new.nacht_abgewaehlt is null and coalesce(m, 0) > 0;
  else
    -- Ohne Von und Bis gibt es nichts abzuwählen; es gilt der Haken.
    new.nacht_abgewaehlt := null;
  end if;
  return new;
end;
$$;

revoke all on function app.nacht_setzen() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Zwei Auslöser aus Runde 3 ohne Rechtevorgabe
-- ---------------------------------------------------------------------------
--
-- `app.bankverbindung_pruefen` (20261006120000/20261006200000) und
-- `app.zwei_faktor_pflicht_pruefen` (20261006110000) blieben für `public`
-- ausführbar — anders als jede andere Funktion in `app`. Ein Auslöser fragt
-- das Ausführungsrecht beim Feuern nicht ab (wie `app.jugendschutz_buerobuchung`,
-- die ebenfalls mit den Rechten des Ändernden läuft); das Recht entzogen
-- ändert also nichts am Ablauf, schliesst aber die Lücke in der Regel.
revoke all on function app.bankverbindung_pruefen() from public, anon, authenticated;
revoke all on function app.zwei_faktor_pflicht_pruefen() from public, anon, authenticated;
