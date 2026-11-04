-- ENTWÜRFE LASSEN SICH LÖSCHEN (Auftrag 04.11.2026: „man kann Entwürfe bzw.
-- verworfene Entwürfe nicht löschen“).
--
-- Bis hierher galt für jeden Schein „Geloescht wird ein Beleg nie“
-- (`20260911130000_vorgaenge.sql`): ein Entwurf wurde verworfen, ein
-- unterschriebener Schein storniert. Für den unterschriebenen und den
-- stornierten Schein bleibt das so — sie sind Belege, der Kunde hat sie
-- bestätigt, sie gehören sieben Jahre aufbewahrt (§ 132 BAO), und daran
-- hängen Rechnungen (`invoice_coverage`).
--
-- EIN ENTWURF IST KEIN BELEG. Niemand hat ihn unterschrieben, niemandem wurde
-- er übergeben, keine Rechnung zeigt auf ihn (verrechnet wird nur, was
-- unterschrieben ist). Ein angelegter Irrtum blieb bisher als „verworfen“ für
-- immer im Bestand — samt Fotos aus einer fremden Wohnung, für deren
-- Aufbewahrung es keinen Grund gibt (Datenminimierung, Art 5 Abs 1 lit c
-- DSGVO). Jetzt lässt er sich löschen: als Entwurf oder als verworfener.
--
-- WER: wer den Schein auch bearbeiten und verwerfen darf
-- (`app.schein_schreibt`): die Führung, ein Mitarbeiter seinen eigenen. Der
-- Support darf es nicht (`work_sheets_kein_support_schreiben` deckt auch
-- DELETE). Zeiten, Material und Fotozeilen gehen mit (ON DELETE CASCADE);
-- ihre Sperre `scheinpositionen_eingefroren` sieht den gelöschten Schein
-- nicht mehr und lässt sie gehen.

drop policy if exists work_sheets_loeschen on public.work_sheets;
create policy work_sheets_loeschen on public.work_sheets
  for delete using (
    company_id = (select app.lesebetrieb())
    and status in ('Entwurf', 'Verworfen')
    and app.schein_schreibt(erstellt_von_uid)
  );

/*
  DIE FOTOS EINES VERWORFENEN ENTWURFS LASSEN SICH ENTFERNEN.

  Die App löscht beim Löschen eines Scheins zuerst seine Dateien im Eimer
  `scheinfotos`, dann die Zeile — so bleibt im Erfolgsfall keine Datei ohne
  Schein liegen. Bisher galt eine Datei nur bei einem Entwurf als offen; der
  verworfene Entwurf ist aber genauso wenig ein Beleg. Unterschriebene und
  stornierte Scheine bleiben gesperrt wie bisher
  (`20260926110500_scheinfotos_nach_unterschrift.sql`).
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
       and w.status not in ('Entwurf', 'Verworfen'))
$$;

revoke all on function app.foto_schein_offen(text) from public, anon;
grant execute on function app.foto_schein_offen(text) to authenticated, service_role;

/*
  DARF ICH DIESEN SCHEIN LÖSCHEN? — gefragt, BEVOR die App seine Fotos
  entfernt. Die Fotos eines Entwurfs darf der ganze Betrieb entfernen (ein
  versehentlich aufgenommenes Bild muss weg können); das Löschen des Scheins
  nur, wer ihn bearbeiten darf. Ohne diese Frage räumte ein Versuch ohne Recht
  die Fotos weg und scheiterte erst an der Zeile. Dieselbe Bedingung wie
  `work_sheets_loeschen`; die Antwort ist nur ein Wahrheitswert.
*/
create or replace function public.schein_loeschbar(p_id uuid) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.work_sheets w
     where w.id = p_id
       and w.company_id = (select app.lesebetrieb())
       and w.status in ('Entwurf', 'Verworfen')
       and app.schein_schreibt(w.erstellt_von_uid)
       and not app.ist_plattform())
$$;

revoke all on function public.schein_loeschbar(uuid) from public, anon;
grant execute on function public.schein_loeschbar(uuid) to authenticated;
