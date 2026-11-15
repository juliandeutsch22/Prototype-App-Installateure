/*
  DURCHSICHT 15.11.2026, P5 — DER ZWEITE SCHEIN AM SELBEN TAG SCHLÄGT DIE
  SCHON UNTERSCHRIEBENEN STUNDEN NICHT NOCH EINMAL VOR.

  WAS DIE DURCHSICHT FAND (`analyse/3-planung-scheine.md`, M5). Vormittag
  Schein 1 (07:00–12:00) unterschrieben, Nachmittag ein Zusatzauftrag auf
  derselben Baustelle: Schein 2 kam vorausgefüllt mit 07:00–12:00 UND
  13:00–16:00, und die Vormittagszeile ließ sich nicht wegnehmen. Der Kunde
  unterschrieb dieselben fünf Stunden zweimal. Verrechnet wird zwar aus den
  Buchungen (nicht doppelt) — aber zwei unterschriebene Belege über dieselbe
  Arbeit sind ein Streitfall, und das Formular sagte nur, man „sollte“ es
  nicht tun.

  WAS JETZT GILT. `schein_vorbereiten` liefert in `zeiten` nur die
  Buchungen, die noch auf keinem UNTERSCHRIEBENEN Schein dieser Baustelle
  und dieses Tages stehen; die übrigen kommen getrennt in `auf_schein`
  (dieselbe Form) — die App nennt sie und lässt sie bewusst übernehmen.
  Erkannt wird die Zeile, wie sie auf dem Schein steht (der Schein hält
  Kopien, keine Verweise): Name, Von, Bis, Minuten. Ein stornierter Schein
  bestätigt nichts mehr.

  Dazu `gebucht_am` (je Zeile von `zeiten`, gleiche Reihenfolge): wann die
  Buchung zuletzt geändert wurde, in Millisekunden. Damit erkennt die App
  beim Wiederöffnen eines Entwurfs, ob eine gebuchte Zeile, die im Entwurf
  fehlt, bewusst weggenommen wurde (älter als der Entwurf) oder seither
  dazugekommen ist (neuer) — sonst käme jede weggenommene Zeile wieder.

  VERTRÄGLICH: `zeiten` behält seine Form; die alte App liest die neuen
  Schlüssel nicht. Signatur, Rechte und Prüfungen wie in
  20260928130000_arbeitszeit_umstellung.sql (Rechte zuletzt
  20261027600000_rpc_ohne_anmeldung_sperren.sql).
*/

create or replace function public.schein_vorbereiten(p_baustelle text, p_datum date)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  nummer text := app.baustelle_wie_js(p_baustelle);
  zeilen jsonb;
  stand jsonb;
  doppelt jsonb;
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

  with buchung as (
    select
      coalesce(t.user_name, 'Mitarbeiter') as mitarbeiter,
      t.id,
      t.updated_at,
      to_char(t.start_time, 'HH24:MI') as von,
      to_char(t.end_time, 'HH24:MI') as bis,
      app.arbeitsminuten(t.status, t.start_time, t.end_time, t.break_duration, t.hours, t.date) as minuten,
      jsonb_strip_nulls(jsonb_build_object(
        'datum',      to_char(t.date, 'YYYY-MM-DD'),
        'mitarbeiter', coalesce(t.user_name, 'Mitarbeiter'),
        'von',        to_char(t.start_time, 'HH24:MI'),
        'bis',        to_char(t.end_time, 'HH24:MI'),
        'pauseMin',   t.break_duration,
        'minuten',    app.arbeitsminuten(t.status, t.start_time, t.end_time,
                                         t.break_duration, t.hours, t.date),
        'taetigkeit', case when t.user_id = wer then t.comment end,
        'helfer',     t.is_helper
      )) as zeile
      from public.time_entries t
     where t.company_id = betrieb
       and t.date = p_datum
       and t.status = 'Anwesend'
       and app.baustelle_wie_js(t.project_number) = nummer
  ),
  markiert as (
    select b.*,
           exists (
             select 1
               from public.work_sheets w
               join public.work_sheet_hours h on h.work_sheet_id = w.id
              where w.company_id = betrieb
                and w.status = 'Unterschrieben'
                and w.datum = p_datum
                and app.baustelle_wie_js(w.project_number) = nummer
                and coalesce(h.datum, w.datum) = p_datum
                and h.mitarbeiter = b.mitarbeiter
                and coalesce(to_char(h.von, 'HH24:MI'), '') = coalesce(b.von, '')
                and coalesce(to_char(h.bis, 'HH24:MI'), '') = coalesce(b.bis, '')
                and h.minuten = b.minuten
           ) as schon
      from buchung b
  )
  select coalesce(jsonb_agg(m.zeile order by m.mitarbeiter collate "de-x-icu", m.von, m.id) filter (where not m.schon), '[]'::jsonb),
         coalesce(jsonb_agg((extract(epoch from m.updated_at) * 1000)::bigint
                            order by m.mitarbeiter collate "de-x-icu", m.von, m.id) filter (where not m.schon), '[]'::jsonb),
         coalesce(jsonb_agg(m.zeile order by m.mitarbeiter collate "de-x-icu", m.von, m.id) filter (where m.schon), '[]'::jsonb)
    into zeilen, stand, doppelt
    from markiert m;

  return jsonb_build_object('zeiten', zeilen, 'gebucht_am', stand, 'auf_schein', doppelt);
end;
$$;

revoke all on function public.schein_vorbereiten(text, date) from public, anon;
grant execute on function public.schein_vorbereiten(text, date) to authenticated;
