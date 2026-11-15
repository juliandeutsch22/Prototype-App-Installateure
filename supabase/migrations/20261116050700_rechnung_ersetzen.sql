-- Durchsicht 15.11.2026, V6/F4: „Stornieren und neu ausstellen“ in einem Zug.
--
-- WAS VORHER WAR: die häufigste Korrektur — ein falscher Preis, eine falsche
-- Anschrift — kostete drei Schritte: stornieren, Baustelle neu wählen, alles
-- neu zusammenstellen. Eigene Zeilen, Rabatt und Texte der stornierten
-- Rechnung gingen dabei verloren. Und zwischen Storno und neuer Rechnung lag
-- ein halber Zustand: die Leistung war frei, aber nirgends verrechnet.
--
-- JETZT: die Ansicht belegt die neue Rechnung mit allem aus der alten vor;
-- beim Ausstellen storniert `rechnung_ersetzen` die alte und stellt die neue
-- aus — in EINER Transaktion. Scheitert das Ausstellen (eine Prüfung, eine
-- vergebene Nummer, ein inzwischen anders verrechneter Beleg), ist auch der
-- Storno nicht geschehen: die alte Rechnung gilt unverändert weiter. Die
-- Belege der alten (Zeitbuchungen, Scheine, Wartungen) gibt der Storno frei
-- und die neue sperrt sie im selben Zug wieder.
--
-- Die Stornorechnung zur alten bleibt ein eigener Schritt wie bisher: ob sie
-- nötig ist, hängt daran, ob die alte schon beim Kunden war.
--
-- SICHERHEIT: `security definer` mit ausdrücklicher Prüfung — ausstellen und
-- stornieren dürfen Buchhaltung und Leitung des eigenen Betriebs; dieselbe
-- Bedingung wie der Zeilenschutz der Rechnungen. Die aufgerufenen Funktionen
-- prüfen den Betrieb selbst (`app.betrieb()`).
--
-- Neue Funktion; die alte App kennt sie nicht und ist nicht betroffen.

create or replace function public.rechnung_ersetzen(
  p_alt uuid,
  p_grund text,
  p_kopf jsonb,
  p_positionen jsonb,
  p_belege jsonb,
  p_praefix text,
  p_wunsch integer default null,
  p_versuch uuid default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  alt public.invoices;
  schon record;
  ergebnis jsonb;
begin
  if betrieb is null or not app.angemeldet() or not app.ist_buch_oder_spitze() then
    raise exception 'Ersetzen darf, wer Rechnungen ausstellt und storniert.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_grund, '')) = '' then
    raise exception 'Bitte einen Grund für den Storno angeben — er steht in der Liste, im Ausgangsbuch und im Buchungsstapel.'
      using errcode = '22023';
  end if;

  /*
    DERSELBE VERSUCH NUR EINMAL (G2): kam er schon an, ist die alte schon
    storniert und die neue steht — dann gilt das Ergebnis von damals.
  */
  if p_versuch is not null then
    perform app.rechnungsversuch_sperren(betrieb, p_versuch);
    select i.id, i.invoice_number, i.invoice_date into schon
      from public.invoices i
     where i.company_id = betrieb and i.erstellungsversuch = p_versuch;
    if found then
      return jsonb_build_object('id', schon.id, 'invoice_number', schon.invoice_number,
                                'invoice_date', schon.invoice_date, 'bereits', true);
    end if;
  end if;

  select * into alt from public.invoices i
   where i.id = p_alt and i.company_id = betrieb
     for update;
  if alt.id is null then
    raise exception 'Die Rechnung, die ersetzt werden soll, gibt es hier nicht.' using errcode = 'P0002';
  end if;
  if alt.payment_status = 'Storniert' then
    raise exception 'Die Rechnung % ist schon storniert — bitte die neue Rechnung normal ausstellen.', alt.invoice_number
      using errcode = '22023';
  end if;

  perform public.rechnung_stornieren(p_alt, btrim(p_grund));
  ergebnis := public.rechnung_ausstellen(p_kopf, p_positionen, p_belege, p_praefix, null, p_wunsch, false, p_versuch);
  return ergebnis || jsonb_build_object('ersetzt', alt.invoice_number);
end;
$$;

revoke all on function public.rechnung_ersetzen(uuid, text, jsonb, jsonb, jsonb, text, integer, uuid) from public, anon;
grant execute on function public.rechnung_ersetzen(uuid, text, jsonb, jsonb, jsonb, text, integer, uuid) to authenticated, service_role;
