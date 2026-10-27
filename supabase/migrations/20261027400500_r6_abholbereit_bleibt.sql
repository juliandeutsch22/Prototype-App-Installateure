/*
  „ABHOLBEREIT SEIT“ BLEIBT NACH DEM ABHOLEN (Testbericht Runde 6, Hinweis 7)

  WAS DER BERICHT FAND. Der Verlauf einer Anforderung nannte bei
  „Abholbereit“ keinen Zeitpunkt, und ob „Seit über 3 Tagen abholbereit“
  richtig zählte, ließ sich nicht nachprüfen.

  WARUM DER ZEITPUNKT FEHLTE. `app.abholbereit_stempeln` leerte die Spalte,
  sobald die Anforderung „Abholbereit“ verließ — auch beim Abholen
  („Erledigt“). Danach wusste niemand mehr, wie lange das Material dalag.

  WAS JETZT GILT. Beim Übergang auf „Erledigt“ bleibt der Zeitpunkt stehen;
  nur wer die Anforderung zurück auf „Offen“ oder „In Bearbeitung“ stellt,
  leert ihn (sie ist dann nicht mehr abholbereit). Wer zählt, prüft weiter
  den Stand „Abholbereit“ (`istAbholbereitAlt`). Schon erledigte
  Anforderungen bekommen nichts nachgetragen — ihr Zeitpunkt ist verloren.
*/

create or replace function app.abholbereit_stempeln() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.status = 'Abholbereit' then
    if tg_op = 'INSERT' or old.status is distinct from 'Abholbereit' then
      new.abholbereit_seit := now();
    else
      new.abholbereit_seit := old.abholbereit_seit;
    end if;
  elsif new.status = 'Erledigt' and tg_op = 'UPDATE' then
    -- Abgeholt: wie lange es dalag, bleibt nachlesbar.
    new.abholbereit_seit := old.abholbereit_seit;
  else
    new.abholbereit_seit := null;
  end if;
  return new;
end;
$$;

revoke all on function app.abholbereit_stempeln() from public, anon, authenticated;
