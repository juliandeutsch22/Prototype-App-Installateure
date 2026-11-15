/*
  STORNO AN DEN BESTELLER (M11, Durchsicht 15.11.2026).

  `einkauf_stornieren` (M4) setzt eine bestellte Anforderung mit Grund zurück
  auf „zu bestellen“. Der Status bleibt „In Bearbeitung“ — das stimmt, das
  Lager arbeitet ja weiter daran —, aber der Monteur erfuhr nichts: keine
  Meldung, und in seiner Liste stand nur wieder „wird bestellt“. Er wartete
  auf Ware, die nicht kam.

  Hier: der Trigger stößt beim Storno ein eigenes Ereignis „storno“ an; die
  Edge Function `push-melden` schickt es an den Besteller (Einstellung
  „Mein angefordertes Material ist abholbereit“ — der Stand SEINER
  Anforderung). Den Stand mit Grund zeigt die App aus den Spalten von M4.

  Nur der neue Zeitpunkt zählt: eine Zeile, die den alten Storno weiterträgt
  und aus anderem Grund gespeichert wird, meldet nicht noch einmal.

  ALTE APP: unverändert — sie liest die Spalten nicht und bekommt nur die
  Meldung, wenn ihr Gerät eingetragen ist.
  DATENSCHUTZ: keine neue Tabelle, keine neuen Daten; die Meldung geht an
  den, der die Anforderung gestellt hat.
*/

-- Rumpf wie in 20261116060300_teilmengen.sql; neu ist der Block „storno“.
create or replace function app.push_bei_anforderung() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if app.lager_wert('app.anforderung_teil') is not distinct from new.id::text then
      return null;
    end if;
    perform app.push_anstossen(jsonb_build_object(
      'art', 'neu',
      'nachher', to_jsonb(new)));
    return null;
  end if;
  if new.status is distinct from old.status then
    perform app.push_anstossen(jsonb_build_object(
      'art', 'geaendert',
      'vorher', to_jsonb(old),
      'nachher', to_jsonb(new)));
  end if;
  if new.is_urgent and not old.is_urgent then
    perform app.push_anstossen(jsonb_build_object(
      'art', 'eil',
      'von', auth.uid(),
      'vorher', to_jsonb(old),
      'nachher', to_jsonb(new)));
  end if;
  if new.bestellung_storniert_am is not null
     and new.bestellung_storniert_am is distinct from old.bestellung_storniert_am then
    perform app.push_anstossen(jsonb_build_object(
      'art', 'storno',
      'vorher', to_jsonb(old),
      'nachher', to_jsonb(new)));
  end if;
  return null;
end;
$$;

revoke all on function app.push_bei_anforderung() from public, anon, authenticated;
