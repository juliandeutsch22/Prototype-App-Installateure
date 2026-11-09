-- ZWEI BEFUNDE DER PRÜFUNG VOM 09.11.2026, beide in der Datenbank verriegelt.
--
-- 1. „BETRIEB LÖSCHEN“ LIESS FREISTELLUNGSNACHWEISE IM SPEICHER LIEGEN.
--    `betrieb_loeschen_pruefen` und `betrieb_loeschen_ausfuehren` suchten die
--    Dateien eines Betriebs über `(storage.foldername(name))[2]`. Das stimmt
--    für `scheine/{betrieb}/…`, `baustellen/{betrieb}/…`,
--    `nachrichten/{betrieb}/…` und `ausleitung/{betrieb}/…` — aber nicht für
--    den Eimer `freistellungsnachweise`, dort steht der Betrieb VORN
--    (`{betrieb}/{person}/{antrag}/…`, `20261004200000_freistellungen.sql`).
--    Die Nachweise (Arztbriefe, Bestätigungen — Gesundheitsdaten) blieben nach
--    dem Löschen des Betriebs liegen, ohne Zeile und ohne Weg dorthin; die
--    Sperre in `betrieb_loeschen_ausfuehren` sah sie ebenso wenig.
--
--    WER EINE DATEI GEHÖRT, BEANTWORTET `app.datei_betrieb` — und nur sie
--    (`20260916100000_ausleitung_dateien.sql`). Die drei Funktionen fragen jetzt
--    sie, statt den Pfad ein zweites Mal selbst zu zerlegen. Ein künftiger
--    Eimer mit eigener Pfadform ist damit an EINER Stelle einzutragen.
--
--    DAFÜR KENNT SIE JETZT AUCH DIE ÜBERGABE. `daten-ausleitung` legt die
--    Übergabe vor dem Löschen im Eimer `ausleitung` unter `uebergabe/{betrieb}/…`
--    ab — den ganzen Datenstand des Betriebs. Die alte Suche nach Stelle 2 fand
--    sie zufällig mit; `app.datei_betrieb` kannte nur `ausleitung/{betrieb}/…`.
--    Ohne diese Ergänzung bliebe nach dem Wechsel der vollständige Auszug eines
--    gelöschten Betriebs im Speicher. Für die Sicherung ändert das nichts: der
--    Eimer `ausleitung` geht nicht mit (`app.datei_eimer`), die Entscheidung
--    liegt dort.
--
--    `betrieb_uebergabe_dateien` fehlte heute keine Datei — alle gesicherten
--    Eimer tragen den Betrieb an Stelle 2. Sie fragt trotzdem dieselbe
--    Funktion, damit die Übergabe nicht still auseinanderläuft, sobald ein
--    gesicherter Eimer eine andere Pfadform bekommt.
--
-- 2. DIE LEITUNG KONNTE SICH DIE EIGENE ROLLE NEHMEN — und bei nur einer
--    Leitung den Betrieb aussperren. Das Sperren des eigenen Kontos war in der
--    Akte schon verriegelt, die Rolle nicht; in der Datenbank weder noch für
--    die Rolle (`app.adminrolle_geschuetzt` prüft die Rolle VOR der Änderung).
--    Jetzt gilt: die eigene Rolle ändert eine zweite Leitung.

-- ---------------------------------------------------------------------------
-- 1a. Wem eine Datei gehört — dazu die Übergabe
-- ---------------------------------------------------------------------------

-- Rumpf wie in `20261108800000_nachrichten.sql`; neu ist nur `uebergabe` im Zweig `ausleitung`.
create or replace function app.datei_betrieb(p_eimer text, p_name text)
  returns text
  language sql stable
  set search_path = ''
as $$
  select case p_eimer
    when 'scheinfotos'            then app.foto_betrieb(p_name)
    when 'baustellendokumente'    then app.dokument_betrieb(p_name)
    when 'ausleitung'             then case
      when (storage.foldername(p_name))[1] in ('ausleitung', 'uebergabe')
        then (storage.foldername(p_name))[2]
    end
    when 'freistellungsnachweise' then (storage.foldername(p_name))[1]
    when 'nachrichten'            then case
      when (storage.foldername(p_name))[1] = 'nachrichten'
        then (storage.foldername(p_name))[2]
    end
    when 'nachrichten-privat'     then case
      when (storage.foldername(p_name))[1] = 'nachrichten'
        then (storage.foldername(p_name))[2]
    end
  end
$$;

-- Gefragt wird sie aus Funktionen der Datenbank und mit dem Dienstschlüssel, nie ohne Anmeldung.
revoke all on function app.datei_betrieb(text, text) from public, anon;
grant execute on function app.datei_betrieb(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1b. Übergabe, Löschplan und Löschung fragen dieselbe Funktion
-- ---------------------------------------------------------------------------

-- Volle Fassung aus `20261002100000_betriebe_deaktivieren_loeschen.sql`; geändert ist nur die Zuordnung der Datei.
create or replace function public.betrieb_uebergabe_dateien(p_admin uuid, p_kennung text)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  perform app.plattform_konto_pflicht(p_admin);
  if not app.betrieb_ruht(p_kennung) then
    raise exception 'Die Übergabe gibt es für einen deaktivierten Betrieb — solange er arbeitet, exportiert er selbst'
      using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('eimer', o.bucket_id, 'pfad', o.name) order by o.bucket_id, o.name)
      from storage.objects o
     where o.bucket_id in (select e.eimer from app.datei_eimer() e where e.gesichert)
       and app.datei_betrieb(o.bucket_id, o.name) = p_kennung), '[]'::jsonb);
end;
$$;

revoke all on function public.betrieb_uebergabe_dateien(uuid, text) from public, anon, authenticated;
grant execute on function public.betrieb_uebergabe_dateien(uuid, text) to service_role;

create or replace function public.betrieb_loeschen_pruefen(p_admin uuid, p_kennung text, p_bestaetigung text, p_grund text)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  perform app.plattform_konto_pflicht(p_admin);
  perform app.grund_pflicht(p_grund);
  perform app.loeschung_pruefen(p_kennung, p_bestaetigung);
  return jsonb_build_object(
    'dateien', coalesce((
      select jsonb_agg(jsonb_build_object('eimer', o.bucket_id, 'pfad', o.name) order by o.bucket_id, o.name)
        from storage.objects o
       where o.bucket_id in (select e.eimer from app.datei_eimer() e)
         and app.datei_betrieb(o.bucket_id, o.name) = p_kennung), '[]'::jsonb),
    'konten', coalesce((
      select jsonb_agg(u.id) from public.users u where u.company_id = p_kennung), '[]'::jsonb));
end;
$$;

revoke all on function public.betrieb_loeschen_pruefen(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.betrieb_loeschen_pruefen(uuid, text, text, text) to service_role;

create or replace function public.betrieb_loeschen_ausfuehren(p_admin uuid, p_kennung text, p_bestaetigung text, p_grund text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  z public.betrieb_zustand;
  g text;
  t text;
  tabellen text[];
  offen text[];
  runde integer := 0;
  n bigint;
  zeilen bigint := 0;
  konten jsonb;
  dateien integer;
begin
  perform app.plattform_konto_pflicht(p_admin);
  g := app.grund_pflicht(p_grund);
  z := app.loeschung_pruefen(p_kennung, p_bestaetigung);

  -- Die Dateien müssen vorher weg sein: eine Zeile, deren Foto noch im Speicher liegt, bliebe sonst ohne Weg dorthin.
  select count(*) into dateien from storage.objects o
   where o.bucket_id in (select e.eimer from app.datei_eimer() e)
     and app.datei_betrieb(o.bucket_id, o.name) = p_kennung;
  if dateien > 0 then
    raise exception 'Im Speicher liegen noch % Dateien dieses Betriebs', dateien using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(u.id), '[]'::jsonb) into konten from public.users u where u.company_id = p_kennung;

  perform set_config('app.betrieb_loeschung', p_kennung, true);

  tabellen := app.auszug_tabellen();
  loop
    runde := runde + 1;
    offen := '{}';
    foreach t in array tabellen loop
      begin
        execute format('delete from public.%I where company_id = $1', t) using p_kennung;
        get diagnostics n = row_count;
        zeilen := zeilen + n;
      exception when foreign_key_violation then
        offen := offen || t;
      end;
    end loop;
    exit when cardinality(offen) = 0;
    if runde > cardinality(app.auszug_tabellen()) + 1 then
      raise exception 'Nicht alles liess sich löschen: %', array_to_string(offen, ', ');
    end if;
    tabellen := offen;
  end loop;

  delete from public.companies where id = p_kennung;

  update public.betrieb_zustand
     set geloescht_am = now(), geloescht_von = p_admin
   where betrieb_kennung = p_kennung;

  insert into public.betrieb_protokoll (betrieb_kennung, aktion, grund, von, angaben)
  values (p_kennung, 'geloescht', g, p_admin,
          jsonb_build_object('zeilen', zeilen, 'konten', jsonb_array_length(konten),
                             'testbetrieb', z.testbetrieb, 'export_am', z.export_am,
                             'antrag', z.loeschung_grund));

  return jsonb_build_object('zeilen', zeilen, 'konten', konten);
end;
$$;

revoke all on function public.betrieb_loeschen_ausfuehren(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.betrieb_loeschen_ausfuehren(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Die eigene Rolle ändert eine zweite Leitung
-- ---------------------------------------------------------------------------

/*
  NUR WENN SICH DIE ROLLE WIRKLICH ÄNDERT. Die Akte schickt beim Speichern
  die Rolle immer mit; wer am eigenen Konto den Namen ändert, kommt durch.

  DER DIENSTSCHLÜSSEL UND DER ANMELDEDIENST KOMMEN DURCH wie bei
  `app.adminrolle_geschuetzt`: Anlage eines Betriebs, Plattform, Löschung
  eines Kontos. Der Support hat keine eigene Zeile in einer Belegschaft
  (`app.kein_plattformkonto_im_betrieb`), für ihn stellt sich die Frage nicht.

  EIN EIGENER TRIGGER statt einer weiteren Zeile in `adminrolle_geschuetzt`:
  jener beantwortet, wer die Rolle Administrator vergibt; dieser, dass sich
  niemand selbst aus der Leitung nimmt. Zwei Fragen, zwei Riegel.
*/
create or replace function app.eigene_rolle_geschuetzt() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_dienst() or app.ist_anmeldedienst() then
    return new;
  end if;
  if new.id = (select auth.uid()) and new.role is distinct from old.role then
    raise exception 'Die eigene Rolle ändert eine zweite Leitung — sonst sperrt sich die Leitung womöglich selbst aus'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app.eigene_rolle_geschuetzt() from public, anon, authenticated;

drop trigger if exists users_eigene_rolle on public.users;
create trigger users_eigene_rolle
  before update of role on public.users
  for each row execute function app.eigene_rolle_geschuetzt();
