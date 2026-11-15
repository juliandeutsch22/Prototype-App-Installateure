/*
  ANSPRECHPARTNER, DRINGLICHKEIT UND WUNSCHTERMIN GEHEN MIT
  (Durchsicht 15.11.2026, A8).

  WAS DIE DURCHSICHT FAND. Der Eingang hält fest, wer vor Ort aufmacht
  („Frau Huber, Top 5, 0664 …“), wie eilig es ist und wann der Kunde es
  wünscht. Über „Eingang → Baustelle“ kam nur der Ansprechpartner mit,
  Dringlichkeit und Wunschtermin nicht; über „Eingang → Angebot → Annahme“
  ging alles verloren — die Baustelle trug Ansprechpartner und Telefon der
  Hausverwaltung, der Monteur hatte die Mieterin nicht in der Akte.

  WAS JETZT GILT.
  1. Das Angebot hat eigene Felder dafür (`ansprechpartner_name`,
     `ansprechpartner_telefon`, `dringlichkeit`, `wunschtermin`) — gefüllt aus
     dem Eingang, änderbar im Formular, auch nach dem Versand: sie stehen
     nicht auf dem Angebot beim Kunden, sie sind Arbeitsangaben des Betriebs
     (wie Liegenschaft und Top).
  2. Die Baustelle hat `dringlichkeit` und `wunschtermin`. Beide Wege dorthin
     füllen sie: direkt aus dem Eingang und über die Annahme des Angebots.
     Bei der Annahme gilt der Ansprechpartner des Angebots vor dem des
     Kunden.
  3. Datenschutz: Ansprechpartner und Telefon am Angebot sind Angaben zu
     einer Person beim Kunden. Die Datenauskunft des Kunden enthält sie
     (sie gibt das ganze Angebot aus); bleibt das Angebot bei einer Löschung
     zur Aufbewahrung, werden sie geleert — wie an der Baustelle — und im
     Änderungsjournal entfernt.

  ALTDATEN. Nichts wird umgeschrieben: bestehende Angebote und Baustellen
  haben die Felder leer. Die alte App kennt sie nicht und schickt sie nicht;
  `angebot_speichern` behält Signatur und Verhalten.
*/

alter table public.quotes
  add column if not exists ansprechpartner_name text,
  add column if not exists ansprechpartner_telefon text,
  add column if not exists dringlichkeit text,
  add column if not exists wunschtermin date;
alter table public.projects
  add column if not exists dringlichkeit text,
  add column if not exists wunschtermin date;

alter table public.quotes drop constraint if exists quotes_dringlichkeit;
alter table public.quotes add constraint quotes_dringlichkeit
  check (dringlichkeit is null or dringlichkeit in ('normal', 'dringend', 'notfall'));
alter table public.projects drop constraint if exists projects_dringlichkeit;
alter table public.projects add constraint projects_dringlichkeit
  check (dringlichkeit is null or dringlichkeit in ('normal', 'dringend', 'notfall'));

comment on column public.quotes.ansprechpartner_name is
  'Wer vor Ort aufmacht (aus dem Eingang oder von Hand) — geht bei der Annahme an die Baustelle (A8).';
comment on column public.projects.dringlichkeit is
  'Aus dem Eingang, direkt oder über das Angebot (A8): normal, dringend oder notfall; leer = nicht angegeben.';

-- ---------------------------------------------------------------------------
-- Angebot speichern: dieselbe Funktion, die vier Felder dazu
-- ---------------------------------------------------------------------------

create or replace function public.angebot_speichern(p_id uuid, p_kopf jsonb, p_positionen jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  betrieb text := app.arbeitsbetrieb();
  alt public.quotes;
  neu public.quotes;
  kennung uuid;
  zeile jsonb;
  lauf integer := 0;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  if p_id is not null then
    select * into alt from public.quotes where id = p_id;
  end if;

  if alt.id is null then
    neu := jsonb_populate_record(null::public.quotes, p_kopf);
    -- Eine neue Fassung verweist nur auf ein Angebot DIESES Betriebs.
    if neu.vorgaenger_id is not null and not exists (
      select 1 from public.quotes v where v.id = neu.vorgaenger_id and v.company_id = betrieb
    ) then
      raise exception 'Das Angebot, das überarbeitet werden soll, gibt es in diesem Betrieb nicht'
        using errcode = '23503';
    end if;
    insert into public.quotes (
      company_id, quote_number, customer_id, customer_name, address,
      quote_date, valid_until, status, discount_mode, discount_value,
      discount_label, discount_amount, subtotal_netto, total_netto,
      total_vat, total_brutto, vat_rate, kalkulierte_stunden, notes,
      project_number, vorgaenger_id, liegenschaft_id, top_id,
      ansprechpartner_name, ansprechpartner_telefon, dringlichkeit, wunschtermin
    ) values (
      betrieb, neu.quote_number, neu.customer_id, neu.customer_name,
      neu.address, neu.quote_date, neu.valid_until,
      coalesce(neu.status, 'Entwurf'), neu.discount_mode, neu.discount_value,
      neu.discount_label, neu.discount_amount,
      coalesce(neu.subtotal_netto, 0), coalesce(neu.total_netto, 0),
      coalesce(neu.total_vat, 0), coalesce(neu.total_brutto, 0),
      neu.vat_rate, coalesce(neu.kalkulierte_stunden, 0), neu.notes,
      neu.project_number, neu.vorgaenger_id, neu.liegenschaft_id, neu.top_id,
      neu.ansprechpartner_name, neu.ansprechpartner_telefon, neu.dringlichkeit, neu.wunschtermin
    ) returning id into kennung;
  else
    kennung := alt.id;
    neu := jsonb_populate_record(alt, p_kopf);

    /*
      NUR DER ENTWURF ÄNDERT SEINEN INHALT. Verglichen wird Spalte für
      Spalte statt „wurde etwas mitgeschickt": die Ansicht schickt beim
      Annehmen den Status und die Baustelle, und das soll weiter gehen.
      Liegenschaft und Top gehören nicht zum Inhalt (oben, 5a).
    */
    if alt.status <> 'Entwurf' and (
         p_positionen is not null
      or (neu.quote_number, neu.customer_id, neu.customer_name, neu.address,
          neu.quote_date, neu.valid_until, neu.discount_mode, neu.discount_value,
          neu.discount_label, neu.discount_amount, neu.subtotal_netto,
          neu.total_netto, neu.total_vat, neu.total_brutto, neu.vat_rate,
          neu.kalkulierte_stunden, neu.notes)
         is distinct from
         (alt.quote_number, alt.customer_id, alt.customer_name, alt.address,
          alt.quote_date, alt.valid_until, alt.discount_mode, alt.discount_value,
          alt.discount_label, alt.discount_amount, alt.subtotal_netto,
          alt.total_netto, alt.total_vat, alt.total_brutto, alt.vat_rate,
          alt.kalkulierte_stunden, alt.notes)
    ) then
      raise exception 'Nur ein Entwurf lässt sich ändern — dieses Angebot ist „%"', alt.status
        using errcode = '55000';
    end if;

    update public.quotes set
      quote_number        = neu.quote_number,
      customer_id         = neu.customer_id,
      customer_name       = neu.customer_name,
      address             = neu.address,
      quote_date          = neu.quote_date,
      valid_until         = neu.valid_until,
      status              = neu.status,
      discount_mode       = neu.discount_mode,
      discount_value      = neu.discount_value,
      discount_label      = neu.discount_label,
      discount_amount     = neu.discount_amount,
      subtotal_netto      = neu.subtotal_netto,
      total_netto         = neu.total_netto,
      total_vat           = neu.total_vat,
      total_brutto        = neu.total_brutto,
      vat_rate            = neu.vat_rate,
      kalkulierte_stunden = neu.kalkulierte_stunden,
      notes               = neu.notes,
      project_number      = neu.project_number,
      liegenschaft_id     = neu.liegenschaft_id,
      top_id              = neu.top_id,
      ansprechpartner_name    = neu.ansprechpartner_name,
      ansprechpartner_telefon = neu.ansprechpartner_telefon,
      dringlichkeit           = neu.dringlichkeit,
      wunschtermin            = neu.wunschtermin
     where id = kennung;
  end if;

  if p_positionen is not null then
    delete from public.quote_lines where quote_id = kennung;
    for zeile in select * from jsonb_array_elements(p_positionen) loop
      insert into public.quote_lines (
        company_id, quote_id, position, label, qty, unit, unit_price, netto,
        ist_arbeitszeit, art, rabatt_prozent, material_id
      ) values (
        betrieb, kennung, lauf, zeile ->> 'label', (zeile ->> 'qty')::numeric,
        coalesce(zeile ->> 'unit', ''), (zeile ->> 'unit_price')::numeric,
        (zeile ->> 'netto')::numeric, (zeile ->> 'ist_arbeitszeit')::boolean,
        coalesce(zeile ->> 'art', 'position'), (zeile ->> 'rabatt_prozent')::numeric,
        -- Ein Artikel aus einem fremden Betrieb bleibt kein Verweis.
        (select m.id from public.materials m
          where m.id = nullif(zeile ->> 'material_id', '')::uuid and m.company_id = betrieb)
      );
      lauf := lauf + 1;
    end loop;
  end if;

  return kennung;
end;
$function$

;


-- ---------------------------------------------------------------------------
-- Annahme: Ansprechpartner des Angebots, Dringlichkeit, Wunschtermin
-- ---------------------------------------------------------------------------

create or replace function app.angebot_annehmen_kern(p_angebot uuid, p_praefix text, p_abrechnung text) returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  q public.quotes; k public.customers; p public.projects; nummer text; jahr integer; lfd bigint; mit_liegenschaft boolean;
begin
  select * into q from public.quotes where id = p_angebot for update;
  if q.id is null then raise exception 'Angebot nicht gefunden' using errcode = 'P0002'; end if;
  if p_abrechnung is null or p_abrechnung not in ('Regie', 'Pauschal', 'Einheitspreis') then
    raise exception 'Unbekannte Abrechnungsart' using errcode = '22023';
  end if;
  -- G15: vor dem Zähler, damit keine Baustellennummer für nichts vergeben wird.
  if q.status = 'Ersetzt' then
    raise exception 'Angebot % ist durch eine andere Fassung ersetzt', q.quote_number using errcode = '55000';
  end if;
  select * into p from public.projects
    where company_id = q.company_id and project_number = q.project_number
    for update;
  -- A3: schon angenommen — dieselbe Baustelle, ohne ein zweites Mal Budget zu buchen.
  if q.status = 'Angenommen' and p.id is not null then
    return p.project_number;
  end if;
  if p.id is not null then
    -- A3: Nachtrag — die Baustelle besteht, ihr Budget wächst um die kalkulierten Stunden.
    nummer := p.project_number;
    update public.projects
       set estimated_hours = case when q.kalkulierte_stunden > 0
                                  then coalesce(estimated_hours, 0) + q.kalkulierte_stunden
                                  else estimated_hours end,
           status = case when status = 'Abgeschlossen' then 'Aktiv' else status end
     where id = p.id;
    update public.quotes set nachtrag = true where id = q.id;
  else
    jahr := extract(year from now() at time zone 'Europe/Vienna');
    lfd := app.naechste_nummer_kern(q.company_id, 'projects', jahr, null);
    nummer := case when coalesce(p_praefix, '') = '' then '' else p_praefix || '-' end
      || jahr || '-' || lpad(lfd::text, greatest(4, length(lfd::text)), '0');
    -- Hinweis 11: der Ansprechpartner aus der Kundenakte, änderbar in der Baustelle.
    select * into k from public.customers where id = q.customer_id and company_id = q.company_id;
    -- M02c: Liegenschaft und Top des Angebots, solange das Modul an ist.
    mit_liegenschaft := q.liegenschaft_id is not null and app.modul_aktiv(q.company_id, 'kunden.liegenschaften');
    -- A8: der Ansprechpartner vor Ort aus dem Angebot (aus dem Eingang), sonst der des Kunden.
    insert into public.projects(company_id, project_number, customer_id, customer_name, address,
      status, billing_mode, estimated_hours, description, contact_name, contact_phone, liegenschaft_id, top_id,
      dringlichkeit, wunschtermin)
    values(q.company_id, nummer, q.customer_id, q.customer_name, q.address, 'Aktiv', p_abrechnung,
      case when q.kalkulierte_stunden > 0 then q.kalkulierte_stunden end,
      coalesce(nullif(btrim(q.notes), '') || E'\n\n', '') || 'Aus Angebot ' || q.quote_number,
      coalesce(nullif(btrim(coalesce(q.ansprechpartner_name, '')), ''), nullif(btrim(coalesce(k.contact_name, '')), '')),
      coalesce(nullif(btrim(coalesce(q.ansprechpartner_telefon, '')), ''), nullif(btrim(coalesce(k.contact_phone, '')), '')),
      case when mit_liegenschaft then q.liegenschaft_id end, case when mit_liegenschaft then q.top_id end,
      q.dringlichkeit, q.wunschtermin);
  end if;
  -- Der Wächter am Status (`quotes_fassung_pruefen`) hält eine zweite angenommene Fassung auf.
  update public.quotes set status = 'Angenommen', project_number = nummer where id = q.id;
  -- G15: die übrigen offenen Fassungen desselben Angebots sind damit ersetzt.
  update public.quotes set status = 'Ersetzt'
   where id in (select app.angebot_fassungen(q.id))
     and id <> q.id
     and status in ('Entwurf', 'Versendet');
  return nummer;
end; $$;

revoke all on function app.angebot_annehmen_kern(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Löschung eines Kunden: die Kontaktangaben am aufbewahrten Angebot gehen
-- ---------------------------------------------------------------------------

do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('q.ansprechpartner_name' in quelle) = 0 then
    marke := $m$and num_nonnulls(b.contact_name, b.contact_phone) > 0) k),$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Löschung: Einfügestelle Kontaktdaten (Zählung) fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, $eintrag$and num_nonnulls(b.contact_name, b.contact_phone) > 0
                         union all
                         -- A8: Ansprechpartner vor Ort an seinen Angeboten.
                         select 1 from public.quotes q
                          where q.company_id = betrieb and q.customer_id = p_id
                            and num_nonnulls(q.ansprechpartner_name, q.ansprechpartner_telefon) > 0) k),$eintrag$);

    marke := $m$           and num_nonnulls(b.contact_name, b.contact_phone) > 0;
$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Löschung: Einfügestelle Kontaktdaten (Leeren) fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$        -- A8: dasselbe am aufbewahrten Angebot.
        update public.quotes q
           set ansprechpartner_name = null, ansprechpartner_telefon = null
         where q.company_id = betrieb and q.customer_id = p_id
           and num_nonnulls(q.ansprechpartner_name, q.ansprechpartner_telefon) > 0;
$eintrag$);
    execute quelle;
  end if;
end;
$migration$;

/* Dieselben Werte im Änderungsjournal des Angebots (A8) — wie an der Baustelle. */
create or replace function app.journal_kunde_vergessen(p_betrieb text, p_kunde uuid, p_ganz boolean) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  am_kunden constant text[] := array['contact_name', 'contact_phone', 'email', 'notes'];
  an_baustellen constant text[] := array['contact_name', 'contact_phone'];
  an_angeboten constant text[] := array['ansprechpartner_name', 'ansprechpartner_telefon'];
  weg constant jsonb := '{"entfernt": true}'::jsonb;
begin
  if p_ganz then
    update public.aenderungsjournal j
       set aenderungen = (select coalesce(jsonb_object_agg(e.key, weg), '{}'::jsonb) from jsonb_each(j.aenderungen) e),
           bezeichnung = case when j.objektart in ('kunde', 'wartung') then null else j.bezeichnung end
     where j.company_id = p_betrieb and j.kunde_id = p_kunde;
    return;
  end if;

  update public.aenderungsjournal j
     set aenderungen = (select jsonb_object_agg(e.key, case when e.key = any(am_kunden) then weg else e.value end)
                          from jsonb_each(j.aenderungen) e)
   where j.company_id = p_betrieb and j.objektart = 'kunde' and j.objekt_id = p_kunde
     and j.aenderungen ?| am_kunden;

  update public.aenderungsjournal j
     set aenderungen = (select jsonb_object_agg(e.key, case when e.key = any(an_baustellen) then weg else e.value end)
                          from jsonb_each(j.aenderungen) e)
   where j.company_id = p_betrieb and j.objektart = 'baustelle' and j.kunde_id = p_kunde
     and j.aenderungen ?| an_baustellen;

  update public.aenderungsjournal j
     set aenderungen = (select jsonb_object_agg(e.key, case when e.key = any(an_angeboten) then weg else e.value end)
                          from jsonb_each(j.aenderungen) e)
   where j.company_id = p_betrieb and j.objektart = 'angebot' and j.kunde_id = p_kunde
     and j.aenderungen ?| an_angeboten;

  update public.aenderungsjournal j
     set aenderungen = (select coalesce(jsonb_object_agg(e.key, weg), '{}'::jsonb) from jsonb_each(j.aenderungen) e),
         bezeichnung = null
   where j.company_id = p_betrieb and j.objektart = 'wartung' and j.kunde_id = p_kunde;
end;
$$;

revoke all on function app.journal_kunde_vergessen(text, uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Eingang → Angebot und Eingang → Baustelle
-- ---------------------------------------------------------------------------


create or replace function public.eingang_zu_angebot(p_eingang uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e public.auftragseingaenge;
  k public.customers;
  kunde uuid;
  c public.companies;
  heute date := (now() at time zone 'Europe/Vienna')::date;
  jahr integer;
  nummer text;
  angebot uuid;
  mit_liegenschaft boolean;
  liegenschaft_zeile text;
begin
  if app.hat_rolle(array['Projektleiter', 'Geschäftsführung', 'Administrator']) is not true then
    raise exception 'Einen Eingang übernimmt nur die Führung — wie ein neues Angebot' using errcode = '42501';
  end if;
  e := app.eingang_sperren(p_eingang);
  if e.stand = 'uebernommen' and e.quote_id is not null then
    return jsonb_build_object('quote_id', e.quote_id, 'neu', false,
      'quote_number', (select q.quote_number from public.quotes q where q.id = e.quote_id));
  end if;
  if e.stand <> 'offen' then
    raise exception 'Der Eingang % ist %; übernommen wird nur ein offener', e.nummer, app.eingang_stand_text(e.stand)
      using errcode = '55000';
  end if;
  if not app.modul_aktiv(e.company_id, 'angebote') then
    raise exception 'Angebote sind in diesem Betrieb ausgeschaltet (Einstellungen → Module)' using errcode = '55000';
  end if;

  kunde := app.eingang_kunde(e.id);
  select * into k from public.customers where id = kunde;
  select * into c from public.companies where id = e.company_id;
  jahr := extract(year from heute);
  nummer := app.belegnummer(coalesce(c.praefix_angebot, 'AN'), jahr, public.naechste_nummer('quotes', jahr));
  -- M02c: Liegenschaft und Top, solange das Modul an ist.
  mit_liegenschaft := e.liegenschaft_id is not null and app.modul_aktiv(e.company_id, 'kunden.liegenschaften');
  if mit_liegenschaft then
    select l.anschrift into liegenschaft_zeile from public.liegenschaften l
     where l.id = e.liegenschaft_id and l.company_id = e.company_id;
  end if;

  angebot := public.angebot_speichern(null, jsonb_build_object(
    'quote_number', nummer,
    'customer_id', k.id,
    'customer_name', k.name,
    'address', coalesce(nullif(btrim(coalesce(e.ort, '')), ''), nullif(btrim(coalesce(liegenschaft_zeile, '')), ''), k.address),
    'quote_date', heute,
    'valid_until', heute + 30,
    'status', 'Entwurf',
    'vat_rate', coalesce((c.rates ->> 'vatRate')::numeric, 0.2),
    'kalkulierte_stunden', 0,
    'notes', btrim(e.anliegen)
      || coalesce(E'\n\nIhre Auftrags- bzw. Schadensnummer: ' || nullif(btrim(coalesce(e.auftraggeber_nummer, '')), ''), ''),
    'liegenschaft_id', case when mit_liegenschaft then e.liegenschaft_id end,
    'top_id', case when mit_liegenschaft then e.top_id end,
    -- A8: wer vor Ort aufmacht, wie eilig, wann gewünscht — gehen mit bis zur Baustelle.
    'ansprechpartner_name', nullif(btrim(coalesce(e.ansprechpartner_name, '')), ''),
    'ansprechpartner_telefon', nullif(btrim(coalesce(e.ansprechpartner_telefon, '')), ''),
    'dringlichkeit', e.dringlichkeit,
    'wunschtermin', e.wunschtermin
  ), '[]'::jsonb);

  update public.auftragseingaenge
     set stand = 'uebernommen', quote_id = angebot, uebernommen_am = now(),
         uebernommen_von_uid = auth.uid(),
         uebernommen_von_name = (select u.name from public.users u where u.id = auth.uid())
   where id = e.id;

  return jsonb_build_object('quote_id', angebot, 'quote_number', nummer, 'customer_id', k.id, 'neu', true);
end;
$function$

;

revoke all on function public.eingang_zu_angebot(uuid) from public, anon;
grant execute on function public.eingang_zu_angebot(uuid) to authenticated;

create or replace function public.eingang_zu_baustelle(p_eingang uuid, p_praefix text, p_abrechnung text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e public.auftragseingaenge;
  k public.customers;
  kunde uuid;
  jahr integer;
  nummer text;
  projekt uuid;
  beschreibung text;
  mit_liegenschaft boolean;
  liegenschaft_zeile text;
begin
  if app.hat_rolle(array['Projektleiter', 'Geschäftsführung', 'Administrator']) is not true then
    raise exception 'Einen Eingang übernimmt nur die Führung — wie eine neue Baustelle' using errcode = '42501';
  end if;
  e := app.eingang_sperren(p_eingang);
  if e.stand = 'uebernommen' and e.project_id is not null then
    return jsonb_build_object('project_id', e.project_id, 'neu', false,
      'project_number', (select p.project_number from public.projects p where p.id = e.project_id));
  end if;
  if e.stand <> 'offen' then
    raise exception 'Der Eingang % ist %; übernommen wird nur ein offener', e.nummer, app.eingang_stand_text(e.stand)
      using errcode = '55000';
  end if;
  if p_abrechnung is null or p_abrechnung not in ('Regie', 'Pauschal', 'Einheitspreis') then
    raise exception 'Bitte die Abrechnung der Baustelle wählen — Regie, Pauschal oder Einheitspreis' using errcode = '22023';
  end if;
  if p_praefix is null or p_praefix !~ '^[A-Z0-9-]{0,6}$' then
    raise exception 'Der Vorsatz der Baustellennummer hat höchstens sechs Großbuchstaben, Ziffern oder Bindestriche'
      using errcode = '22023';
  end if;

  -- Erst den Kunden, dann lesen: in einer Bedingung liefe die Funktion je gelesener Zeile.
  kunde := app.eingang_kunde(e.id);
  select * into k from public.customers where id = kunde;
  jahr := extract(year from now() at time zone 'Europe/Vienna');
  nummer := app.belegnummer(p_praefix, jahr, public.naechste_nummer('projects', jahr));
  beschreibung := btrim(e.anliegen)
    || coalesce(E'\n\nNummer des Auftraggebers: ' || nullif(btrim(coalesce(e.auftraggeber_nummer, '')), ''), '')
    || E'\n\nAus Eingang ' || e.nummer;
  -- M02c: Liegenschaft und Top, solange das Modul an ist.
  mit_liegenschaft := e.liegenschaft_id is not null and app.modul_aktiv(e.company_id, 'kunden.liegenschaften');
  if mit_liegenschaft then
    select l.anschrift into liegenschaft_zeile from public.liegenschaften l
     where l.id = e.liegenschaft_id and l.company_id = e.company_id;
  end if;

  insert into public.projects (company_id, project_number, customer_id, customer_name, address, status,
                               billing_mode, description, contact_name, contact_phone, liegenschaft_id, top_id,
                               dringlichkeit, wunschtermin)
  values (e.company_id, nummer, k.id, k.name,
          coalesce(nullif(btrim(coalesce(e.ort, '')), ''), nullif(btrim(coalesce(liegenschaft_zeile, '')), ''), k.address),
          'Aktiv', p_abrechnung, beschreibung,
          coalesce(nullif(btrim(coalesce(e.ansprechpartner_name, '')), ''), nullif(btrim(coalesce(k.contact_name, '')), '')),
          coalesce(nullif(btrim(coalesce(e.ansprechpartner_telefon, '')), ''), nullif(btrim(coalesce(k.contact_phone, '')), '')),
          case when mit_liegenschaft then e.liegenschaft_id end,
          case when mit_liegenschaft then e.top_id end,
          e.dringlichkeit, e.wunschtermin)
  returning id into projekt;

  update public.auftragseingaenge
     set stand = 'uebernommen', project_id = projekt, uebernommen_am = now(),
         uebernommen_von_uid = auth.uid(),
         uebernommen_von_name = (select u.name from public.users u where u.id = auth.uid())
   where id = e.id;

  return jsonb_build_object('project_id', projekt, 'project_number', nummer, 'customer_id', k.id, 'neu', true);
end;
$function$

;

revoke all on function public.eingang_zu_baustelle(uuid, text, text) from public, anon;
grant execute on function public.eingang_zu_baustelle(uuid, text, text) to authenticated;
