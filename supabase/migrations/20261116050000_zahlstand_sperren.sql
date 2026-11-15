-- Durchsicht 15.11.2026, G9: gleichzeitige Zahlungseingänge (oder Eingang und
-- Storno) überschreiben den Zahlstand nicht mehr.
--
-- NACHGESTELLT, NICHT VERMUTET (Kratzdatenbank, zwei Sitzungen):
--   1. Eingang A (100 €) und Eingang B (50 €) auf dieselbe Rechnung, B
--      beginnt, während A noch offen ist. `app.zahlstand_setzen` von B
--      summiert ohne A (noch nicht bestätigt), wartet beim Schreiben auf A
--      und schreibt danach seine Teilsumme: `bezahlt_betrag` 50 €, die
--      Eingänge ergeben 150 €.
--   2. Storno läuft, ein Eingang über den vollen Betrag kommt dazu. Der
--      Eingang liest den Stand „Offen“ vor dem Warten und schreibt danach
--      „Bezahlt“ über „Storniert“ — die Rechnung steht mit Stornodatum als
--      bezahlt da.
--
-- DIE URSACHE: gelesen wurde vor dem Warten. Postgres prüft beim Schreiben
-- nur die Bedingung der Anweisung neu, nicht die Zahlen, die die Funktion
-- vorher gerechnet hat.
--
-- DIE LÖSUNG: zuerst die Rechnung sperren, dann lesen. Wer danach kommt,
-- wartet auf die Sperre und liest erst, wenn der andere fertig ist — dann
-- mit dessen Ergebnis. Gesperrt wird an zwei Stellen:
--   - in `app.zahlstand_setzen` selbst, weil es auch Storno-Aufheben aufruft;
--   - in einem Auslöser VOR allen Prüfungen eines Eingangs. Auch
--     `app.skonto_passt` und `app.zahlung_nicht_unter_null` summieren die
--     anderen Eingänge, um eine Grenze zu prüfen; ohne Sperre ließen zwei
--     gleichzeitige Skonti zusammen mehr zu als zugesagt.
-- `app.mahnkosten_passt` sperrte schon (`for update`); es bleibt, wie es ist.
--
-- Verträglich mit der alten App: nichts an Spalten oder Aufrufen ändert sich.

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
  /*
    ERST SPERREN, DANN LESEN (G9). Die Sperre wartet auf jeden, der die
    Rechnung gerade schreibt — einen anderen Eingang, einen Storno. Erst
    danach werden Stand und Eingänge gelesen, und zwar mit dessen Ergebnis.
  */
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
    neu := case when status = 'Überfällig' then 'Überfällig' else 'Offen' end;
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

-- Rechte wie bisher (`20261110160100`): `app.zahlung_wirkt` läuft als Aufrufer.
revoke all on function app.zahlstand_setzen(uuid) from public, anon;
grant execute on function app.zahlstand_setzen(uuid) to authenticated, service_role;

/*
  VOR DEN PRÜFUNGEN EINES EINGANGS die Rechnung sperren. Der Name ordnet den
  Auslöser vor `zahlungen_betrieb_fest`, `zahlungen_mahnkosten_passt`,
  `zahlungen_nicht_unter_null` und `zahlungen_skonto_passt` ein — Postgres
  ruft Auslöser derselben Art in der Reihenfolge ihrer Namen auf.

  Wird ein Eingang auf eine andere Rechnung umgehängt, sind beide betroffen;
  gesperrt wird in fester Reihenfolge der Kennung, damit zwei Umhängungen in
  Gegenrichtung nicht aufeinander warten.

  Ohne Zeilenschutz-Prüfung, weil `security definer`: der Eingang selbst ist
  schon durch die Regeln von `zahlungseingaenge` gegangen, und
  `app.zahlung_rechnung_passt` weist eine fremde Rechnung danach ab. Diese
  Funktion liest nichts zurück, sie wartet nur.
*/
create or replace function app.zahlung_rechnung_sperren() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform 1
     from public.invoices i
    where i.id in (
            select k from unnest(array[
              case when tg_op <> 'INSERT' then old.invoice_id end,
              case when tg_op <> 'DELETE' then new.invoice_id end]) k
             where k is not null)
    order by i.id
      for update;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function app.zahlung_rechnung_sperren() from public, anon, authenticated;

drop trigger if exists zahlungen_a_rechnung_sperren on public.zahlungseingaenge;
create trigger zahlungen_a_rechnung_sperren
  before insert or update or delete on public.zahlungseingaenge
  for each row execute function app.zahlung_rechnung_sperren();
