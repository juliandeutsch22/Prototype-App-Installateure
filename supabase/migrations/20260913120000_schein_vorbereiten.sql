-- Die Positionen fuer einen Handwerksschein — in der Datenbank statt in einer
-- Cloud Function.
--
-- WARUM DAS SERVERSEITIG BLEIBT, und warum das nicht Bequemlichkeit ist: der
-- Schein braucht die Stunden der GANZEN Mannschaft eines Tages — der Kunde
-- unterschreibt fuer alle, die dort waren, nicht nur fuer den, der gerade das
-- Tablet haelt. Die Zeiteintraege seiner Kollegen darf ein Monteur aber nicht
-- lesen: sie tragen Kranken- und Urlaubstage und damit Gesundheitsdaten nach
-- Art. 9 DSGVO.
--
-- Der naheliegende Ausweg waere, Anwesenheitseintraege betriebsweit lesbar zu
-- machen. Das haette funktioniert — und nebenbei jedem Monteur offengelegt,
-- wer wann auf welcher Baustelle war. Eine Datenschutzgrenze aufzumachen,
-- weil eine Ansicht sonst umstaendlich wird, ist die falsche Reihenfolge.
--
-- Zurueck kommt deshalb genau der Inhalt des Belegs: Anwesenheitszeiten EINER
-- Baustelle an EINEM Tag. Krank- und Urlaubstage sind darin per Definition
-- nicht enthalten, und die Kollegen stehen ohnehin daneben.
--
-- MATERIAL STEHT HIER BEWUSST NICHT. Aus dem Betrieb: „der Schein ist
-- groesstenteils fuer private Kunden mit kleineren Auftraegen und
-- Reparaturen, da ist es schwierig, das schon im Voraus zu sagen." Der
-- Monteur traegt es beim Erstellen selbst ein; was er verbaut hat, weiss er
-- besser als jede Vorabbestellung.

/*
  WIE DIE APP: ein fuehrendes „PR-" aus Altbestaenden angleichen.

  `app.text_wie_js` statt `btrim`, weil JavaScripts `trim()` auch das
  geschuetzte Leerzeichen und die Bytereihenfolge-Marke wegnimmt — eine aus
  einer Tabelle kopierte Baustellennummer traegt so etwas.
*/
create or replace function app.baustelle_wie_js(p_nummer text) returns text
  language sql immutable
  set search_path = ''
as $$
  select regexp_replace(lower(app.text_wie_js(p_nummer)), '^pr-', '')
$$;

/*
  DIE SORTIERUNG IST TEIL DES BELEGS.

  `localeCompare(…, 'de')` im Browser und `collate "de-x-icu"` hier sind
  dieselbe ICU-Tabelle: „Oellinger" steht vor „Ostermann", weil Ö im Deutschen
  wie O einsortiert wird und nicht hinter Z. Eine ASCII-Sortierung haette die
  Umlaute ans Ende geschoben — auf einem Beleg, der unterschrieben wird, faellt
  so etwas auf. `tests/supabase/scheinVorbereiten.test.ts` vergleicht beide
  Reihenfolgen Namen fuer Namen.

  ZUR FORM DER UHRZEITEN: 'HH24:MI', nicht der Postgres-Standard 'HH:MM:SS'.
  Die Ansicht bekam bisher den in Firestore gespeicherten String „07:30" und
  stellt ihn unveraendert dar; „07:30:00" waere eine sichtbare Aenderung.

  Fehlende Felder kommen gar nicht vor statt als `null`: die Function liess
  `undefined` weg, und die Ansicht prueft mit `if (z.von)`. `pauseMin` ist die
  eine Ausnahme — die Spalte ist `not null default 0`, also steht dort jetzt
  eine 0, wo Firestore nichts stehen hatte.
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
  nummer text := app.baustelle_wie_js(p_baustelle);
  zeilen jsonb;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Keine Anmeldung' using errcode = '42501';
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
          'taetigkeit', t.comment,
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
