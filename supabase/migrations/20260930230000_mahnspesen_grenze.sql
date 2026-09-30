-- TESTBERICHT 30.09.2026, M22 — MAHNSPESEN MIT GRENZE.
--
-- ENTSCHIEDEN AM 30.09.2026 (keine Rechtsberatung, mit der WKO bestätigen):
--   Unternehmer: höchstens die Pauschale von 40 € einmal je Rechnung
--                (§ 458 UGB) — hart geprüft, hier.
--   Privatkunden: das Gesetz nennt keinen Betrag, nur „angemessen“
--                (§ 1333 Abs 2 ABGB). Die Maske warnt ab 40 € je Rechnung;
--                der Betrieb darf bewusst darüber gehen.
--
-- WAS BISHER GALT: beliebige Beträge je Stufe; 2.510 € wurden ohne Rückfrage
-- gespeichert.
--
-- GEPRÜFT WIRD DIE SUMME DER DREI STUFEN (`rates.mahnspesen`, die Liste für
-- Firmenkunden) — eine Rechnung durchläuft höchstens alle drei. Nur bei
-- einer ÄNDERUNG: ein Bestand über der Grenze bleibt lesbar und rechnet
-- weiter, bis jemand ihn anfasst; dann muss er passen. Über welchen Weg
-- geschrieben wird (Leitung direkt, Buchhaltung über
-- `rechnungsvorgaben_speichern`), ist gleich — der Wächter sitzt an der Zeile.

create or replace function app.mahnspesen_grenze() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  summe numeric;
begin
  if app.ist_dienst() then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (new.rates -> 'mahnspesen') is not distinct from (old.rates -> 'mahnspesen') then
    return new;
  end if;
  if jsonb_typeof(new.rates -> 'mahnspesen') = 'array' then
    select coalesce(sum((e #>> '{}')::numeric), 0) into summe
      from jsonb_array_elements(new.rates -> 'mahnspesen') e
     where jsonb_typeof(e) = 'number';
    if summe > 40 then
      raise exception 'Mahnspesen an Firmenkunden: höchstens 40 € je Rechnung (§ 458 UGB) — eingetragen sind % €',
        to_char(summe, 'FM999G999D00') using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app.mahnspesen_grenze() from public, anon, authenticated;

drop trigger if exists companies_mahnspesen_grenze on public.companies;
create trigger companies_mahnspesen_grenze
  before insert or update of rates on public.companies
  for each row execute function app.mahnspesen_grenze();
