-- DEN HANDWERKSSCHEIN SCHREIBT, WER RAUSFÄHRT ODER DIE BAUSTELLE VERANTWORTET.
--
-- Aus dem Prüflauf vom 25.09.2026:
--
--   P3-10  `work_sheets_anlegen` fragte keine Rolle, `work_sheets_aendern`
--          nur den Betrieb. Buchhaltung und Verwaltung — die in der App gar
--          nicht an den Schein kommen (`SCHEIN_ROLLEN` in
--          `src/lib/permissions.ts`) — konnten über die Schnittstelle Scheine
--          anlegen und jeden fremden Entwurf umschreiben. Und aus einem
--          Entwurf ging JEDER Übergang: „Unterschrieben" ohne eine einzige
--          Unterschrift, „Storniert" ohne je unterschrieben gewesen zu sein.
--   P1-27  `schein_vorbereiten` gab jedem Mitglied des Betriebs die
--          Uhrzeiten und Kommentare aller Kollegen einer Baustelle — und legte
--          die Kommentare als „Tätigkeit" auf den Kundenbeleg. Ein Kommentar
--          in der Zeiterfassung ist eine Notiz für das Büro („Schlüssel lag
--          nicht da"), keine Leistungsbeschreibung für den Kunden.
--
-- WAS DIE APP TUT UND WAS DESHALB BLEIBT:
--   - Schreiben dürfen Monteur, Projektleitung, Geschäftsführung,
--     Administration — wie `SCHEIN_ROLLEN`. (Ein Supportzugang „mitarbeiten"
--     zählt über `app.ist_fuehrung()` zur Führung, wie überall.)
--   - Einen fremden Entwurf bearbeitet, verwirft oder holt zurück die
--     Führung; der Monteur seinen eigenen. Die Liste bietet es jetzt auch nur
--     so an (`WorkSheetsListView`).
--   - Unterschreiben geht über `schein_unterschreiben`, und das schreibt
--     beide Unterschriften mit. Einen Entwurf, der „nicht mehr gebraucht"
--     wird, VERWIRFT die App — storniert wird nur ein unterschriebener Schein.
--   - Die Tätigkeit aus der Zeitbuchung bleibt eine Vorbelegung — aber nur
--     aus der EIGENEN Buchung: was der Monteur selbst geschrieben hat, weiss
--     er einzuordnen. Die Kommentare der Kollegen kommen nicht mehr mit.

-- ---------------------------------------------------------------------------
-- 1. Wer einen Schein schreiben darf
-- ---------------------------------------------------------------------------

/*
  DIESELBE AUFZÄHLUNG WIE `SCHEIN_ROLLEN`: der Monteur und die Führung.
  Für einen bestehenden Schein kommt hinzu: der Monteur nur für seinen
  eigenen (`erstellt_von_uid`), die Führung für jeden.
*/
create or replace function app.schein_schreibt(p_ersteller uuid) returns boolean
  language sql stable
  set search_path = ''
as $$
  select app.ist_fuehrung()
      or (app.hat_rolle(array['Mitarbeiter']) and p_ersteller = auth.uid())
$$;

grant execute on function app.schein_schreibt(uuid) to authenticated, service_role;

/*
  Dasselbe für die Positionen, die nur die Kennung ihres Scheins kennen.
  SECURITY DEFINER, damit die Antwort nicht an der Leseregel des Scheins
  hängt; sie gibt nur einen Wahrheitswert zurück.
*/
create or replace function app.schein_bearbeitbar(p_schein uuid) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.work_sheets w
     where w.id = p_schein
       and app.schein_schreibt(w.erstellt_von_uid))
$$;

revoke all on function app.schein_bearbeitbar(uuid) from public, anon;
grant execute on function app.schein_bearbeitbar(uuid) to authenticated, service_role;

drop policy if exists work_sheets_anlegen on work_sheets;
create policy work_sheets_anlegen on work_sheets
  for insert with check (app.darf(company_id)
    and status = 'Entwurf' and erstellt_von_uid = auth.uid()
    and app.schein_schreibt(erstellt_von_uid));

drop policy if exists work_sheets_aendern on work_sheets;
create policy work_sheets_aendern on work_sheets
  for update using (app.darf(company_id) and app.schein_schreibt(erstellt_von_uid))
  with check (app.darf(company_id) and app.schein_schreibt(erstellt_von_uid));

/*
  DIE POSITIONEN FOLGEN DEM SCHEIN. Sonst schriebe `schein_speichern` für
  jemanden, der den Kopf nicht ändern darf, trotzdem Stunden und Material
  neu — der Kopf bliebe still stehen, die Positionen nicht. Gelesen wird
  weiter über die eigenen Leseregeln; `for all` schliesst das Lesen zwar
  ein, aber Richtlinien sind ODER-verknüpft.
*/
drop policy if exists work_sheet_hours_schreiben on work_sheet_hours;
create policy work_sheet_hours_schreiben on work_sheet_hours
  for all using (app.darf(company_id) and app.schein_bearbeitbar(work_sheet_id))
  with check (app.darf(company_id) and app.schein_bearbeitbar(work_sheet_id));

drop policy if exists work_sheet_material_schreiben on work_sheet_material;
create policy work_sheet_material_schreiben on work_sheet_material
  for all using (app.darf(company_id) and app.schein_bearbeitbar(work_sheet_id))
  with check (app.darf(company_id) and app.schein_bearbeitbar(work_sheet_id));

-- Mit `app.betriebsmitglied` wie bisher: Fotos bleiben dem Support verschlossen.
drop policy if exists work_sheet_photos_schreiben on work_sheet_photos;
create policy work_sheet_photos_schreiben on work_sheet_photos
  for all using (app.betriebsmitglied(company_id) and app.schein_bearbeitbar(work_sheet_id))
  with check (app.betriebsmitglied(company_id) and app.schein_bearbeitbar(work_sheet_id));

-- ---------------------------------------------------------------------------
-- 2. Aus dem Entwurf: unterschrieben nur mit Unterschriften, storniert nie
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in `20260912210000_scheinpruefsumme.sql`; neu ist nur der erste
  Absatz. „Eine Unterschrift" heisst hier: ein Objekt — so schreibt es
  `schein_unterschreiben` aus der Maske (Name, Bild, Gerätezeit). Ein JSON-
  `null` oder eine leere Zeichenkette ist keine.
*/
create or replace function app.schein_zustandswechsel() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() then return new; end if;

  if old.status = 'Entwurf' then
    if new.status = 'Storniert' then
      raise exception 'Ein Entwurf wird verworfen, nicht storniert — storniert wird ein unterschriebener Schein'
        using errcode = '42501';
    end if;
    if new.status = 'Unterschrieben'
       and (jsonb_typeof(new.unterschrift_monteur) is distinct from 'object'
            or jsonb_typeof(new.unterschrift_kunde) is distinct from 'object') then
      raise exception 'Unterschrieben ist ein Schein erst mit beiden Unterschriften — der des Monteurs und der des Kunden'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Die Pruefsumme nachtragen: nur sie, nur einmal, und nur die richtige.
  if new.status = old.status
     and old.inhalt_hash is null
     and new.inhalt_hash is not null
     and app.nur_diese_felder(to_jsonb(old), to_jsonb(new), array['inhalt_hash'])
     and new.inhalt_hash = app.schein_hash(new.id) then
    return new;
  end if;

  if old.status = 'Verworfen' and new.status = 'Entwurf' then
    if not app.nur_diese_felder(to_jsonb(old), to_jsonb(new), array['status']) then
      raise exception 'Beim Zurückholen ändert sich nur der Zustand, nicht der Inhalt'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.status = 'Unterschrieben' and new.status = 'Storniert' then
    if not app.ist_fuehrung() then
      raise exception 'Nur die Führung darf einen unterschriebenen Schein stornieren'
        using errcode = '42501';
    end if;
    if coalesce(new.storno_grund, '') = '' then
      raise exception 'Ein Storno braucht einen Grund' using errcode = '42501';
    end if;
    if not app.nur_diese_felder(to_jsonb(old), to_jsonb(new),
                                array['status', 'storno_grund', 'storniert_von_name']) then
      raise exception 'Der Storno ist eine Klammer um den Beleg, keine Gelegenheit ihn zu ändern'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Ein Schein im Zustand % lässt sich nicht mehr ändern (Ziel: %)',
    old.status, new.status using errcode = '42501';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Die Vorbelegung — für die, die den Schein schreiben, und ohne fremde Notizen
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in `20260913120000_schein_vorbereiten.sql`. Neu sind die
  Rollenfrage vorne und die Tätigkeit: sie kommt nur noch aus der EIGENEN
  Buchung des Fragenden. `tests/supabase/scheinVorbereiten.test.ts` hält
  beides fest.
*/
create or replace function public.schein_vorbereiten(
  p_baustelle text,
  p_datum date
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  nummer text := app.baustelle_wie_js(p_baustelle);
  zeilen jsonb;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if not (app.hat_rolle(array['Mitarbeiter']) or app.ist_fuehrung()) then
    raise exception 'Den Handwerksschein schreiben Monteur und Führung' using errcode = '42501';
  end if;
  if nummer = '' or p_datum is null then
    raise exception 'Baustelle und Datum sind nötig' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(z.zeile order by z.mitarbeiter collate "de-x-icu"), '[]'::jsonb)
    into zeilen
    from (
      select
        coalesce(t.user_name, 'Mitarbeiter') as mitarbeiter,
        jsonb_strip_nulls(jsonb_build_object(
          'datum',      to_char(t.date, 'YYYY-MM-DD'),
          'mitarbeiter', coalesce(t.user_name, 'Mitarbeiter'),
          'von',        to_char(t.start_time, 'HH24:MI'),
          'bis',        to_char(t.end_time, 'HH24:MI'),
          'pauseMin',   t.break_duration,
          'minuten',    app.arbeitsminuten(t.status, t.start_time, t.end_time,
                                           t.break_duration, t.hours),
          'taetigkeit', case when t.user_id = wer then t.comment end,
          'helfer',     t.is_helper
        )) as zeile
        from public.time_entries t
       where t.company_id = betrieb
         and t.date = p_datum
         and t.status = 'Anwesend'
         and app.baustelle_wie_js(t.project_number) = nummer
    ) z;

  return jsonb_build_object('zeiten', zeilen);
end;
$$;

revoke all on function public.schein_vorbereiten(text, date) from public;
grant execute on function public.schein_vorbereiten(text, date) to authenticated;
