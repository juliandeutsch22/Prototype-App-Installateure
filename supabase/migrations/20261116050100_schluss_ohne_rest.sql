-- Durchsicht 15.11.2026, G4: eine Schlussrechnung, die nach dem Abzug der
-- Anzahlungs- und Teilrechnungen 0,00 € fordert, gilt als bezahlt, sobald sie
-- ausgestellt ist.
--
-- NACHGESTELLT (Kratzdatenbank): Anzahlung 1.200 € gestellt und bezahlt,
-- Schlussrechnung über die ganze Leistung zieht sie ab — Rest 0,00 €. Sie
-- stand dauerhaft „Offen“: sie muss offen beginnen
-- (`app.rechnung_beginnt_offen`), ein Eingang über null Euro ist keiner
-- (`zahlungseingaenge_betrag_check`), und `app.zahlstand_setzen` kannte
-- „Bezahlt“ nur über eine Summe größer null. Kein Weg führte heraus; die
-- Rechnung stand in den offenen Posten, auf der Startseite und im
-- Ausgangsbuch als offen.
--
-- DIE LÖSUNG: Nichts zu fordern heißt, es ist beglichen. `zahlstand_setzen`
-- kennt den Fall, und ein Auslöser rechnet den Stand gleich nach dem Anlegen
-- — für jeden Weg, auf dem eine Rechnung entsteht, auch für die alte App.
-- Die Rechnung beginnt weiter „Offen“ (die Regel aus `rechnung_beginnt_offen`
-- bleibt), der Stand folgt in derselben Transaktion.
--
-- ALTDATEN: Bestehende Schlussrechnungen mit Rest null werden nicht
-- umgeschrieben (in der Produktion wird nichts nachgerechnet). Sie bekommen
-- den richtigen Stand, sobald ihr Zahlstand das nächste Mal gerechnet wird.

create or replace function app.zahlstand_setzen(p_id uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  summe      numeric(12,2);
  skonto     numeric(12,2);
  mahnkosten numeric(12,2);
  brutto     numeric(12,2);
  status     text;
  neu        text;
begin
  -- Erst sperren, dann lesen (G9, `20261116050000_zahlstand_sperren.sql`).
  select i.total_brutto, i.payment_status into brutto, status
    from public.invoices i where i.id = p_id
     for update;

  if brutto is null then
    return; -- Die Rechnung gibt es nicht (mehr).
  end if;

  select coalesce(sum(z.betrag) filter (where z.art is distinct from 'Mahnkosten'), 0),
         coalesce(sum(z.betrag) filter (where z.art = 'Skonto'), 0),
         coalesce(sum(z.betrag) filter (where z.art = 'Mahnkosten'), 0)
    into summe, skonto, mahnkosten
    from public.zahlungseingaenge z where z.invoice_id = p_id;

  if status = 'Storniert' then
    neu := 'Storniert';
  elsif summe <= 0 then
    /*
      NICHTS ZU FORDERN IST BEGLICHEN (G4). Eine Schlussrechnung, die nach
      dem Abzug null fordert, bliebe sonst für immer offen: ein Eingang über
      null Euro ist keiner. Weniger als null fordert keine Rechnung — eine
      Gutschrift weist schon das Anlegen ab.
    */
    neu := case
      when brutto <= 0 then 'Bezahlt'
      when status = 'Überfällig' then 'Überfällig'
      else 'Offen' end;
  elsif summe < brutto then
    neu := 'Teilbezahlt';
  elsif summe = brutto then
    neu := 'Bezahlt';
  else
    neu := 'Überzahlt';
  end if;

  perform set_config('app.zahlstand', 'ja', true);
  update public.invoices
     set bezahlt_betrag = summe,
         skonto_betrag = skonto,
         mahnkosten_betrag = mahnkosten,
         payment_status = neu
   where id = p_id
     and (bezahlt_betrag is distinct from summe
          or skonto_betrag is distinct from skonto
          or mahnkosten_betrag is distinct from mahnkosten
          or payment_status is distinct from neu);
  perform set_config('app.zahlstand', '', true);
end;
$$;

revoke all on function app.zahlstand_setzen(uuid) from public, anon;
grant execute on function app.zahlstand_setzen(uuid) to authenticated, service_role;

/*
  DER STAND GLEICH NACH DEM ANLEGEN — nur, wenn die Rechnung nichts fordert;
  jede andere beginnt offen und bleibt es bis zum ersten Eingang. Ein
  Auslöser statt einer Zeile in `rechnung_anlegen`, damit jeder Weg ihn hat:
  das Ausstellen, die Übernahme, die alte App.
*/
create or replace function app.rechnung_ohne_rest_beglichen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.total_brutto <= 0 and new.payment_status = 'Offen' then
    perform app.zahlstand_setzen(new.id);
  end if;
  return null;
end;
$$;

revoke all on function app.rechnung_ohne_rest_beglichen() from public, anon, authenticated;

drop trigger if exists invoices_ohne_rest_beglichen on public.invoices;
create trigger invoices_ohne_rest_beglichen
  after insert on public.invoices
  for each row execute function app.rechnung_ohne_rest_beglichen();
