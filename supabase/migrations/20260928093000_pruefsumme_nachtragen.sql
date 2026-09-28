/*
  FEHLENDE PRÜFSUMMEN WERDEN NACHTS NACHGETRAGEN (offene Punkte C10).

  Der Auslöser `work_sheets_pruefsumme` rechnet die Prüfsumme beim
  Unterschreiben — und fängt jeden Fehler ab, damit der Monteur vor dem
  Kunden abschliessen kann. Schlug die Rechnung fehl, blieb das Feld leer,
  und zwar für immer: der Auslöser springt nur beim Übergang an, und danach
  lief nichts mehr darüber. Das PDF sagte dauerhaft „wird ergänzt".

  JETZT HOLT EIN NÄCHTLICHER LAUF ES NACH. Er schreibt über dieselbe
  Ausnahme am Riegel (`app.schein_zustandswechsel`), die schon der Auslöser
  nutzt: nur `inhalt_hash`, nur solange er leer ist, und nur der Wert, den
  `app.schein_hash` über den eingefrorenen Inhalt rechnet. Er kann also
  nichts eintragen, was nicht ohnehin dort stünde.

  Ein Schein, bei dem es wieder scheitert, bleibt leer und hält den Lauf
  nicht auf; die Warnung steht im Protokoll der Datenbank.
*/
create or replace function app.pruefsummen_nachtragen() returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  schein record;
  hash text;
  n integer := 0;
begin
  for schein in
    select id from public.work_sheets
     where status in ('Unterschrieben', 'Storniert') and inhalt_hash is null
  loop
    begin
      hash := app.schein_hash(schein.id);
      if hash is not null then
        update public.work_sheets set inhalt_hash = hash where id = schein.id;
        n := n + 1;
      end if;
    exception when others then
      raise warning 'Prüfsumme für Schein % liess sich nicht nachtragen: %', schein.id, sqlerrm;
    end;
  end loop;
  return n;
end;
$$;

revoke all on function app.pruefsummen_nachtragen() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('pruefsummen-nachtragen');
exception when others then
  -- Beim ersten Einspielen gibt es ihn noch nicht.
  null;
end;
$$;

do $$
begin
  perform cron.schedule('pruefsummen-nachtragen', '25 3 * * *', 'select app.pruefsummen_nachtragen()');
exception when others then
  raise warning 'Das Nachtragen der Prüfsummen konnte nicht eingeplant werden: %', sqlerrm;
end;
$$;
