-- DIE FOTOS EINES UNTERSCHRIEBENEN SCHEINS BLEIBEN LIEGEN.
--
-- Aus dem Prüflauf vom 25.09.2026 (P1-10, P3-11): Ersetzen und Löschen im
-- Eimer `scheinfotos` fragten nur, ob die Datei zum eigenen Betrieb gehört.
-- Jedes Mitglied konnte damit das Foto eines unterschriebenen oder
-- stornierten Scheins entfernen oder mit anderem Inhalt überschreiben. Die
-- Prüfsumme hätte das hinterher gezeigt — aber das Bild, das der Kunde
-- gesehen hat, wäre weg gewesen, und genau das ist der Beleg.
--
-- Der Kommentar in `20260913160000_scheinfotos.sql` („danach schützt es der
-- Schein") stimmte also nur zur Hälfte: der Schein ZEIGT den Verlust, er
-- VERHINDERT ihn nicht. Jetzt verhindert ihn die Regel.
--
-- WELCHER SCHEIN: der Pfad ist `scheine/{betrieb}/{schein}/{datei}`
-- (`features/worksheets/fotos.ts`, `fotoPfad`) — der Schein steht im dritten
-- Abschnitt. Gibt es zu ihm (noch) keine Zeile, ist es ein Entwurf, der noch
-- nicht gespeichert wurde: die Fotos gehen hoch, bevor der Schein das erste
-- Mal gespeichert ist. Dort bleibt alles wie bisher.

/*
  Ist das Objekt noch veränderbar? Ja, solange sein Schein ein Entwurf ist
  oder es (noch) keinen gibt.

  SECURITY DEFINER, weil die Regel auf `storage.objects` in `work_sheets`
  nachsieht; so hängt die Antwort nicht an einer zweiten Leseregel. Sie gibt
  nur einen Wahrheitswert zurück.

  Das `case` ist nicht Zierde: ein Abschnitt, der keine Kennung ist (ältere
  Pfade, Prüfungen), fiele sonst beim Umwandeln mit einem Fehler um — und
  mit ihm jede Anfrage an den Eimer.
*/
create or replace function app.foto_schein_offen(objektname text) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select not exists (
    select 1 from public.work_sheets w
     where w.id = case
             when (storage.foldername(objektname))[3]
                  ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then ((storage.foldername(objektname))[3])::uuid
           end
       and w.company_id = (storage.foldername(objektname))[2]
       and w.status <> 'Entwurf')
$$;

revoke all on function app.foto_schein_offen(text) from public, anon;
grant execute on function app.foto_schein_offen(text) to authenticated, service_role;

drop policy if exists scheinfotos_ersetzen on storage.objects;
create policy scheinfotos_ersetzen on storage.objects for update to authenticated
  using (bucket_id = 'scheinfotos' and app.betriebsmitglied(app.foto_betrieb(name))
         and app.foto_schein_offen(name))
  with check (bucket_id = 'scheinfotos' and app.betriebsmitglied(app.foto_betrieb(name))
              and app.foto_schein_offen(name));

drop policy if exists scheinfotos_loeschen on storage.objects;
create policy scheinfotos_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'scheinfotos' and app.betriebsmitglied(app.foto_betrieb(name))
         and app.foto_schein_offen(name));
