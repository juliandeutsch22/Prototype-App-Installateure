/*
  ABWESENHEITEN UND KORREKTUREN OHNE UMWEG (Befunde 09.11.2026).

  1. KORREKTURANTRAG. `zeit_korrektur_entscheiden` schreibt als Eigentümer
     der Funktion; die Wächter an `time_entries` (Urlaub, Krank, Sonderurlaub,
     Berufsschule nur über ihren Vorgang, Zeitausgleich mit vier Augen)
     greifen dort nicht. Mit einer Korrektur wurde so aus Anwesenheit
     Urlaub ohne Antrag, aus dem eigenen Tag ein Zeitausgleich ohne zweite
     Person, und ein Urlaubstag zu Arbeit, während der Antrag ihn weiter
     zählte. Jetzt gilt in der Funktion dieselbe Grenze wie in der Maske
     (Zeitkorrekturen.tsx): geändert wird nur Arbeitszeit und stundenweiser
     Zeitausgleich, der Stand bleibt, und der eigene Zeitausgleich braucht
     jemand anderen. Verrechnet, aus einem Antrag oder einer Meldung bleibt
     dem ursprünglichen Vorgang; danach bestätigt das Büro die durchgeführte
     Korrektur wie bisher. Das Beantragen bleibt für jede eigene Buchung
     offen: es ändert nichts, und genau für die gesperrten Tage gibt es den
     Antrag (die Maske bietet ihn dort an).

  2. EIGENER GENEHMIGTER URLAUB. Zurücknehmen ist eine Entscheidung über den
     eigenen Antrag wie Genehmigen — auch hier entscheidet jemand anderer,
     wenn es ihn gibt. Einen offenen Antrag zieht man weiter selbst zurück.

  3. STUNDENWEISER SONDERURLAUB ÜBER GEARBEITETER ZEIT. Die Bestätigung
     sah nur Ganztägiges und andere Freistellungen; Arbeitszeit zur selben
     Uhrzeit zählte doppelt. Jetzt belegt sie den Tag (außer beim
     Arztbesuch, der nur den Rest zur Sollzeit anrechnet), und die
     Datenbank lehnt Arbeitszeit über einem stundenweisen Zeitausgleich oder
     einer stundenweisen Freistellung ab — dieselbe Regel wie die Maske
     (`buchungKonflikt`). Bestehende Buchungen bleiben, wie sie sind; geprüft
     wird, wenn sich die Zeit ändert.
*/

-- ---------------------------------------------------------------------------
-- 1. Korrekturantrag entscheiden (Rumpf wie in 20261108600000_zeitkorrekturen.sql)
-- ---------------------------------------------------------------------------
create or replace function public.zeit_korrektur_entscheiden(p_id uuid,p_stand text,p_grund text,p_eintrag jsonb default null,p_geaendert_am timestamptz default null) returns void
 language plpgsql security definer set search_path='' as $$
declare a public.zeitkorrekturen; e public.time_entries; v public.time_entries; stand_daten jsonb;
  ohne text[]:=array['updated_at','created_at','last_edited_by','last_edited_by_uid','hours','satz','zeitfelder','zeitfeld_fassung','is_billed','invoice_number','ins_budget'];
begin
 select * into a from public.zeitkorrekturen where id=p_id for update;
 if a.id is null or not app.betriebsmitglied(a.company_id) then raise exception 'Dieser Antrag gehört einem anderen Betrieb' using errcode='42501'; end if;
 if p_stand='zurueckgezogen' then
   if a.user_id<>auth.uid() then raise exception 'Nur die antragstellende Person zieht den Antrag zurück' using errcode='42501'; end if;
 elsif not app.hat_rolle(array['Buchhaltung','Geschäftsführung','Administrator']) then raise exception 'Korrekturen prüft das Büro' using errcode='42501'; end if;
 if p_stand not in ('zurueckgezogen','abgelehnt','umgesetzt') or nullif(btrim(p_grund),'') is null then raise exception 'Bitte die Entscheidung begründen' using errcode='22023'; end if;
 if a.stand<>'offen' then
   if a.stand=p_stand and a.entscheidung=btrim(p_grund) then return; end if;
   raise exception 'Der Antrag wurde inzwischen entschieden. Bitte aktualisieren.' using errcode='22023';
 end if;
 if p_stand='umgesetzt' then
   select * into e from public.time_entries where id=a.eintrag_id for update;
   if e.id is null then
     if p_eintrag is not null or not exists(select 1 from public.zeitbuchung_verlauf journal where journal.eintrag_id=a.eintrag_id and journal.company_id=a.company_id and journal.art='geloescht' and journal.am>=a.angelegt_am) then
       raise exception 'Die ursprüngliche Buchung fehlt; eine protokollierte Korrektur ist nicht nachgewiesen' using errcode='22023';
     end if;
   else
   stand_daten:=to_jsonb(e) || jsonb_build_object('freie_angaben',(select coalesce(jsonb_object_agg(w.feld_id::text,w.wert),'{}'::jsonb) from public.zeitbuchung_feldwerte w where w.eintrag_id=e.id));
   if p_eintrag is not null then
     if (p_geaendert_am is not null and e.updated_at is distinct from p_geaendert_am)
        or (p_geaendert_am is null and stand_daten-ohne <> a.vorher-ohne) then
       raise exception 'Die Buchung hat sich inzwischen geändert. Bitte neu öffnen und prüfen.' using errcode='22023';
     end if;
     /*
       DIE GRENZE DER MASKE, HIER VERBINDLICH: Die Wächter an time_entries
       sehen diesen Aufruf nicht (er schreibt als Eigentümer). Was aus einem
       Antrag, einer Meldung, der Berufsschule oder einer Rechnung stammt,
       ändert sich nur dort.
     */
     if e.is_billed or e.vacation_id is not null or e.krankmeldung_id is not null or e.freistellung_id is not null
        or e.status not in ('Anwesend','Zeitausgleich') then
       raise exception 'Diese Buchung ist verrechnet oder stammt aus einem Antrag, einer Krankmeldung oder der Berufsschule — sie wird dort berichtigt. Danach die durchgeführte Korrektur bestätigen.' using errcode='42501';
     end if;
     v:=jsonb_populate_record(e,p_eintrag);
     -- Der Stand wechselt nur im ursprünglichen Vorgang (wie die Maske, TimeForm `speichernMit`).
     if v.status is distinct from e.status then
       raise exception 'Den Stand bitte am ursprünglichen Vorgang ändern und die Korrektur anschließend bestätigen.' using errcode='22023';
     end if;
     -- Dieselbe Regel wie app.zeitausgleich_vier_augen.
     if v.status='Zeitausgleich' and e.user_id=auth.uid()
        and (v.date is distinct from e.date or v.start_time is distinct from e.start_time or v.end_time is distinct from e.end_time)
        and app.entscheidet_jemand_anderer(e.company_id,e.user_id) then
       raise exception 'Über den eigenen Zeitausgleich entscheidet jemand anderer (Vier-Augen-Prinzip).' using errcode='42501';
     end if;
     -- Keine Freigabe von Rechnung, Antrag oder Identität durch JSON.
     update public.time_entries set date=v.date,status=v.status,start_time=v.start_time,end_time=v.end_time,
       break_duration=v.break_duration,travel_time=v.travel_time,project_number=v.project_number,customer_name=v.customer_name,
       helper_name=v.helper_name,vehicle_plate=v.vehicle_plate,comment=v.comment,is_helper=v.is_helper,is_emergency=v.is_emergency,
       is_night_work=v.is_night_work,nacht_abgewaehlt=v.nacht_abgewaehlt,zeitfelder=v.zeitfelder,
       last_edited_by=(select name from public.users where id=auth.uid()),last_edited_by_uid=auth.uid()
       where id=e.id returning * into e;
   end if;
   stand_daten:=to_jsonb(e) || jsonb_build_object('freie_angaben',(select coalesce(jsonb_object_agg(w.feld_id::text,w.wert),'{}'::jsonb) from public.zeitbuchung_feldwerte w where w.eintrag_id=e.id));
   if stand_daten-ohne = a.vorher-ohne then raise exception 'Die gewünschte Korrektur muss zuerst an der Buchung oder ihrem Ursprung durchgeführt werden' using errcode='22023'; end if;
   end if;
 end if;
 update public.zeitkorrekturen set stand=p_stand,entscheidung=btrim(p_grund),entschieden_von=auth.uid(),entschieden_am=now() where id=p_id;
end $$;
revoke all on function public.zeit_korrektur_entscheiden(uuid,text,text,jsonb,timestamptz) from public,anon;
grant execute on function public.zeit_korrektur_entscheiden(uuid,text,text,jsonb,timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Vier Augen auch beim Zurücknehmen (Rumpf wie in 20260926112000_vier_augen_ohne_umweg.sql)
-- ---------------------------------------------------------------------------
create or replace function app.urlaub_vier_augen() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() or auth.uid() is null then
    return new;
  end if;

  if new.betriebsurlaub_id is not null then
    if tg_op = 'INSERT'
       and new.user_id = auth.uid()
       and new.status = 'Genehmigt'
       and app.entscheidet_jemand_anderer(new.company_id, new.user_id)
       and not app.betriebsurlaub_trifft_andere(new.betriebsurlaub_id, new.user_id) then
      raise exception 'Ein Betriebsurlaub, der nur dich selbst trifft, ist ein eigener Urlaub — darüber entscheidet jemand anderer (Vier-Augen-Prinzip).'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.user_id = auth.uid()
     and new.status in ('Genehmigt', 'Abgelehnt')
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and app.entscheidet_jemand_anderer(new.company_id, new.user_id) then
    raise exception 'Über den eigenen Antrag entscheidet jemand anderer — hier gilt das Vier-Augen-Prinzip.'
      using errcode = '42501';
  end if;

  /*
    ZURÜCKNEHMEN IST AUCH EINE ENTSCHEIDUNG. Sonst gäbe die Person, die sich
    Urlaub nicht selbst genehmigen darf, ihn sich durch Zurücknehmen selbst
    zurück — und der gearbeitete Ersatztag stünde ohne zweite Person im
    Konto. Den noch offenen Antrag zieht sie weiter selbst zurück.
  */
  if tg_op = 'UPDATE'
     and new.user_id = auth.uid()
     and old.status = 'Genehmigt'
     and new.status = 'Storniert'
     and app.entscheidet_jemand_anderer(new.company_id, new.user_id) then
    raise exception 'Den eigenen genehmigten Antrag nimmt jemand anderer zurück — hier gilt das Vier-Augen-Prinzip.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
-- Ein Wächter, kein Aufruf: niemand ruft ihn direkt.
revoke all on function app.urlaub_vier_augen() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3a. Bestätigen: Arbeitszeit zur selben Uhrzeit belegt den Tag
--     (Rumpf wie in 20261102100000_arztbesuch.sql; geändert: die Auswahl der
--     freien Tage beim stundenweisen Antrag und deren Meldung)
-- ---------------------------------------------------------------------------
create or replace function public.freistellung_entscheiden(p_id uuid, p_entscheidung text, p_grund text DEFAULT ''::text, p_nachweis_geprueft boolean DEFAULT false, p_kuerzung jsonb DEFAULT NULL::jsonb, p_ueber_kontingent text DEFAULT NULL::text, p_ueber_grund text DEFAULT NULL::text, p_angerechnet_min numeric DEFAULT NULL::numeric, p_anrechnung_grund text DEFAULT NULL::text, p_ablehnung_folge text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  wer_name text;
  f public.freistellungen;
  person public.users;
  begruendung text := btrim(coalesce(p_grund, ''));
  ueber_begruendung text := btrim(coalesce(p_ueber_grund, ''));
  anrechnung_begruendung text := btrim(coalesce(p_anrechnung_grund, ''));
  tage date[];
  offen date[] := '{}';
  sonder date[] := '{}';
  als_urlaub date[] := '{}';
  entfernt integer := 0;
  alter_pfad text;
  teilung boolean := false;
  gutgeschrieben numeric := null;
  tagesstatus text;
  k jsonb;
  kontingent numeric;
  schon numeric := 0;
  ueber integer := 0;
  urlaub_id uuid := null;
  wahl text := null;
  arzt boolean;
  termin integer;
  vorschlag integer;
  angerechnet integer := null;
  folge text := null;
  za_id uuid := null;
  nachweis_verlangt boolean;
begin
  if betrieb is null or wer is null or not app.angemeldet()
     or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if p_entscheidung is null or p_entscheidung not in ('Bestätigt', 'Abgelehnt', 'Storniert') then
    raise exception 'Unbekannte Entscheidung: %', p_entscheidung using errcode = '22023';
  end if;
  if p_entscheidung in ('Abgelehnt', 'Storniert') and length(begruendung) < 3 then
    raise exception 'Bitte einen Grund angeben' using errcode = '22023';
  end if;
  if p_ueber_kontingent is not null and p_ueber_kontingent not in ('urlaub', 'sonderurlaub') then
    raise exception 'Unbekannte Wahl für die Tage über dem Kontingent: %', p_ueber_kontingent using errcode = '22023';
  end if;
  if p_ablehnung_folge is not null and p_ablehnung_folge not in ('zeitausgleich', 'keine') then
    raise exception 'Unbekannte Folge der Ablehnung: %', p_ablehnung_folge using errcode = '22023';
  end if;

  select * into f from public.freistellungen where id = p_id for update;
  if f.id is null or f.company_id is distinct from betrieb then
    raise exception 'Diesen Antrag gibt es nicht' using errcode = 'P0002';
  end if;
  arzt := f.anlass is not distinct from 'arztbesuch';
  if not app.darf_freistellung_entscheiden(f.art) then
    raise exception '%', case when f.art = 'unbezahlt'
      then 'Über unbezahlten Urlaub entscheiden Geschäftsführung oder Administration'
      else 'Sonderurlaub bestätigen Büro, Geschäftsführung oder Administration' end
      using errcode = '42501';
  end if;
  if not arzt and (p_angerechnet_min is not null or p_ablehnung_folge is not null) then
    raise exception 'Angerechnete Zeit und Folge der Ablehnung gibt es nur beim Arztbesuch' using errcode = '22023';
  end if;
  if p_ablehnung_folge is not null and p_entscheidung <> 'Abgelehnt' then
    raise exception 'Eine Folge gibt es nur beim Ablehnen' using errcode = '22023';
  end if;
  if p_angerechnet_min is not null and p_entscheidung <> 'Bestätigt' then
    raise exception 'Angerechnet wird nur beim Bestätigen' using errcode = '22023';
  end if;
  /*
    VIER AUGEN wie beim Urlaub: über den eigenen Antrag entscheidet jemand
    anderer — außer es gibt niemanden sonst, der darf.
  */
  if f.user_id = wer and exists (
       select 1 from public.users u
        where u.company_id = betrieb and u.id <> wer and u.active is not false
          and u.role = any(case when f.art = 'unbezahlt'
                                then array['Geschäftsführung', 'Administrator']
                                else array['Buchhaltung', 'Geschäftsführung', 'Administrator'] end)) then
    raise exception 'Über den eigenen Antrag entscheidet jemand anderer' using errcode = '42501';
  end if;

  select u.name into wer_name from public.users u where u.id = wer;
  select * into person from public.users where id = f.user_id;

  if p_entscheidung = 'Storniert' then
    if f.status <> 'Bestätigt' then
      raise exception 'Nur ein bestätigter Antrag wird zurückgenommen' using errcode = '55000';
    end if;
    /*
      Mit dem Sonderurlaub geht ein genehmigter Urlaub zurück — das darf, wer
      über Urlaub entscheidet (dieselbe Grenze wie `urlaub_entscheiden`;
      der Wächter an `vacations` hielte es sonst mitten im Ablauf auf).
    */
    if f.ueber_urlaub_id is not null and not app.darf_urlaub_entscheiden(betrieb) then
      raise exception 'Zu diesem Sonderurlaub gehört Urlaub für die Tage über dem Kontingent — zurücknehmen darf ihn, wer über Urlaub entscheidet'
        using errcode = '42501';
    end if;
    delete from public.time_entries where company_id = betrieb and freistellung_id = p_id;
    get diagnostics entfernt = row_count;
    delete from public.urlaubsanspruch_anpassungen where freistellung_id = p_id;
    /*
      DER URLAUB FÜR DIE TAGE DARÜBER GEHT MIT (G17). Seine Tage im
      Zeitkonto tragen auch die Kennung dieses Antrags und sind oben schon
      weg; der Antrag selbst wird zurückgenommen, damit der Resturlaub stimmt.
    */
    if f.ueber_urlaub_id is not null then
      delete from public.time_entries where company_id = betrieb and vacation_id = f.ueber_urlaub_id;
      update public.vacations
         set status = 'Storniert',
             entschieden_von_uid = wer,
             entschieden_von_name = coalesce(wer_name, 'Büro'),
             entschieden_am = now(),
             grund = 'Sonderurlaub zurückgenommen: ' || begruendung
       where id = f.ueber_urlaub_id;
    end if;
  elsif f.status <> 'Beantragt' then
    raise exception 'Über den Antrag ist bereits entschieden' using errcode = '55000';
  end if;

  if p_entscheidung = 'Bestätigt' then
    teilung := f.art = 'dienstverhinderung' and f.anlass not like 'tod\_%' and not arzt and exists (
      select 1 from public.freistellungen x
       where x.company_id = betrieb and x.user_id = f.user_id and x.id <> f.id
         and x.art = 'dienstverhinderung' and x.anlass = f.anlass
         and x.ereignis_datum = f.ereignis_datum and x.status in ('Beantragt', 'Bestätigt'));
    if teilung and not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
      raise exception 'Ein geteilter Sonderurlaub (außer beim Todesfall) braucht die Freigabe durch Geschäftsführung oder Administration'
        using errcode = '42501';
    end if;
    if f.nachweis_pfad is not null and not coalesce(p_nachweis_geprueft, false) then
      raise exception 'Bitte den Nachweis ansehen und „Nachweis geprüft" anhaken' using errcode = '22023';
    end if;
    /*
      ARZTBESUCH MIT NACHWEIS (Einstellung des Betriebs): bestätigt wird nur
      mit geprüfter Bestätigung — als Datei oder auf Papier gezeigt.
    */
    if arzt then
      select c.arztbesuch_nachweis into nachweis_verlangt from public.companies c where c.id = betrieb;
      if coalesce(nachweis_verlangt, true) and not coalesce(p_nachweis_geprueft, false) then
        raise exception 'Der Betrieb verlangt für Arztbesuche eine Bestätigung. Bitte die Arztbestätigung ansehen (Datei oder Papier) und „Nachweis geprüft" anhaken'
          using errcode = '22023';
      end if;
    end if;

    tage := app.urlaubstage(person.work_days, f.von, f.bis);
    if f.zeit_von is not null then
      /*
        STUNDENWEISE: frei ist der Tag, solange nichts Ganztägiges darauf
        steht und kein anderer stundenweiser Eintrag die Uhrzeit überschneidet.
        Gearbeitete Zeit daneben ist der Normalfall.
      */
      select coalesce(array_agg(t order by t), '{}') into offen
        from unnest(tage) t
       where not exists (
         select 1 from public.time_entries e
          where e.company_id = betrieb and e.user_id = f.user_id and e.date = t
            and (app.ist_ganztags(e.status, e.start_time, e.end_time)
                 or (e.status in ('Zeitausgleich', 'Dienstverhinderung', 'Pflegefreistellung')
                     and e.start_time < f.zeit_bis and e.end_time > f.zeit_von)))
         /*
           GEARBEITETE ZEIT ZUR SELBEN UHRZEIT belegt den Tag wie etwas
           Ganztägiges (Befund 09.11.2026): sonst zählte die Stunde doppelt,
           als Arbeit und als bezahlte Freistellung. Auch die Nachtschicht vom
           Vortag, die in den Termin reicht. Der Arztbesuch bleibt, wie er
           ist: dort rechnet der Vorschlag nur den Rest zur Sollzeit an.
         */
         and (arzt or not exists (
           select 1 from public.time_entries e
            where e.company_id = betrieb and e.user_id = f.user_id
              and e.date between t - 1 and t
              and e.status = 'Anwesend'
              and app.arbeitsspanne(e.date, e.start_time, e.end_time)
                  && tsrange(t + f.zeit_von, t + f.zeit_bis)));
    else
      select coalesce(array_agg(t order by t), '{}') into offen
        from unnest(tage) t
       where not exists (
         select 1 from public.time_entries e
          where e.company_id = betrieb and e.user_id = f.user_id and e.date = t);
    end if;
    if coalesce(array_length(offen, 1), 0) = 0 then
      raise exception '%', case when arzt
        then 'Am ' || to_char(f.von, 'DD.MM.YYYY') || ' steht schon etwas Ganztägiges oder ein Eintrag zur selben Uhrzeit — es gibt nichts zu bestätigen'
        when f.zeit_von is not null
        then 'Am ' || to_char(f.von, 'DD.MM.YYYY') || ' steht schon etwas Ganztägiges oder ein Eintrag zur selben Uhrzeit (auch gebuchte Arbeitszeit) — es gibt nichts zu bestätigen. Bitte die Zeit dort anpassen oder den Antrag ablehnen'
        else 'Im Zeitraum ist jeder Arbeitstag schon gebucht — es gibt nichts zu bestätigen' end
        using errcode = '55000';
    end if;

    /*
      ARZTBESUCH: ANGERECHNET WIRD HÖCHSTENS DER REST ZUR SOLLZEIT. Bezahlt
      ist nur Zeit, die gearbeitet worden wäre. Der Vorschlag kommt aus der
      Datenbank; eine Abweichung braucht einen Grund, höchstens der Termin.
    */
    if arzt then
      termin := (extract(epoch from (f.zeit_bis - f.zeit_von)) / 60)::integer;
      vorschlag := least(termin, floor(app.sollrest_minuten(person, f.von, f.id))::integer);
      angerechnet := coalesce(round(p_angerechnet_min)::integer, vorschlag);
      if angerechnet <= 0 then
        raise exception 'Am % ist die Sollzeit schon mit Arbeit erfüllt — es bleibt nichts anzurechnen. Ablehnen oder die angerechnete Zeit mit Grund angeben.',
          to_char(f.von, 'DD.MM.YYYY')
          using errcode = '22023';
      end if;
      if angerechnet > termin then
        raise exception 'Angerechnet werden höchstens die % Minuten des Termins', termin using errcode = '22023';
      end if;
      if angerechnet <> vorschlag and length(anrechnung_begruendung) < 3 then
        raise exception 'Bitte begründen, warum % statt % Minuten angerechnet werden', angerechnet, vorschlag
          using errcode = '22023';
      end if;
    end if;

    /*
      ÜBER DEM KONTINGENT (G17). Nur ganztägiger Sonderurlaub mit fester
      Zahl an Tagen; die stundenweise Vorladung hat „die notwendige Zeit“.
    */
    sonder := offen;
    if f.art = 'dienstverhinderung' and f.zeit_von is null then
      kontingent := app.anlass_kontingent(betrieb, f.anlass);
      if kontingent is not null then
        select count(*) into schon
          from public.time_entries e
          join public.freistellungen x on x.id = e.freistellung_id
         where x.company_id = betrieb and x.user_id = f.user_id and x.id <> f.id
           and x.art = 'dienstverhinderung' and x.anlass = f.anlass
           and x.ereignis_datum = f.ereignis_datum and x.status = 'Bestätigt'
           and e.status = 'Dienstverhinderung';
        ueber := least(array_length(offen, 1),
                       greatest(0, (schon + array_length(offen, 1) - kontingent)::integer));
      end if;
    end if;
    if ueber > 0 then
      if p_ueber_kontingent is null then
        raise exception 'Mehr Tage als vorgesehen (% darüber). Bitte wählen: die Tage darüber als Urlaub buchen oder als Sonderurlaub bestätigen — dann mit Grund.', ueber
          using errcode = '22023';
      end if;
      wahl := p_ueber_kontingent;
      if wahl = 'sonderurlaub' and length(ueber_begruendung) < 3 then
        raise exception 'Bitte begründen, warum die Tage über dem Kontingent als Sonderurlaub gelten' using errcode = '22023';
      end if;
      if wahl = 'urlaub' then
        if not app.darf_urlaub_entscheiden(betrieb) then
          raise exception 'Als Urlaub buchen darf nur, wer über Urlaub entscheidet' using errcode = '42501';
        end if;
        sonder := offen[1:array_length(offen, 1) - ueber];
        als_urlaub := offen[array_length(offen, 1) - ueber + 1:array_length(offen, 1)];
      end if;
    end if;

    tagesstatus := case f.art when 'dienstverhinderung' then 'Dienstverhinderung'
                              when 'pflegefreistellung' then 'Pflegefreistellung'
                              else 'Unbezahlt' end;
    /*
      Beim Arztbesuch trägt der Tag die angerechnete Zeit ab Beginn des
      Termins; der Termin selbst steht am Antrag. „Arztbesuch“ als Vermerk:
      Tage mit Antrag ändert niemand von Hand (`freistellung_nur_ueber_antrag`).
    */
    insert into public.time_entries (
      id, company_id, user_id, date, status, start_time, end_time, break_duration,
      user_name, freistellung_id, comment)
    select gen_random_uuid(), betrieb, f.user_id, t, tagesstatus, f.zeit_von,
           case when arzt then f.zeit_von + make_interval(mins => angerechnet) else f.zeit_bis end, 0,
           f.user_name, p_id,
           case when arzt then 'Arztbesuch'
                when f.art = 'dienstverhinderung' then 'Sonderurlaub'
                when f.art = 'pflegefreistellung' then 'Pflegefreistellung'
                else 'Unbezahlter Urlaub' end
      from unnest(sonder) t;

    /*
      DIE TAGE DARÜBER ALS URLAUB: ein genehmigter Urlaubsantrag, wie ihn
      `urlaub_entscheiden` hinterlässt — Tage gezählt mit `app.tagesanteil`.
      Die Tage tragen beide Kennungen: den Urlaub für Resturlaub und
      Zeitkonto, den Sonderurlaub für das Zurücknehmen.
    */
    if coalesce(array_length(als_urlaub, 1), 0) > 0 then
      insert into public.vacations (
        company_id, user_id, user_name, von, bis, tage, status, art, notiz,
        entschieden_von_uid, entschieden_von_name, entschieden_am)
      values (betrieb, f.user_id, f.user_name, als_urlaub[1], als_urlaub[array_length(als_urlaub, 1)],
              (select sum(app.tagesanteil(betrieb, t)) from unnest(als_urlaub) t),
              'Genehmigt', 'Urlaub',
              'Sonderurlaub über dem Kontingent (' || to_char(f.von, 'DD.MM.YYYY') || '–' || to_char(f.bis, 'DD.MM.YYYY') || ')',
              wer, coalesce(wer_name, 'Büro'), now())
      returning id into urlaub_id;
      insert into public.time_entries (
        id, company_id, user_id, date, status, start_time, end_time, break_duration,
        user_name, vacation_id, freistellung_id, comment)
      select gen_random_uuid(), betrieb, f.user_id, t, 'Urlaub', null, null, 0,
             f.user_name, urlaub_id, p_id, 'Urlaub (Sonderurlaub über dem Kontingent)'
        from unnest(als_urlaub) t;
    end if;

    -- Was gutgeschrieben ist — so zählt es das Kontingent der Pflegefreistellung.
    if arzt then
      gutgeschrieben := angerechnet;
    else
      select round(sum(case when f.zeit_von is not null
                            then extract(epoch from (f.zeit_bis - f.zeit_von)) / 60
                            else app.tagesanteil(betrieb, t) * app.tagessoll_minuten(person, t) end), 1)
        into gutgeschrieben
        from unnest(sonder) t;
    end if;

    if p_kuerzung is not null and jsonb_typeof(p_kuerzung) = 'array' and jsonb_array_length(p_kuerzung) > 0 then
      if f.art <> 'unbezahlt' then
        raise exception 'Eine Kürzung des Anspruchs gibt es nur beim unbezahlten Urlaub' using errcode = '22023';
      end if;
      for k in select * from jsonb_array_elements(p_kuerzung) loop
        if (k ->> 'urlaubsjahr') is null or (k ->> 'tage') is null
           or (k ->> 'urlaubsjahr')::integer not between extract(year from f.von)::integer - 1 and extract(year from f.bis)::integer
           or (k ->> 'tage')::numeric <= 0 or (k ->> 'tage')::numeric > 366 then
          raise exception 'Die Kürzung passt nicht zum Zeitraum' using errcode = '22023';
        end if;
        insert into public.urlaubsanspruch_anpassungen (
          company_id, user_id, urlaubsjahr, tage, grund, freistellung_id, angelegt_von_uid, angelegt_von_name)
        values (betrieb, f.user_id, (k ->> 'urlaubsjahr')::integer, -round((k ->> 'tage')::numeric, 2),
                'Unbezahlter Urlaub ' || to_char(f.von, 'DD.MM.YYYY') || '–' || to_char(f.bis, 'DD.MM.YYYY'),
                p_id, wer, wer_name);
      end loop;
    end if;
  elsif p_kuerzung is not null and jsonb_typeof(p_kuerzung) = 'array' and jsonb_array_length(p_kuerzung) > 0 then
    raise exception 'Eine Kürzung gibt es nur beim Bestätigen' using errcode = '22023';
  end if;

  /*
    ARZTBESUCH ABGELEHNT: die Folge gleich mit. „zeitausgleich“ bucht die
    Zeit des Termins als genehmigten stundenweisen Zeitausgleich — wie ihn
    `urlaub_entscheiden` hinterlässt; das darf, wer über Urlaub entscheidet.
    „keine“: nichts wird gebucht, die Zeit fehlt im Saldo.
  */
  if p_entscheidung = 'Abgelehnt' and arzt then
    folge := coalesce(p_ablehnung_folge, 'keine');
    if folge = 'zeitausgleich' then
      if not app.darf_urlaub_entscheiden(betrieb) then
        raise exception 'Als Zeitausgleich buchen darf nur, wer über Urlaub entscheidet' using errcode = '42501';
      end if;
      if exists (
           select 1 from public.time_entries e
            where e.company_id = betrieb and e.user_id = f.user_id and e.date = f.von
              and (app.ist_ganztags(e.status, e.start_time, e.end_time)
                   or (e.status in ('Zeitausgleich', 'Dienstverhinderung', 'Pflegefreistellung')
                       and e.start_time < f.zeit_bis and e.end_time > f.zeit_von))) then
        raise exception 'Am % steht schon etwas zur selben Zeit — als Zeitausgleich lässt sich der Termin nicht buchen',
          to_char(f.von, 'DD.MM.YYYY')
          using errcode = '55000';
      end if;
      insert into public.vacations (
        company_id, user_id, user_name, von, bis, tage, status, art, notiz, za_von, za_bis, za_stunden,
        entschieden_von_uid, entschieden_von_name, entschieden_am, grund)
      values (betrieb, f.user_id, f.user_name, f.von, f.von, 1, 'Genehmigt', 'Zeitausgleich',
              'Arztbesuch abgelehnt — als Zeitausgleich gebucht', f.zeit_von, f.zeit_bis,
              round((extract(epoch from (f.zeit_bis - f.zeit_von)) / 3600)::numeric, 2),
              wer, coalesce(wer_name, 'Büro'), now(), begruendung)
      returning id into za_id;
      insert into public.time_entries (
        id, company_id, user_id, date, status, start_time, end_time, break_duration,
        user_name, vacation_id, comment)
      values (gen_random_uuid(), betrieb, f.user_id, f.von, 'Zeitausgleich', f.zeit_von, f.zeit_bis, 0,
              f.user_name, za_id, 'Genehmigter Zeitausgleich (Arztbesuch abgelehnt)');
    end if;
  end if;

  alter_pfad := f.nachweis_pfad;
  update public.freistellungen
     set status = p_entscheidung,
         entschieden_von_uid = wer,
         entschieden_von_name = coalesce(wer_name, 'Büro'),
         entschieden_am = now(),
         grund = case when begruendung = '' then public.freistellungen.grund else begruendung end,
         nachweis_pfad = null,
         nachweis_geprueft_von_name = case when coalesce(p_nachweis_geprueft, false)
                                           then coalesce(wer_name, 'Büro')
                                           else public.freistellungen.nachweis_geprueft_von_name end,
         nachweis_geprueft_am = case when coalesce(p_nachweis_geprueft, false)
                                     then now() else public.freistellungen.nachweis_geprueft_am end,
         teilung_freigegeben = public.freistellungen.teilung_freigegeben or teilung,
         minuten = case when p_entscheidung = 'Bestätigt' then gutgeschrieben
                        when p_entscheidung = 'Storniert' then null
                        else public.freistellungen.minuten end,
         -- Die Wahl bleibt nach dem Zurücknehmen stehen: sie ist Teil der Geschichte des Antrags.
         ueber_kontingent = case when p_entscheidung = 'Bestätigt' then wahl else public.freistellungen.ueber_kontingent end,
         ueber_tage = case when p_entscheidung = 'Bestätigt' and ueber > 0 then ueber else public.freistellungen.ueber_tage end,
         ueber_grund = case when p_entscheidung = 'Bestätigt' and wahl = 'sonderurlaub' then ueber_begruendung
                            else public.freistellungen.ueber_grund end,
         ueber_urlaub_id = case when p_entscheidung = 'Bestätigt' then urlaub_id else public.freistellungen.ueber_urlaub_id end,
         anrechnung_grund = case when p_entscheidung = 'Bestätigt' and arzt and angerechnet <> vorschlag
                                 then anrechnung_begruendung
                                 else public.freistellungen.anrechnung_grund end,
         ablehnung_folge = case when p_entscheidung = 'Abgelehnt' and arzt then folge
                                else public.freistellungen.ablehnung_folge end,
         ablehnung_za_id = case when p_entscheidung = 'Abgelehnt' and arzt then za_id
                                else public.freistellungen.ablehnung_za_id end
   where id = p_id;

  return jsonb_build_object(
    'status', p_entscheidung,
    'angelegt', coalesce(array_length(offen, 1), 0),
    'uebersprungen', coalesce(array_length(tage, 1), 0) - coalesce(array_length(offen, 1), 0),
    'entfernt', entfernt,
    'nachweis', alter_pfad,
    'ueber', ueber,
    'alsUrlaub', coalesce(array_length(als_urlaub, 1), 0),
    'angerechnet', angerechnet,
    'alsZeitausgleich', za_id is not null);
end;
$function$;

revoke all on function public.freistellung_entscheiden(uuid, text, text, boolean, jsonb, text, text, numeric, text, text) from public, anon;
grant execute on function public.freistellung_entscheiden(uuid, text, text, boolean, jsonb, text, text, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3b. Arbeitszeit nicht über stundenweiser freier Zeit
--     (Rumpf wie in 20260925100000_zeiten_ueberschneiden_nicht.sql)
-- ---------------------------------------------------------------------------
create or replace function app.zeiten_ueberschneiden_nicht() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  spanne tsrange;
  andere record;
begin
  if app.ist_dienst() then
    return new;
  end if;
  if new.status <> 'Anwesend' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.user_id is not distinct from old.user_id
     and new.date is not distinct from old.date
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and new.status is not distinct from old.status then
    return new;
  end if;

  spanne := app.arbeitsspanne(new.date, new.start_time, new.end_time);
  if spanne is null then
    return new;
  end if;

  -- Ein Tag davor und danach: eine Nachtschicht vom Vortag reicht in diesen
  -- Tag hinein, und diese kann in den nächsten reichen.
  select t.date, t.start_time, t.end_time, t.project_number
    into andere
    from public.time_entries t
   where t.company_id = new.company_id
     and t.user_id = new.user_id
     and t.id <> new.id
     and t.status = 'Anwesend'
     and t.date between new.date - 1 and new.date + 1
     and app.arbeitsspanne(t.date, t.start_time, t.end_time) && spanne
   order by t.date, t.start_time
   limit 1;

  if found then
    raise exception 'Die Zeit überschneidet sich mit %–% am %. Zwei Zeiten zur selben Stunde zählen doppelt — bitte eine davon anpassen.',
      to_char(andere.start_time, 'HH24:MI'),
      to_char(andere.end_time, 'HH24:MI'),
      to_char(andere.date, 'DD.MM.YYYY')
        || coalesce(' (' || nullif(andere.project_number, '') || ')', '')
      using errcode = '23P01';
  end if;

  /*
    FREIE ZEIT ZUR SELBEN STUNDE (Befund 09.11.2026): stundenweiser
    Zeitausgleich, Sonderurlaub oder Pflegefreistellung. Die Maske lehnt es
    ab (`buchungKonflikt`); hier gilt es für jeden Schreiber. Ganztägiges hat
    keine Spanne — das regelt `app.ganzer_tag_allein`.
  */
  select t.status, t.date, t.start_time, t.end_time
    into andere
    from public.time_entries t
   where t.company_id = new.company_id
     and t.user_id = new.user_id
     and t.id <> new.id
     and t.status in ('Zeitausgleich', 'Dienstverhinderung', 'Pflegefreistellung')
     and t.date between new.date - 1 and new.date + 1
     and app.arbeitsspanne(t.date, t.start_time, t.end_time) && spanne
   order by t.date, t.start_time
   limit 1;

  if found then
    raise exception 'Die Zeit überschneidet sich mit % %–% am % — in freier Zeit wird nicht gearbeitet. Bitte die Arbeitszeit anpassen.',
      case andere.status when 'Zeitausgleich' then 'dem Zeitausgleich'
                         when 'Pflegefreistellung' then 'der Pflegefreistellung'
                         else 'der Freistellung' end,
      to_char(andere.start_time, 'HH24:MI'),
      to_char(andere.end_time, 'HH24:MI'),
      to_char(andere.date, 'DD.MM.YYYY')
      using errcode = '23P01';
  end if;
  return new;
end;
$$;
revoke all on function app.zeiten_ueberschneiden_nicht() from public, anon, authenticated;
