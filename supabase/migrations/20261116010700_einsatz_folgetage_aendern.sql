/*
  DURCHSICHT 15.11.2026, V13 — EINEN MEHRTÄGIGEN EINSATZ ALS GANZES ÄNDERN
  UND ENTFERNEN.

  WAS FEHLTE. „Auch an den folgenden Tagen“ (E85) legte einen mehrtägigen
  Einsatz in einem Zug an — geändert (Uhrzeit, Aufgabe, jemand heraus) und
  abgesagt wurde er nur Tag für Tag. Eine Woche Bad umzuplanen war fünfmal
  dieselbe Arbeit; vergaß man einen Tag, stand dort der alte Plan.

  WAS JETZT GILT
  - ÄNDERN: `einsatz_folgetage` mit `p_angleichen = true` macht die
    Einteilung der Folgetage gleich der des ersten Tages: wer dort nicht
    mehr steht, geht (`entfernt`), Aufgabe, Uhrzeit und Helfer-Kennzeichen
    kommen von der Zeile der Person, wer fehlt, kommt dazu — mit denselben
    Prüfungen je Tag wie beim Anlegen (Wochenende nach Wahl, Feiertag,
    Betriebsurlaub, ganztags abwesend). Ohne den Parameter ergänzt die
    Funktion wie bisher (alte App, und Anlegen).
  - ENTFERNEN: `einsatz_folgetage_entfernen` nimmt eine Person oder die ganze
    Einteilung einer Baustelle an den Tagen eines Zeitraums heraus. Wird ein
    Tag dabei leer, geschieht mit seiner Rüstliste, was gewählt ist
    (`aufloesen` oder `behalten`, wie beim einzelnen Entfernen, P2); die
    Antwort nennt je Tag, was geschah.
  - Beide nehmen die Paarsperre je Tag (P1), aufsteigend — und nur die
    Führung im eigenen Betrieb, nicht im Einblick (die Abwesenheiten sieht
    nur der Betrieb).

  VERTRÄGLICH: die alte Signatur von `einsatz_folgetage` wird entfernt statt
  überladen (PostgREST fände sonst zwei Funktionen); ein Aufruf mit den
  bisherigen fünf Namen trifft die neue. Die Antwort hat eine Spalte mehr
  (`entfernt`) und einen Wert mehr (`geaendert`); die alte App liest beides
  nicht.

  Rumpf wie in 20261115500000_einsatz_fassung.sql, geändert an den
  markierten Stellen.
*/

drop function if exists public.einsatz_folgetage(date, date, text, jsonb, boolean);

create function public.einsatz_folgetage(
  p_von date,
  p_bis date,
  p_baustelle text,
  p_zeilen jsonb,
  p_nur_werktage boolean default true,
  p_angleichen boolean default false
) returns table (
  datum date,
  ergebnis text,
  eingeteilt text[],
  abwesend text[],
  anderswo text[],
  entfernt text[]
)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  tag date;
  urlaub text;
  zeile jsonb;
  uid uuid;
  name text;
  neu integer;
  vorher integer;
  geaendert integer;
  rein text[];
  weg text[];
  dort text[];
  raus text[];
  personen uuid[];
begin
  if betrieb is null or not coalesce(app.ist_fuehrung(), false) then
    raise exception 'Einsätze plant die Führung' using errcode = '42501';
  end if;
  if betrieb is distinct from app.betrieb() then
    raise exception 'Über mehrere Tage plant im Einblick nur der Betrieb selbst' using errcode = '42501';
  end if;
  if p_von is null or p_bis is null or p_bis < p_von or p_bis - p_von > 61 then
    raise exception 'Der Zeitraum geht über höchstens 62 Tage' using errcode = '22023';
  end if;
  if coalesce(btrim(p_baustelle), '') = '' or jsonb_typeof(p_zeilen) <> 'array' or jsonb_array_length(p_zeilen) = 0 then
    raise exception 'Baustelle und Mannschaft fehlen' using errcode = '22023';
  end if;

  select coalesce(array_agg((z ->> 'user_id')::uuid), '{}') into personen from jsonb_array_elements(p_zeilen) z;

  for tag in select d::date from generate_series(p_von, p_bis, interval '1 day') d order by 1 loop
    perform app.einsatz_paar_sperren(betrieb, tag, p_baustelle);
  end loop;

  for tag in select d::date from generate_series(p_von, p_bis, interval '1 day') d loop
    datum := tag;
    eingeteilt := '{}';
    abwesend := '{}';
    anderswo := '{}';
    entfernt := '{}';

    if p_nur_werktage and extract(isodow from tag) in (6, 7) then
      ergebnis := 'wochenende';
      return next;
      continue;
    end if;
    if app.ist_feiertag(tag) then
      ergebnis := 'feiertag';
      return next;
      continue;
    end if;
    select b.bezeichnung into urlaub from public.betriebsurlaube b
     where b.company_id = betrieb and tag between b.von and b.bis limit 1;
    if urlaub is not null then
      ergebnis := 'betriebsurlaub';
      abwesend := array[urlaub];
      urlaub := null;
      return next;
      continue;
    end if;

    select count(*) into vorher from public.assignments a
     where a.company_id = betrieb and a.date = tag and a.project_number = p_baustelle;
    neu := 0;
    geaendert := 0;
    rein := '{}';
    weg := '{}';
    dort := '{}';
    raus := '{}';

    -- NEU (V13): wer am ersten Tag nicht mehr steht, geht auch hier.
    if p_angleichen and vorher > 0 then
      with geloescht as (
        delete from public.assignments a
         where a.company_id = betrieb and a.date = tag and a.project_number = p_baustelle
           and not (a.user_id = any (personen))
        returning coalesce(a.user_name, 'Mitarbeiter') as n
      )
      select coalesce(array_agg(n), '{}') into raus from geloescht;
    end if;

    for zeile in select * from jsonb_array_elements(p_zeilen) loop
      uid := (zeile ->> 'user_id')::uuid;
      name := coalesce(nullif(btrim(zeile ->> 'user_name'), ''), 'Mitarbeiter');
      if exists (select 1 from public.wochenplan_abwesend(tag, tag) w where w.user_id = uid and w.zeiten is null) then
        weg := weg || name;
        continue;
      end if;
      if exists (select 1 from public.assignments a
                  where a.company_id = betrieb and a.date = tag and a.project_number <> p_baustelle and a.user_id = uid) then
        dort := dort || name;
      end if;
      if exists (select 1 from public.assignments a
                  where a.company_id = betrieb and a.date = tag and a.project_number = p_baustelle and a.user_id = uid) then
        -- NEU (V13): beim Angleichen Aufgabe, Uhrzeit und Kennzeichen vom ersten Tag.
        if p_angleichen then
          update public.assignments a
             set comment = zeile ->> 'comment',
                 zeit_von = nullif(zeile ->> 'zeit_von', '')::time,
                 zeit_bis = nullif(zeile ->> 'zeit_bis', '')::time,
                 as_helper = coalesce((zeile ->> 'as_helper')::boolean, false)
           where a.company_id = betrieb and a.date = tag and a.project_number = p_baustelle and a.user_id = uid
             and (a.comment is distinct from zeile ->> 'comment'
                  or a.zeit_von is distinct from nullif(zeile ->> 'zeit_von', '')::time
                  or a.zeit_bis is distinct from nullif(zeile ->> 'zeit_bis', '')::time
                  or a.as_helper is distinct from coalesce((zeile ->> 'as_helper')::boolean, false));
          if found then
            geaendert := geaendert + 1;
          end if;
        end if;
        continue;
      end if;
      insert into public.assignments (
        company_id, date, project_number, user_id, user_name, as_helper, comment, created_by, zeit_von, zeit_bis
      ) values (
        betrieb, tag, p_baustelle, uid, zeile ->> 'user_name',
        coalesce((zeile ->> 'as_helper')::boolean, false),
        zeile ->> 'comment', zeile ->> 'created_by',
        nullif(zeile ->> 'zeit_von', '')::time, nullif(zeile ->> 'zeit_bis', '')::time
      );
      neu := neu + 1;
      rein := rein || name;
    end loop;

    if neu > 0 or cardinality(raus) > 0 then
      -- Mannschaft der Liste und Abholer der Fehlmenge (P2); wird der Tag leer, bleibt die Liste stehen.
      perform app.ruestliste_nachziehen(betrieb, tag, p_baustelle, 'behalten');
    end if;

    eingeteilt := rein;
    abwesend := weg;
    anderswo := dort;
    entfernt := raus;
    ergebnis := case
      when vorher > 0 and (neu > 0 or geaendert > 0 or cardinality(raus) > 0) and p_angleichen then 'geaendert'
      when neu > 0 and vorher > 0 then 'ergaenzt'
      when neu > 0 then 'geplant'
      when array_length(weg, 1) = jsonb_array_length(p_zeilen) then 'alle_abwesend'
      else 'unveraendert'
    end;
    return next;
  end loop;
end;
$$;

revoke all on function public.einsatz_folgetage(date, date, text, jsonb, boolean, boolean) from public, anon;
grant execute on function public.einsatz_folgetage(date, date, text, jsonb, boolean, boolean) to authenticated;

/*
  EINE PERSON (oder alle) AN DEN TAGEN EINES ZEITRAUMS AUS DER EINTEILUNG
  EINER BAUSTELLE NEHMEN. `p_ruestliste` für Tage, die dabei leer werden:
  'aufloesen' oder 'behalten' (Vorgabe). Je Tag mit Änderung eine Zeile.
*/
create or replace function public.einsatz_folgetage_entfernen(
  p_von date,
  p_bis date,
  p_baustelle text,
  p_user uuid default null,
  p_ruestliste text default 'behalten'
) returns table (datum date, entfernt integer, ruestliste text, in_arbeit integer)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.darf_umplanen();
  tag date;
  anzahl integer;
  folge jsonb;
begin
  if p_von is null or p_bis is null or p_bis < p_von or p_bis - p_von > 61 then
    raise exception 'Der Zeitraum geht über höchstens 62 Tage' using errcode = '22023';
  end if;
  if coalesce(btrim(p_baustelle), '') = '' then
    raise exception 'Die Baustelle fehlt' using errcode = '22023';
  end if;
  if p_ruestliste not in ('aufloesen', 'behalten') then
    raise exception 'Für mehrere Tage gilt „auflösen“ oder „behalten“' using errcode = '22023';
  end if;

  for tag in select d::date from generate_series(p_von, p_bis, interval '1 day') d order by 1 loop
    perform app.einsatz_paar_sperren(betrieb, tag, p_baustelle);
  end loop;

  for tag in select d::date from generate_series(p_von, p_bis, interval '1 day') d order by 1 loop
    delete from public.assignments a
     where a.company_id = betrieb and a.date = tag and a.project_number = p_baustelle
       and (p_user is null or a.user_id = p_user);
    get diagnostics anzahl = row_count;
    continue when anzahl = 0;
    folge := app.ruestliste_nachziehen(betrieb, tag, p_baustelle, p_ruestliste);
    datum := tag;
    entfernt := anzahl;
    ruestliste := folge ->> 'ruestliste';
    in_arbeit := coalesce((folge ->> 'in_arbeit')::integer, 0);
    return next;
  end loop;
end;
$$;

revoke all on function public.einsatz_folgetage_entfernen(date, date, text, uuid, text) from public, anon;
grant execute on function public.einsatz_folgetage_entfernen(date, date, text, uuid, text) to authenticated;
