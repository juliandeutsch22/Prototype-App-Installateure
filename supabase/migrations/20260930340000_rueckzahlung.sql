/*
  RÜCKZAHLUNG EINES GUTHABENS (Testbericht 30.09.2026, M21)

  Eine Rückzahlung ist ein Eintrag mit negativem Betrag — das konnte die
  Tabelle schon immer (`check (betrag <> 0)`). Gefehlt hat der Weg in der
  Maske, und gefehlt hat die Grenze: zurückgezahlt werden kann höchstens,
  was auf diese Rechnung eingegangen ist. Mehr hiesse, dem Kunden Geld zu
  überweisen, das er nie gezahlt hat; in den Büchern stünde eine Summe unter
  null, die kein Stand einer Rechnung ist.

  Geprüft wird beim Schreiben eines negativen Betrags. Bestehende Einträge
  bleiben, wie sie sind; eine Rücklastschrift (Eingang mit Minus) bleibt
  möglich, solange sie nicht mehr zurücknimmt, als eingegangen ist.
*/

create or replace function app.zahlung_nicht_unter_null() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  andere numeric(12,2);
begin
  if new.betrag >= 0 then
    return new;
  end if;
  select coalesce(sum(z.betrag), 0) into andere
    from public.zahlungseingaenge z
   where z.invoice_id = new.invoice_id and z.id is distinct from new.id;
  if andere + new.betrag < 0 then
    raise exception 'Zurückgezahlt werden kann höchstens, was eingegangen ist: % €.',
      replace(greatest(andere, 0)::text, '.', ',')
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function app.zahlung_nicht_unter_null() from public, anon, authenticated;

drop trigger if exists zahlungen_nicht_unter_null on public.zahlungseingaenge;
create trigger zahlungen_nicht_unter_null
  before insert or update on public.zahlungseingaenge
  for each row execute function app.zahlung_nicht_unter_null();
