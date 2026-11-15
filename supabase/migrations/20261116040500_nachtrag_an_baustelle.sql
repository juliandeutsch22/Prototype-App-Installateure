/*
  NACHTRAG: EIN ANGEBOT AN EINE BESTEHENDE BAUSTELLE (Durchsicht 15.11.2026,
  A3 / F6).

  WAS DIE DURCHSICHT FAND. Die Baustellenakte riet bei Pauschal und
  Einheitspreis ohne Angebot: „Oder ein Angebot anlegen und annehmen, dann
  übernimmt die Rechnung dessen Positionen.“ Wer das tat, bekam eine ZWEITE
  Baustelle für denselben Auftrag: `angebot_annehmen_kern` hängt nur an,
  wenn `quotes.project_number` schon auf eine Baustelle zeigt — und kein Weg
  der App setzte das vor der Annahme. Ebenso jeder Nachtrag zu einer
  laufenden Baustelle: jedes angenommene Angebot war eine neue Baustelle, das
  Budget der bestehenden wuchs nicht mit.

  WAS JETZT GILT.
  1. Ein Angebot kann von Anfang an zu einer Baustelle gehören (das Formular
     setzt `project_number`, die Akte zeigt es schon als Entwurf). Beim
     Annehmen wird gewählt: „neue Baustelle“ oder „an Baustelle …“ —
     `angebot_annehmen_mit_ziel(angebot, praefix, abrechnung, baustelle)`,
     `baustelle` leer heißt ausdrücklich neu.
  2. Angehängt (der Kern, für interne Annahme UND Link): das Stundenbudget
     der Baustelle wächst um die kalkulierten Stunden des Angebots, das
     Angebot trägt `nachtrag = true` und steht in der Akte. War die Baustelle
     abgeschlossen, ist sie wieder aktiv — der Kunde hat neue Arbeit
     bestellt.
  3. Ein angenommenes Angebot wird nicht ein zweites Mal angenommen: der
     Kern gibt dann die Baustelle zurück, ohne erneut zu buchen (vorher fiel
     das nicht auf, weil das „Anhängen“ nichts veränderte).
  4. Die Rücknahme der Annahme (A1) zieht bei einem Nachtrag die Stunden
     wieder ab; die Baustelle bleibt, wie sie ist.
  5. Über den Link angenommen hält das Journal der Baustelle fest, dass der
     Kunde das Budget verändert hat (der Dienstschlüssel schreibt sonst kein
     Journal).

  WAS GLEICH BLEIBT. `angebot_annehmen(uuid, text, text)` behält Signatur,
  Rechte und Verhalten (die alte App ruft sie): ein Angebot ohne Baustelle
  bekommt eine neue, wie bisher. `angebot_annehmen_kern` behält seine
  Signatur. Der Kunde muss zur Baustelle passen; eine Baustelle eines anderen
  Kunden nimmt kein Angebot auf.

  ALTDATEN. `nachtrag` ist für jedes bestehende Angebot `false` — richtig, denn
  bisher entstand jede Baustelle aus ihrer Annahme. Nichts wird umgeschrieben.
*/

alter table public.quotes
  add column if not exists nachtrag boolean not null default false;

comment on column public.quotes.nachtrag is
  'Angenommen als Nachtrag zu einer bestehenden Baustelle: deren Budget wuchs um die kalkulierten Stunden. '
  'Setzt nur angebot_annehmen_kern; die Rücknahme der Annahme zieht sie wieder ab.';

-- ---------------------------------------------------------------------------
-- 1. Der Kern: anhängen statt eine zweite Baustelle
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
    insert into public.projects(company_id, project_number, customer_id, customer_name, address,
      status, billing_mode, estimated_hours, description, contact_name, contact_phone, liegenschaft_id, top_id)
    values(q.company_id, nummer, q.customer_id, q.customer_name, q.address, 'Aktiv', p_abrechnung,
      case when q.kalkulierte_stunden > 0 then q.kalkulierte_stunden end,
      coalesce(nullif(btrim(q.notes), '') || E'\n\n', '') || 'Aus Angebot ' || q.quote_number,
      nullif(btrim(coalesce(k.contact_name, '')), ''), nullif(btrim(coalesce(k.contact_phone, '')), ''),
      case when mit_liegenschaft then q.liegenschaft_id end, case when mit_liegenschaft then q.top_id end);
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
-- 2. Annehmen mit Ziel: neue Baustelle oder an Baustelle …
-- ---------------------------------------------------------------------------

create or replace function public.angebot_annehmen_mit_ziel(
  p_angebot uuid, p_praefix text, p_abrechnung text, p_baustelle uuid
) returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  q public.quotes;
  p public.projects;
begin
  if app.ist_fuehrung() is not true then
    raise exception 'Angebote annehmen darf nur die Führung' using errcode = '42501';
  end if;
  select * into q from public.quotes where id = p_angebot
    and (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb())) for update;
  if q.id is null then raise exception 'Angebot nicht gefunden' using errcode = 'P0002'; end if;
  -- Zweiter Aufruf nach verlorener Antwort: dieselbe Baustelle, wie bei `angebot_annehmen`.
  if q.status = 'Angenommen' then
    return app.angebot_annehmen_kern(q.id, p_praefix, p_abrechnung);
  end if;

  if p_baustelle is not null then
    select * into p from public.projects where id = p_baustelle and company_id = q.company_id;
    if p.id is null then
      raise exception 'Die Baustelle für den Nachtrag gibt es in diesem Betrieb nicht' using errcode = 'P0002';
    end if;
    if q.customer_id is not null and p.customer_id is not null and q.customer_id <> p.customer_id then
      raise exception 'Baustelle % gehört zu %, das Angebot % an % — ein Nachtrag geht nur an eine Baustelle desselben Kunden',
        p.project_number, p.customer_name, q.quote_number, q.customer_name
        using errcode = '22023';
    end if;
    if q.project_number is distinct from p.project_number then
      update public.quotes set project_number = p.project_number where id = q.id;
    end if;
  elsif q.project_number is not null then
    -- Ausdrücklich eine neue Baustelle, obwohl das Angebot einer zugeordnet war.
    update public.quotes set project_number = null where id = q.id;
  end if;

  return app.angebot_annehmen_kern(q.id, p_praefix, p_abrechnung);
end;
$$;

revoke all on function public.angebot_annehmen_mit_ziel(uuid, text, text, uuid) from public, anon;
grant execute on function public.angebot_annehmen_mit_ziel(uuid, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Die Rücknahme (A1) kennt den Nachtrag
-- ---------------------------------------------------------------------------

create or replace function public.angebot_annahme_zuruecknehmen(p_angebot uuid, p_grund text) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  q public.quotes;
  p public.projects;
  grund text := btrim(coalesce(p_grund, ''));
  zurueck text;
  wieder_offen text[];
  ergebnis text := 'keine';
begin
  if app.ist_fuehrung() is not true then
    raise exception 'Eine Annahme nimmt nur die Führung zurück' using errcode = '42501';
  end if;
  select * into q from public.quotes
   where id = p_angebot
     and (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb()));
  if q.id is null then raise exception 'Angebot nicht gefunden' using errcode = 'P0002'; end if;
  perform app.angebot_fassungen_sperren(q.id);
  select * into q from public.quotes where id = q.id for update;

  if q.status <> 'Angenommen' then
    raise exception 'Zurücknehmen lässt sich nur eine Annahme — % ist „%“', q.quote_number, q.status
      using errcode = '55000';
  end if;
  if char_length(grund) < 3 or char_length(grund) > 1000 then
    raise exception 'Bitte einen Grund angeben (3 bis 1000 Zeichen) — er steht danach im Verlauf des Angebots'
      using errcode = '22023';
  end if;

  if q.project_id is not null then
    select * into p from public.projects where id = q.project_id for update;
  end if;

  zurueck := case when q.versendet_am is not null then 'Versendet' else 'Entwurf' end;

  perform set_config('app.annahme_zurueck', 'ja', true);
  update public.quotes
     set status = zurueck,
         project_number = null,
         angenommen_am = null,
         nachtrag = false,
         annahme_zurueckgenommen_am = now(),
         annahme_zurueckgenommen_grund = grund
   where id = q.id;
  with offen as (
    update public.quotes x
       set status = case when x.versendet_am is not null then 'Versendet' else 'Entwurf' end
     where x.id in (select app.angebot_fassungen(q.id))
       and x.id <> q.id
       and x.status = 'Ersetzt'
    returning x.quote_number
  )
  select coalesce(array_agg(quote_number order by quote_number), '{}') into wieder_offen from offen;
  perform set_config('app.annahme_zurueck', '', true);

  if p.id is not null then
    if q.nachtrag then
      -- A3: ein Nachtrag nimmt nur seine Stunden wieder mit; die Baustelle gehört dem Hauptauftrag.
      if q.kalkulierte_stunden > 0 then
        update public.projects
           set estimated_hours = nullif(greatest(coalesce(estimated_hours, 0) - q.kalkulierte_stunden, 0), 0)
         where id = p.id;
      end if;
      ergebnis := 'nachtrag_entfernt';
    elsif not app.baustelle_haengt_etwas(app.baustelle_verwendung(p.id)) then
      delete from public.projects where id = p.id;
      ergebnis := 'geloescht';
    elsif p.status <> 'Abgeschlossen' then
      update public.projects set status = 'Abgeschlossen' where id = p.id;
      ergebnis := 'abgeschlossen';
    else
      ergebnis := 'war_abgeschlossen';
    end if;
  end if;

  return jsonb_build_object(
    'status', zurueck,
    'baustelle', p.project_number,
    'baustelle_id', case when ergebnis = 'geloescht' then null else p.id end,
    'ergebnis', ergebnis,
    'wieder_offen', to_jsonb(wieder_offen));
end;
$$;

revoke all on function public.angebot_annahme_zuruecknehmen(uuid, text) from public, anon;
grant execute on function public.angebot_annahme_zuruecknehmen(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Über den Link angenommen: das Journal der Baustelle beim Nachtrag
-- ---------------------------------------------------------------------------

create or replace function public.angebot_link_annehmen(p_hash text, p_name text, p_unterschrift text, p_bestaetigt boolean)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  l public.angebot_links;
  q public.quotes;
  zustand text;
  name text := btrim(coalesce(p_name, ''));
  von text;
  vorher jsonb;
  quote_alt jsonb;
  projekt_alt jsonb;
  nummer text;
  neue_baustelle boolean;
  projekt public.projects;
  f record;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into l from public.angebot_links where schluessel_hash = p_hash;
  if l.id is null then
    return null;
  end if;
  perform app.angebot_fassungen_sperren(l.quote_id);
  select * into l from public.angebot_links where id = l.id for update;
  select * into q from public.quotes where id = l.quote_id;
  zustand := app.angebot_link_kundensicht(l, q);
  if zustand is null then
    return null;
  end if;
  if not app.angebot_link_anfrage_zaehlen(l.id) then
    return jsonb_build_object('zustand', 'zu_viele');
  end if;
  if zustand <> 'offen' then
    return app.angebot_link_antwort(l, zustand) || jsonb_build_object('neu', false);
  end if;

  if p_bestaetigt is not true then
    raise exception 'Ohne die Bestätigung „verbindlich annehmen“ wird nicht angenommen' using errcode = '22023';
  end if;
  if char_length(name) < 2 or char_length(name) > 120 then
    raise exception 'Bitte den Namen angeben (2 bis 120 Zeichen)' using errcode = '22023';
  end if;
  if p_unterschrift is null or char_length(p_unterschrift) > 500000
     or p_unterschrift !~ '^data:image/png;base64,[A-Za-z0-9+/]+=*$' then
    raise exception 'Die Unterschrift fehlt oder ist kein Bild' using errcode = '22023';
  end if;

  von := 'Kunde über Link: ' || name;
  select coalesce(jsonb_object_agg(x.id::text, to_jsonb(x)), '{}'::jsonb) into vorher
    from public.quotes x
   where x.id in (select app.angebot_fassungen(q.id)) and x.id <> q.id and x.status in ('Entwurf', 'Versendet');
  quote_alt := to_jsonb(q);
  select to_jsonb(p) into projekt_alt from public.projects p
   where p.company_id = q.company_id and p.project_number = q.project_number;
  neue_baustelle := projekt_alt is null;

  nummer := app.angebot_annehmen_kern(q.id, l.praefix, l.abrechnung);

  update public.quotes set angenommen_am = now() where id = q.id;
  update public.quotes x
     set aussteller_stand = app.aussteller_stand(x.company_id)
   where x.id in (select (k)::uuid from jsonb_object_keys(vorher) k)
     and x.status = 'Ersetzt' and x.aussteller_stand is null
     and (vorher -> x.id::text ->> 'status') = 'Entwurf';

  update public.angebot_links a
     set angenommen_am = now(), angenommen_name = name, angenommen_unterschrift = p_unterschrift
   where a.id = l.id
  returning * into l;

  select * into projekt from public.projects p where p.company_id = q.company_id and p.project_number = nummer;
  if neue_baustelle then
    perform app.journal_kunde_ueber_link('baustelle', null, to_jsonb(projekt), null, 'angelegt', von);
  else
    -- A3: ein Nachtrag über den Link — das gewachsene Budget (und ein Wiederöffnen) steht im Journal der Baustelle.
    perform app.journal_kunde_ueber_link('baustelle', projekt_alt, to_jsonb(projekt),
      array['estimated_hours', 'status'], 'geaendert', von);
  end if;
  select * into q from public.quotes where id = q.id;
  perform app.journal_kunde_ueber_link('angebot', quote_alt, to_jsonb(q), array['status', 'project_number', 'nachtrag'], 'geaendert', von);
  for f in
    select x.* from public.quotes x
     where x.id in (select (k)::uuid from jsonb_object_keys(vorher) k)
     order by x.id
  loop
    perform app.journal_kunde_ueber_link('angebot', vorher -> f.id::text, to_jsonb(f), array['status'], 'geaendert', von);
  end loop;

  perform app.push_anstossen(jsonb_build_object(
    'quelle', 'angebot', 'art', 'link-entschieden',
    'zeile', jsonb_build_object('id', l.id, 'company_id', l.company_id)));

  return app.angebot_link_antwort(l, 'angenommen') || jsonb_build_object('neu', true);
end;
$$;

revoke all on function public.angebot_link_annehmen(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.angebot_link_annehmen(text, text, text, boolean) to service_role;
