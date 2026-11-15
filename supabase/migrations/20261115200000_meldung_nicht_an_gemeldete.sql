/*
  EINE MELDUNG ERREICHT NIE DEN, ÜBER DEN SIE IST (K1, Durchsicht 15.11.2026).

  Der Meldedialog sagt: „<Absender> erfährt von der Meldung nichts durch die
  App.“ Gehörte der Absender selbst zur Leitung (Geschäftsführung oder
  Administration), stimmte das nicht: er sah die Meldung über sich samt Namen
  der meldenden Person und Grund, auf der Startseite als Zahl, im Auszug und
  in der Datenauskunft — und konnte sie erledigen und löschen. In einem
  Betrieb mit einer einzigen Leitung landete jede Meldung über sie bei ihr
  selbst. Das ist genau der heikelste Fall: wer sich über die Chefin
  beschwert, muss sich darauf verlassen können, dass sie es nicht liest.

  Die Regel, an jedem Weg dieselbe: eine Meldung, deren gemeldete Nachricht
  vom Aufrufer stammt (`von_uid = auth.uid()`), gibt es für ihn nicht —
  nicht in der Liste, nicht in der Zahl, nicht beim Erledigen oder Löschen
  (dieselbe Antwort wie für eine Kennung, die es nicht gibt, also kein
  Rückschluss), nicht als Datei aus der Meldung, nicht im Auszug „Alle Daten
  herunterladen“, nicht in Datenauskunft und Löschbericht einer Person. Die
  übrige Leitung sieht alles wie bisher.

  Die Regel hängt an der Nachricht, nicht an der Rolle: wird der Absender
  erst später Geschäftsführung, sieht er die Meldungen über sich trotzdem
  nicht. Ist sein Konto gelöscht (`von_uid` leer), sieht sie die ganze
  Leitung.

  Bewusst NICHT ausgenommen: die nächtliche Sicherung
  (`app.auszug_snapshot_zeilen`). Sie läuft mit dem Dienstschlüssel, liegt
  bei der Plattform und muss für einen Wiederanlauf vollständig sein; kein
  Konto des Betriebs liest sie.

  Signaturen und Rechte der bestehenden Funktionen bleiben, wie sie sind —
  die App, die noch auf den Telefonen läuft, ruft sie unverändert auf.

  Neu ist nur `public.nachricht_meldung_erreicht_jemanden(p_nachricht)`: ob
  außer dem Absender und dem Aufrufer jemand im Betrieb Meldungen sieht. Der
  Meldedialog sagt es VOR dem Absenden ehrlich, wenn niemand da ist. Sie
  liefert nur ja oder nein, nie wer.
*/

-- ---------------------------------------------------------------------------
-- 1. Liste, Erledigen, Löschen, Zahl
-- ---------------------------------------------------------------------------

create or replace function public.nachricht_meldungen(p_status text default null) returns setof public.nachricht_meldungen
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare betrieb text := app.darf_meldungen_sehen();
begin
  return query
  select * from public.nachricht_meldungen m
   where m.company_id = betrieb and (p_status is null or m.status = p_status)
     -- K1: die Meldung über die eigene Nachricht gibt es für den Absender nicht.
     and m.von_uid is distinct from (select auth.uid())
   order by (m.status = 'offen') desc, m.gemeldet_am desc;
end;
$$;

revoke all on function public.nachricht_meldungen(text) from public, anon;
grant execute on function public.nachricht_meldungen(text) to authenticated;

create or replace function public.nachricht_meldung_erledigen(p_meldung uuid, p_vermerk text) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.darf_meldungen_sehen();
  anzahl integer;
begin
  if length(btrim(coalesce(p_vermerk, ''))) > 2000 then
    raise exception 'Der Vermerk hat höchstens 2 000 Zeichen' using errcode = '22001';
  end if;
  update public.nachricht_meldungen
     set status = 'erledigt', erledigt_von = auth.uid(), erledigt_am = now(),
         erledigt_von_name = (select u.name from public.users u where u.id = auth.uid()),
         vermerk = nullif(btrim(coalesce(p_vermerk, '')), '')
   where id = p_meldung and company_id = betrieb and status = 'offen'
     -- K1: wer gemeldet wurde, erledigt die Meldung über sich nicht.
     and von_uid is distinct from (select auth.uid());
  get diagnostics anzahl = row_count;
  if anzahl = 0 then
    -- Dieselbe Antwort wie für eine Kennung, die es nicht gibt: kein Rückschluss.
    raise exception 'Diese Meldung gibt es nicht oder sie ist schon erledigt' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.nachricht_meldung_erledigen(uuid, text) from public, anon;
grant execute on function public.nachricht_meldung_erledigen(uuid, text) to authenticated;

create or replace function public.nachricht_meldung_loeschen(p_meldung uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.darf_meldungen_sehen();
  m public.nachricht_meldungen;
begin
  delete from public.nachricht_meldungen
   where id = p_meldung and company_id = betrieb and status = 'erledigt'
     -- K1: wer gemeldet wurde, beseitigt die Meldung über sich nicht.
     and von_uid is distinct from (select auth.uid())
  returning * into m;
  if m.id is null then
    -- Dieselbe Antwort wie für eine Kennung, die es nicht gibt: kein Rückschluss.
    raise exception 'Gelöscht wird eine erledigte Meldung' using errcode = '55000';
  end if;
  if jsonb_array_length(m.anhaenge) > 0 then
    insert into app.nachrichten_dateien_weg (eimer, pfad)
    select x ->> 'eimer', x ->> 'pfad' from jsonb_array_elements(m.anhaenge) x
    on conflict (eimer, pfad) do nothing;
    perform app.nachrichten_aufraeumen_anstossen();
  end if;
end;
$$;

revoke all on function public.nachricht_meldung_loeschen(uuid) from public, anon;
grant execute on function public.nachricht_meldung_loeschen(uuid) to authenticated;

create or replace function public.nachricht_meldungen_offen() returns integer
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not app.angemeldet() or app.ist_plattform() or app.betrieb() is null
     or not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    return 0;
  end if;
  -- K1: die Zahl auf der Startseite zählt, was die Liste zeigt — ohne die Meldungen über den Aufrufer.
  return (select count(*) from public.nachricht_meldungen m
           where m.company_id = app.betrieb() and m.status = 'offen'
             and m.von_uid is distinct from (select auth.uid()));
end;
$$;

revoke all on function public.nachricht_meldungen_offen() from public, anon;
grant execute on function public.nachricht_meldungen_offen() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Die Datei aus der Meldung
-- ---------------------------------------------------------------------------

/*
  Löscht der Absender seine Nachricht, bleibt ihre Datei für die Meldung
  liegen. Ohne die Ausnahme hier bekäme er sie über ihren alten Pfad weiter
  — und wüsste daran, dass jemand die Nachricht gemeldet hat.
*/
create or replace function app.nachrichten_datei_lesbar(p_eimer text, p_pfad text) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select app.angemeldet() and not app.ist_plattform() and (
    exists (select 1 from public.nachricht_anhaenge a
             where a.eimer = p_eimer and a.pfad = p_pfad
               and a.company_id = app.betrieb()
               and app.nachrichten_kanal_lesbar(a.kanal_id))
    or (app.hat_rolle(array['Geschäftsführung', 'Administrator'])
        and exists (select 1 from public.nachricht_meldungen m
                     where m.company_id = app.betrieb()
                       and m.von_uid is distinct from (select auth.uid())
                       and m.anhaenge @> jsonb_build_array(jsonb_build_object('eimer', p_eimer, 'pfad', p_pfad)))))
$$;

revoke all on function app.nachrichten_datei_lesbar(text, text) from public, anon, authenticated;
grant execute on function app.nachrichten_datei_lesbar(text, text) to authenticated;

/*
  DER ZWEITE WEG ZUR DATEI. Die Speicherregel lässt den Hochladenden seine
  „noch nicht gesendete“ Datei lesen und überschreiben (Wiederholung aus dem
  Ausgangsfach) — erkannt daran, dass kein Anhang auf sie zeigt. Nach dem
  Löschen der Nachricht zeigt keiner mehr auf sie, die Meldung hält sie aber
  fest: der Absender hätte sie über diesen Weg weiter gelesen (und damit von
  der Meldung erfahren) und sogar überschreiben, also das Beweisstück der
  Meldung austauschen können. Eine Datei, die eine Meldung hält, ist deshalb
  für niemanden mehr „noch nicht gesendet“. Sonst wie in
  `20261108800000_nachrichten.sql`.
*/
create or replace function app.nachrichten_datei_schreibbar(p_eimer text, p_pfad text) returns boolean
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  teile text[] := storage.foldername(p_pfad);
  k public.nachrichten_kanaele;
begin
  if array_length(teile, 1) is distinct from 4 or teile[1] <> 'nachrichten' or teile[2] is distinct from app.betrieb() then
    return false;
  end if;
  begin
    select * into k from public.nachrichten_kanaele where id = teile[3]::uuid;
    perform teile[4]::uuid;
    perform (storage.filename(p_pfad))::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if k.id is null or (k.privat and p_eimer <> 'nachrichten-privat') or (not k.privat and p_eimer <> 'nachrichten') then
    return false;
  end if;
  if exists (select 1 from public.nachricht_anhaenge a where a.eimer = p_eimer and a.pfad = p_pfad) then
    return false;
  end if;
  -- K1: eine Datei, die eine Meldung festhält, ist gesendet — auch wenn ihre Nachricht gelöscht ist.
  if exists (select 1 from public.nachricht_meldungen m
              where m.company_id = k.company_id
                and m.anhaenge @> jsonb_build_array(jsonb_build_object('eimer', p_eimer, 'pfad', p_pfad))) then
    return false;
  end if;
  return app.nachrichten_schreibsperre(k.id) is null;
end;
$$;

revoke all on function app.nachrichten_datei_schreibbar(text, text) from public, anon, authenticated;
grant execute on function app.nachrichten_datei_schreibbar(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Auszug, Datenauskunft, Löschbericht — gezielt eingefügt, wiederholbar
-- ---------------------------------------------------------------------------

/*
  „ALLE DATEN HERUNTERLADEN“ holt die Leitung. Die Zeilen der Meldungen über
  sie selbst stünden dort vollständig, Melder und Grund inklusive.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.betrieb_auszug(integer)'::regprocedure);
  if position('nachricht_meldungen' in quelle) = 0 then
    marke := $m$case when privat then ' and not t.privat' else '' end)$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Auszug: Einfügestelle fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke,
      $eintrag$case when privat then ' and not t.privat'
           -- K1: die Meldungen über den Aufrufer bleiben draußen.
           when tabelle = 'nachricht_meldungen' then ' and t.von_uid is distinct from auth.uid()'
           else '' end)$eintrag$);
    execute quelle;
  end if;
end;
$migration$;

/*
  DATENAUSKUNFT UND LÖSCHBERICHT stellt die Leitung für eine Person aus.
  Bisher standen dort die Meldungen, an denen die Person beteiligt ist —
  als Melder oder als Absender. Ruft sie die Person auf, über die eine
  Meldung ist, erführe sie aus der Auskunft über den Melder (oder aus der
  bloßen Anzahl im Löschbericht), dass und warum sie gemeldet wurde. Diese
  Meldungen nennt dann die übrige Leitung, die sie ohnehin führt.
*/
do $migration$
declare quelle text; marke text; neu text;
begin
  marke := $m$(m.gemeldet_von = p_id or m.von_uid = p_id)$m$;
  neu := $m$(m.gemeldet_von = p_id or m.von_uid = p_id) and m.von_uid is distinct from (select auth.uid())$m$;

  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position(neu in quelle) = 0 then
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Personenauskunft: Einfügestelle Meldungen fehlt oder ist nicht eindeutig';
    end if;
    execute replace(quelle, marke, neu);
  end if;

  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position(neu in quelle) = 0 then
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Löschung: Einfügestelle Meldungen fehlt oder ist nicht eindeutig';
    end if;
    execute replace(quelle, marke, neu);
  end if;
end;
$migration$;

-- ---------------------------------------------------------------------------
-- 4. Erreicht die Meldung jemanden?
-- ---------------------------------------------------------------------------

/*
  OB AUSSER DEM ABSENDER UND DEM AUFRUFER JEMAND MELDUNGEN SIEHT — aktive
  Geschäftsführung oder Administration im Betrieb. Der Aufrufer zählt nicht
  mit: meldet die einzige weitere Leitung selbst, läge die Meldung nur bei
  ihr, und das soll sie vorher wissen.

  Nur ja oder nein, nie wer oder wie viele. Fragen darf, wer die Nachricht
  auch melden darf (dieselbe Prüfung wie `nachricht_melden`): sonst ließe
  sich an der Antwort ablesen, ob es eine fremde Nachricht gibt.
*/
create or replace function public.nachricht_meldung_erreicht_jemanden(p_nachricht uuid) returns boolean
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  n public.nachrichten;
begin
  select * into n from public.nachrichten where id = p_nachricht and company_id = ich.company_id;
  if n.id is null or not app.nachrichten_kanal_lesbar(n.kanal_id) or n.gesendet_am < app.nachrichten_sichtbar_ab(n.kanal_id) then
    raise exception 'Diese Nachricht gibt es nicht oder sie ist nicht an dich' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.users u
     where u.company_id = ich.company_id
       and u.active
       and u.role in ('Geschäftsführung', 'Administrator')
       and u.id <> ich.id
       and u.id is distinct from n.von_uid);
end;
$$;

revoke all on function public.nachricht_meldung_erreicht_jemanden(uuid) from public, anon;
grant execute on function public.nachricht_meldung_erreicht_jemanden(uuid) to authenticated;
