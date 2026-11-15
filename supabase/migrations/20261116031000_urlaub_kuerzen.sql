/*
  GENEHMIGTEN URLAUB KÜRZEN (Z1, Durchsicht 15.11.2026).

  Ein genehmigter Urlaub oder Zeitausgleich ließ sich bisher nur ganz
  zurücknehmen (`urlaub_entscheiden` mit „Storniert“). Kommt der Monteur
  früher zurück oder wird er an einem Tag gebraucht, hieß das: alles
  zurücknehmen und neu beantragen, neu genehmigen — mit zweiter Person beim
  Vier-Augen-Prinzip.

  `urlaub_kuerzen` verkleinert den genehmigten Zeitraum (später weg, früher
  zurück) und streicht einzelne Tage. Wer darf: wer über Urlaub entscheidet,
  über den eigenen Urlaub wie beim Zurücknehmen nur, wenn sonst niemand
  entscheidet. Ein Grund ist Pflicht.

  WAS DABEI GESCHIEHT, alles in einer Transaktion:
    - Die Tage im Zeitkonto außerhalb des neuen Zeitraums und die
      gestrichenen Tage werden entfernt — nur die, die die Genehmigung
      angelegt hat (`vacation_id`), wie beim Zurücknehmen.
    - EIN GESTRICHENER TAG MITTEN IM URLAUB TEILT DEN ANTRAG. Der erste Teil
      bleibt dieser Antrag, jeder weitere wird ein eigener genehmigter Antrag
      mit denselben Angaben; seine Tage im Zeitkonto ziehen mit. So bleibt
      ein genehmigter Antrag immer ein Zeitraum ohne Lücke — und alles, was
      Urlaub über „von–bis“ liest (Wochenplan, Kalender, „Urlaub im Monat“,
      Kalender-Abo), stimmt ohne eigene Regel für Lücken.
    - `tage` folgt den entfernten Tagen (Urlaub: der Tagesanteil, der
      24./31.12. halb); beim Zeitausgleich die Arbeitstage des Zeitraums.
    - Krankentage im Urlaub (§ 5 UrlG, `krank_tage`) außerhalb des neuen
      Zeitraums fallen aus dem Antrag: sonst gäbe eine spätere Kürzung der
      Krankmeldung dort einen Urlaubstag zurück, wo keiner mehr genehmigt ist.
    - Am Antrag steht die Änderung im Verlauf (`aenderungen`): wann, von wem,
      warum, Zeitraum vorher und nachher, gestrichene Tage. Wer entschieden
      hat, steht schon heute am Antrag (`entschieden_von_name`); der Name im
      Verlauf ist derselbe Personenbezug am selben Antrag und geht mit ihm in
      Auskunft und Löschung (`person_auskunft` nimmt die Zeile ganz,
      `person_loeschen` löscht die Anträge der Person).
    - Die Person bekommt eine Meldung (Push „Urlaub gekürzt“).

  NICHT GEKÜRZT WIRD: ein Betriebsurlaub (er wird im Reiter „Betriebsurlaub“
  geändert, wie beim Zurücknehmen), ein Urlaub, der zu einem Sonderurlaub
  gehört (er geht mit dem Sonderurlaub), ein stundenweiser Zeitausgleich (ein
  Tag — er wird ganz zurückgenommen).

  Verträglich mit der alten App: eine neue Spalte mit Vorgabe, eine neue
  Funktion. Altdaten bleiben, wie sie sind; `aenderungen` beginnt leer.
*/

alter table public.vacations
  add column if not exists aenderungen jsonb not null default '[]'::jsonb;

comment on column public.vacations.aenderungen is
  'Verlauf der Änderungen nach der Genehmigung (Z1): je Eintrag {art, am, von, grund, vorher, nachher, gestrichen, entfernt, aus}. Nur über urlaub_kuerzen.';

/*
  DIE SPALTE SCHREIBT NUR DIE DATENBANK — wie `krank_tage`. Wer sie selbst
  setzen könnte, schriebe sich einen Verlauf, den es nie gab.
*/
create or replace function app.urlaub_aenderungen_fest() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.aenderungen is distinct from '[]'::jsonb)
     or (tg_op = 'UPDATE' and new.aenderungen is distinct from old.aenderungen) then
    raise exception 'Der Verlauf eines Antrags entsteht nur über die Datenbank'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.urlaub_aenderungen_fest() from public, anon, authenticated;

drop trigger if exists vacations_aenderungen_fest on public.vacations;
create trigger vacations_aenderungen_fest before insert or update on public.vacations
  for each row execute function app.urlaub_aenderungen_fest();

create or replace function public.urlaub_kuerzen(
  p_antrag uuid,
  p_von date,
  p_bis date,
  p_streichen date[] default '{}',
  p_grund text default '',
  p_name text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  a public.vacations;
  arbeitstage smallint[];
  begruendung text := btrim(coalesce(p_grund, ''));
  streichen date[] := coalesce(p_streichen, '{}');
  wer_name text;
  teile jsonb;
  teil jsonb;
  n integer;
  entfernt integer := 0;
  weg_anteil numeric := 0;
  neue_tage numeric := 0;
  teil_tage numeric;
  neu_id uuid;
  ids uuid[] := '{}';
  eintrag jsonb;
  t date;
begin
  if betrieb is null or wer is null or not app.angemeldet() then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if p_von is null or p_bis is null or p_von > p_bis then
    raise exception 'Bitte einen gültigen Zeitraum angeben' using errcode = '22023';
  end if;
  if length(begruendung) < 3 then
    raise exception 'Bitte einen Grund angeben' using errcode = '22023';
  end if;
  if not app.darf_urlaub_entscheiden(betrieb) then
    raise exception 'Keine Berechtigung, Urlaub zu ändern' using errcode = '42501';
  end if;

  -- Gesperrt wie beim Entscheiden: zwei gleichzeitige Änderungen laufen nacheinander.
  select * into a from public.vacations where id = p_antrag for update;
  if a.id is null or a.company_id is distinct from betrieb then
    raise exception 'Diesen Antrag gibt es nicht' using errcode = 'P0002';
  end if;
  if a.status <> 'Genehmigt' then
    raise exception 'Gekürzt wird nur ein genehmigter Antrag' using errcode = '55000';
  end if;
  if a.betriebsurlaub_id is not null then
    raise exception 'Dieser Urlaub gehört zum Betriebsurlaub — geändert wird er im Reiter „Betriebsurlaub“'
      using errcode = '55000';
  end if;
  if exists (select 1 from public.freistellungen f
              where f.ueber_urlaub_id = a.id or f.ablehnung_za_id = a.id) then
    raise exception 'Dieser Antrag gehört zu einem Sonderurlaub oder Arztbesuch — er ändert sich mit ihm'
      using errcode = '55000';
  end if;
  if a.za_von is not null then
    raise exception 'Ein stundenweiser Zeitausgleich wird nicht gekürzt, sondern ganz zurückgenommen'
      using errcode = '55000';
  end if;
  /*
    VIER AUGEN wie beim Zurücknehmen (`app.urlaub_vier_augen`): den eigenen
    genehmigten Urlaub ändert jemand anderer — außer es gibt niemanden sonst.
  */
  if a.user_id = wer and app.entscheidet_jemand_anderer(betrieb, a.user_id) then
    raise exception 'Den eigenen genehmigten Antrag ändert jemand anderer — hier gilt das Vier-Augen-Prinzip.'
      using errcode = '42501';
  end if;
  if p_von < a.von or p_bis > a.bis then
    raise exception 'Gekürzt wird innerhalb des genehmigten Zeitraums (% – %)',
      to_char(a.von, 'DD.MM.YYYY'), to_char(a.bis, 'DD.MM.YYYY')
      using errcode = '22023';
  end if;

  select u.work_days into arbeitstage from public.users u where u.id = a.user_id;
  select coalesce(nullif(btrim(p_name), ''), (select u.name from public.users u where u.id = wer), 'Leitung')
    into wer_name;

  foreach t in array streichen loop
    if t < p_von or t > p_bis then
      raise exception 'Der gestrichene Tag % liegt nicht im Zeitraum', to_char(t, 'DD.MM.YYYY')
        using errcode = '22023';
    end if;
    if coalesce(array_length(app.urlaubstage(arbeitstage, t, t), 1), 0) = 0 then
      raise exception 'Der % ist kein Urlaubstag — gestrichen wird ein Arbeitstag', to_char(t, 'DD.MM.YYYY')
        using errcode = '22023';
    end if;
  end loop;

  /*
    DIE TEILE, DIE BLEIBEN: zusammenhängende Kalendertage im neuen Zeitraum
    ohne die gestrichenen; ein Teil ohne Arbeitstag (nur ein Wochenende)
    fällt weg.
  */
  with tage as (
    select d::date as tag
      from generate_series(p_von, p_bis, interval '1 day') d
     where not (d::date = any (streichen))
  ), laeufe as (
    select tag, tag - (row_number() over (order by tag))::integer as lauf from tage
  ), stuecke as (
    select min(tag) as von, max(tag) as bis from laeufe group by lauf
  )
  select coalesce(jsonb_agg(jsonb_build_object('von', s.von, 'bis', s.bis) order by s.von), '[]'::jsonb)
    into teile
    from stuecke s
   where coalesce(array_length(app.urlaubstage(arbeitstage, s.von, s.bis), 1), 0) > 0;

  n := jsonb_array_length(teile);
  if n = 0 then
    raise exception 'Nach dem Kürzen bliebe kein Arbeitstag — dann bitte ganz zurücknehmen'
      using errcode = '22023';
  end if;
  if n = 1 and (teile -> 0 ->> 'von')::date = a.von and (teile -> 0 ->> 'bis')::date = a.bis then
    raise exception 'Der Zeitraum ist unverändert — es gibt nichts zu kürzen' using errcode = '22023';
  end if;

  -- Die Tage im Zeitkonto, die nicht mehr in einem Teil liegen.
  with weg as (
    delete from public.time_entries e
     where e.company_id = betrieb and e.vacation_id = a.id
       and not exists (
         select 1 from jsonb_array_elements(teile) x
          where e.date between (x ->> 'von')::date and (x ->> 'bis')::date)
    returning e.date, e.status
  )
  select count(*), coalesce(sum(case when w.status = 'Urlaub' then app.tagesanteil(betrieb, w.date) else 0 end), 0)
    into entfernt, weg_anteil
    from weg w;

  eintrag := jsonb_build_object(
    'art', 'gekuerzt',
    'am', now(),
    'von', wer_name,
    'grund', begruendung,
    'vorher', jsonb_build_object('von', a.von, 'bis', a.bis, 'tage', a.tage),
    'nachher', teile,
    'gestrichen', to_jsonb(streichen),
    'entfernt', entfernt);

  -- Jeder weitere Teil wird ein eigener genehmigter Antrag; seine Tage ziehen mit.
  for i in 1 .. n - 1 loop
    teil := teile -> i;
    neu_id := gen_random_uuid();
    teil_tage := case when a.art = 'Urlaub'
      then (select coalesce(sum(app.tagesanteil(betrieb, e.date)), 0) from public.time_entries e
             where e.company_id = betrieb and e.vacation_id = a.id and e.status = 'Urlaub'
               and e.date between (teil ->> 'von')::date and (teil ->> 'bis')::date)
      else coalesce(array_length(app.urlaubstage(arbeitstage, (teil ->> 'von')::date, (teil ->> 'bis')::date), 1), 0) end;
    insert into public.vacations (
      id, company_id, user_id, user_name, von, bis, tage, status, notiz, art,
      entschieden_von_uid, entschieden_von_name, entschieden_am, grund, created_at,
      saldo_bei_antrag, krank_tage, aenderungen)
    values (
      neu_id, betrieb, a.user_id, a.user_name, (teil ->> 'von')::date, (teil ->> 'bis')::date, teil_tage,
      'Genehmigt', a.notiz, a.art,
      -- Die Genehmigung des Ganzen gilt für den Teil (`app.urlaub_genehmigt_zeit` übernimmt sie).
      a.entschieden_von_uid, a.entschieden_von_name, a.entschieden_am, a.grund, a.created_at,
      a.saldo_bei_antrag,
      (select coalesce(jsonb_agg(el), '[]'::jsonb) from jsonb_array_elements(a.krank_tage) el
        where (el ->> 'tag')::date between (teil ->> 'von')::date and (teil ->> 'bis')::date),
      a.aenderungen || jsonb_build_array(eintrag || jsonb_build_object('aus', a.id)));
    update public.time_entries e
       set vacation_id = neu_id
     where e.company_id = betrieb and e.vacation_id = a.id
       and e.date between (teil ->> 'von')::date and (teil ->> 'bis')::date;
    neue_tage := neue_tage + teil_tage;
    ids := ids || neu_id;
  end loop;

  teil := teile -> 0;
  update public.vacations
     set von = (teil ->> 'von')::date,
         bis = (teil ->> 'bis')::date,
         tage = case when a.art = 'Urlaub'
                     then greatest(0, coalesce(a.tage, 0) - weg_anteil - neue_tage)
                     else coalesce(array_length(app.urlaubstage(arbeitstage, (teil ->> 'von')::date, (teil ->> 'bis')::date), 1), 0) end,
         krank_tage = (select coalesce(jsonb_agg(el), '[]'::jsonb) from jsonb_array_elements(a.krank_tage) el
                        where (el ->> 'tag')::date between (teil ->> 'von')::date and (teil ->> 'bis')::date),
         aenderungen = a.aenderungen || jsonb_build_array(eintrag)
   where id = a.id
   returning * into a;

  -- Die Person erfährt es wie beim Zurücknehmen — außer sie hat es selbst getan.
  if a.user_id is distinct from wer then
    perform app.push_anstossen(jsonb_build_object(
      'quelle', 'abwesenheit', 'art', 'gekuerzt', 'zeile', to_jsonb(a)));
  end if;

  return jsonb_build_object(
    'entfernt', entfernt,
    'teile', n,
    'antraege', to_jsonb(array[a.id] || ids));
end;
$$;

revoke all on function public.urlaub_kuerzen(uuid, date, date, date[], text, text) from public, anon;
grant execute on function public.urlaub_kuerzen(uuid, date, date, date[], text, text) to authenticated;
