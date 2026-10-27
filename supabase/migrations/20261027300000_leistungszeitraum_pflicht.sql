-- ===========================================================================
-- KEINE RECHNUNG OHNE LEISTUNGSZEITRAUM (Testbericht Runde 6, M8)
-- ===========================================================================
--
-- Auf der Pauschalbaustelle PR-2026-0195 ging eine Teilrechnung über
-- 3.600 € brutto durch, obwohl „Leistung von“ und „Leistung bis“ leer waren
-- und die Vorschau selbst schrieb: „Ohne Leistungszeitraum ist die Rechnung
-- nach § 11 UStG unvollständig.“ Das PDF trug weder Tag noch Zeitraum der
-- Leistung — beim Kunden wackelt damit der Vorsteuerabzug, und berichtigen
-- liesse es sich nur noch über Storno und neue Rechnung.
--
-- Die Maske sperrt jetzt; die Datenbank sperrt ebenso, denn eine Rechnung
-- entsteht nur über `rechnung_anlegen`/`rechnung_ausstellen`
-- (`rechnung_nur_ueber_funktionen`) und jeder dieser Wege fügt hier ein.
-- Ein Auslöser statt einer weiteren Prüfung in `rechnung_anlegen`: so gilt
-- die Regel für jeden heutigen und künftigen Weg, ohne die lange Funktion
-- ein elftes Mal neu zu schreiben.
--
-- WAS GILT:
--   * Rechnung, Teil- und Schlussrechnung tragen Beginn und Ende der
--     Leistung (§ 11 UStG: Tag oder Zeitraum). Ein einzelner
--     Tag ist „von“ gleich „bis“.
--   * „bis“ liegt nicht vor „von“ — verdreht stünde der Zeitraum rückwärts
--     auf einem Beleg, der sich nicht mehr ändern lässt.
--   * DIE ANZAHLUNGSRECHNUNG IST AUSGENOMMEN (fachlich): ihre Leistung steht
--     noch aus. Vorbelegt wird der voraussichtliche Zeitraum aus Beginn und
--     Ende der Baustelle; ist er noch nicht bekannt, bleibt er leer, statt
--     ein Datum zu erfinden. Verdreht darf er auch dort nicht sein.
--
-- Nur beim ANLEGEN. Bestehende Rechnungen bleiben, wie sie sind — die
-- Produktion wird nicht umgeschrieben, und eine ausgestellte Rechnung ist
-- ohnehin eingefroren (`app.rechnung_eingefroren`). Der Dienstschlüssel
-- (Rückspielen einer Sicherung) ist ausgenommen wie bei den übrigen
-- Rechnungsregeln: er spielt zurück, was war.
--
-- Der Auslöser heisst `invoices_zeitraum_der_leistung`: Auslöser laufen in
-- der Reihenfolge ihrer Namen, und die genaueren Prüfungen (Empfänger, UID,
-- Vorrechnungen) sollen zuerst sprechen — der Zeitraum ist eine allgemeine
-- Pflichtangabe und kommt nach ihnen an die Reihe.

create or replace function app.leistungszeitraum_pflicht() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return new;
  end if;
  if new.leistung_von is not null and new.leistung_bis is not null
     and new.leistung_bis < new.leistung_von then
    raise exception 'Der Leistungszeitraum ist verdreht: „Leistung bis“ (%) liegt vor „Leistung von“ (%).',
      to_char(new.leistung_bis, 'DD.MM.YYYY'), to_char(new.leistung_von, 'DD.MM.YYYY')
      using errcode = '23514';
  end if;
  if coalesce(new.art, 'einzel') <> 'anzahlung'
     and (new.leistung_von is null or new.leistung_bis is null) then
    raise exception 'Ohne Tag oder Zeitraum der Leistung wird keine Rechnung angelegt (§ 11 UStG) — bitte „Leistung von“ und „Leistung bis“ eintragen, für einen einzelnen Tag beide gleich.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app.leistungszeitraum_pflicht() from public, anon, authenticated;

drop trigger if exists invoices_zeitraum_der_leistung on public.invoices;
create trigger invoices_zeitraum_der_leistung
  before insert on public.invoices
  for each row execute function app.leistungszeitraum_pflicht();
