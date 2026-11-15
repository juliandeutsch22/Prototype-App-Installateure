/*
  ANNAHME ZURÜCKNEHMEN (Durchsicht 15.11.2026, A1 / F7).

  WAS DIE DURCHSICHT FAND. Ein angenommenes Angebot hatte keinen Rückweg —
  weder für einen Fehlklick („Annehmen → Baustelle“ in der falschen Zeile)
  noch für einen Rücktritt des Kunden. Die Baustelle liess sich nicht
  löschen, weil das Angebot auf sie zeigt (`quotes.project_id` ohne
  Löschregel); die App meldete dabei „an ihr hängen schon Buchungen,
  Scheine, Rechnungen oder Pläne“, obwohl nichts davon zutraf. Die andere
  Fassung blieb für immer „Ersetzt“ (`angebot_fassung_pruefen` lässt
  „Ersetzt“ nicht wieder offen).

  WAS JETZT GILT — `angebot_annahme_zuruecknehmen(angebot, grund)`, ein
  Schritt der Führung (dieselbe Rolle wie `angebot_annehmen`):
  1. Ein Grund ist Pflicht. Er steht am Angebot
     (`annahme_zurueckgenommen_grund`, `_am`) und damit im Verlauf der
     Angebotsseite; wer es getan hat, hält das Änderungsjournal fest.
  2. Das Angebot ist wieder offen: „Versendet“, wenn es schon einmal
     versendet war (`versendet_am`), sonst „Entwurf“. Ebenso jede Fassung,
     die diese Annahme auf „Ersetzt“ gesetzt hatte. Der Tag des Versands und
     die beim Versand festgehaltenen Firmendaten bleiben, wie sie waren — es
     ist derselbe Versand, nicht ein neuer.
  3. Die Baustelle: hängt an ihr nichts ausser diesem Angebot, wird sie
     gelöscht. Hängt etwas daran (Buchung, Einsatz, Schein, Rechnung,
     Anforderung, Rüstliste, Plan, Termin, Nachricht im Baustellen-Thread
     oder ein weiteres Angebot), wird sie abgeschlossen statt gelöscht —
     nichts davon geht verloren. Termine und Nachrichten zählen hier mit,
     obwohl sie beim gewöhnlichen Löschen mitgehen würden (`on delete
     cascade`): eine Rücknahme soll nichts still mitnehmen.
  4. `baustelle_verwendung(projekt)`: was an einer Baustelle hängt — dieselbe
     Zählung, die die Rücknahme entscheidet. Die Baustellenliste nennt damit
     beim Löschen den wahren Grund und den Weg (ein angenommenes Angebot →
     „Annahme zurücknehmen“; sonst „Abschließen“).

  WAS GLEICH BLEIBT.
  - Ein über den Link angenommenes Angebot behält seinen Link samt Name,
    Unterschrift und Prüfsumme: das ist der Nachweis, dass der Kunde
    angenommen hatte, und wird nicht umgeschrieben. Der Rücktritt steht
    daneben, mit Grund.
  - `angebot_fassung_pruefen`, `angebot_status_zeit` und
    `aussteller_angebot` machen ihre Ausnahme nur für die Dauer der
    Rücknahme (Einstellung `app.annahme_zurueck`, wie `app.zahlstand` bei
    den Zahlungen). Jeder andere Weg — auch die alte App — trifft dieselben
    Wächter wie bisher.

  ALTDATEN. Nichts wird umgeschrieben; die beiden Spalten sind leer, bis
  jemand eine Annahme zurücknimmt.
*/

-- ---------------------------------------------------------------------------
-- 1. Grund und Zeitpunkt am Angebot
-- ---------------------------------------------------------------------------

alter table public.quotes
  add column if not exists annahme_zurueckgenommen_am timestamptz,
  add column if not exists annahme_zurueckgenommen_grund text;

comment on column public.quotes.annahme_zurueckgenommen_grund is
  'Warum die Annahme dieses Angebots zurückgenommen wurde (angebot_annahme_zuruecknehmen). '
  'Wer es tat, steht im Änderungsjournal.';

-- Der Grund steht im Journal (Textliste der App); der Zeitpunkt ist wie die anderen Zeitstempel ausgenommen.
drop trigger if exists quotes_journal on public.quotes;
create trigger quotes_journal
  after insert or update or delete on public.quotes
  for each row execute function app.journal_protokollieren(
    'angebot', '{id,company_id,created_at,updated_at,aussteller_stand,customer_id,project_id,vorgaenger_id,versendet_am,angenommen_am,abgelehnt_am,verworfen_am,verworfen_von_uid,verworfen_von_name,liegenschaft_id,top_id,annahme_zurueckgenommen_am}');

-- ---------------------------------------------------------------------------
-- 2. Die Wächter kennen die Rücknahme
-- ---------------------------------------------------------------------------

/* Unverändert bis auf die Ausnahme der Rücknahme: „Ersetzt“ wird nur durch sie wieder offen. */
create or replace function app.angebot_fassung_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  andere public.quotes;
begin
  if app.ist_dienst() or new.status is not distinct from old.status then
    return new;
  end if;
  if old.status = 'Ersetzt' then
    if coalesce(current_setting('app.annahme_zurueck', true), '') = 'ja'
       and new.status in ('Entwurf', 'Versendet') then
      return new;
    end if;
    raise exception 'Angebot % ist durch eine andere Fassung ersetzt und wird nicht wieder offen', old.quote_number
      using errcode = '55000';
  end if;
  if new.status = 'Angenommen' then
    select q.* into andere
      from public.quotes q
     where q.id in (select app.angebot_fassungen(new.id))
       and q.id <> new.id
       and q.status = 'Angenommen'
     limit 1;
    if andere.id is not null then
      raise exception 'Von diesem Angebot ist schon die Fassung % angenommen% — eine zweite Baustelle zum selben Auftrag entsteht nicht',
        andere.quote_number,
        coalesce(' (Baustelle ' || nullif(andere.project_number, '') || ')', '')
        using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;

/*
  Der Tag des Versands bleibt bei der Rücknahme der alte: wieder „Versendet“
  heisst hier „wie vor der Annahme“, nicht „heute versendet“.
*/
create or replace function app.angebot_status_zeit() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() or coalesce(current_setting('app.annahme_zurueck', true), '') = 'ja' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  case new.status
    when 'Versendet' then new.versendet_am := now();
    when 'Angenommen' then new.angenommen_am := now();
    when 'Abgelehnt' then new.abgelehnt_am := now();
    else null;
  end case;
  return new;
end;
$$;

/*
  DIE FIRMENDATEN BEI DER RÜCKNAHME. Wieder versendet: die des Versands
  bleiben (es ist derselbe Versand). Wieder Entwurf: keine festgehaltenen
  mehr — ein Entwurf zeigt die heutigen, wie jeder andere Entwurf.
*/
create or replace function app.aussteller_angebot() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.aussteller_stand := case when new.status = 'Entwurf' then null
                                 else app.aussteller_stand(new.company_id) end;
    return new;
  end if;

  if coalesce(current_setting('app.annahme_zurueck', true), '') = 'ja'
     and new.status is distinct from old.status then
    new.aussteller_stand := case when new.status = 'Entwurf' then null else old.aussteller_stand end;
    return new;
  end if;

  if new.status = 'Versendet' and old.status is distinct from 'Versendet' then
    new.aussteller_stand := app.aussteller_stand(new.company_id);
  elsif old.status = 'Entwurf' and new.status not in ('Entwurf', 'Verworfen') and old.aussteller_stand is null then
    new.aussteller_stand := app.aussteller_stand(new.company_id);
  elsif new.aussteller_stand is distinct from old.aussteller_stand then
    raise exception 'Die Firmendaten eines Angebots hält sein Versand fest'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Was an einer Baustelle hängt
-- ---------------------------------------------------------------------------

/*
  Gezählt wird jede Tabelle, die auf die Baustelle verweist — bis auf die
  alten Nummern (gehören zur Baustelle selbst) und den Auftragseingang
  (`on delete set null`: er wird nur wieder offen). `angebote` nennt die
  Angebote mit Nummer und Stand, damit die Oberfläche den Weg dorthin
  zeigen kann.
*/
create or replace function app.baustelle_verwendung(p_projekt uuid) returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select jsonb_build_object(
    'zeitbuchungen', (select count(*) from public.time_entries t where t.project_id = p_projekt),
    'einsaetze',     (select count(*) from public.assignments a where a.project_id = p_projekt),
    'scheine',       (select count(*) from public.work_sheets w where w.project_id = p_projekt),
    'rechnungen',    (select count(*) from public.invoices i where i.project_id = p_projekt),
    'anforderungen', (select count(*) from public.material_orders m where m.project_id = p_projekt),
    'ruestlisten',   (select count(*) from public.einsatz_material e where e.project_id = p_projekt),
    'dokumente',     (select count(*) from public.project_documents d where d.project_id = p_projekt),
    'termine',       (select count(*) from public.termine t where t.project_id = p_projekt),
    'nachrichten',   (select count(*) from public.nachrichten n
                        join public.nachrichten_kanaele k on k.id = n.kanal_id
                       where k.project_id = p_projekt),
    'angebote',      (select coalesce(jsonb_agg(jsonb_build_object(
                                'id', q.id, 'nummer', q.quote_number, 'status', q.status)
                              order by q.created_at, q.id), '[]'::jsonb)
                        from public.quotes q where q.project_id = p_projekt)
  )
$$;

revoke all on function app.baustelle_verwendung(uuid) from public, anon, authenticated;

/* Hängt etwas an der Baustelle — Angebote mitgezählt? */
create or replace function app.baustelle_haengt_etwas(v jsonb) returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select (v ->> 'zeitbuchungen')::int + (v ->> 'einsaetze')::int + (v ->> 'scheine')::int
       + (v ->> 'rechnungen')::int + (v ->> 'anforderungen')::int + (v ->> 'ruestlisten')::int
       + (v ->> 'dokumente')::int + (v ->> 'termine')::int + (v ->> 'nachrichten')::int
       + jsonb_array_length(v -> 'angebote') > 0
$$;

revoke all on function app.baustelle_haengt_etwas(jsonb) from public, anon, authenticated;

/*
  Für den Löschdialog der Baustellenliste: wer Baustellen löschen darf (die
  Führung, `projects_loeschen`), erfährt vorher, was im Weg steht. Lesend
  (`stable`, steht in `LESENDE_FUNKTIONEN`).
*/
create or replace function public.baustelle_verwendung(p_projekt uuid) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  p public.projects;
begin
  if app.ist_fuehrung() is not true then
    raise exception 'Was an einer Baustelle hängt, sieht die Führung' using errcode = '42501';
  end if;
  select * into p from public.projects
   where id = p_projekt
     and (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb()));
  if p.id is null then
    raise exception 'Baustelle nicht gefunden' using errcode = 'P0002';
  end if;
  return app.baustelle_verwendung(p.id);
end;
$$;

revoke all on function public.baustelle_verwendung(uuid) from public, anon;
grant execute on function public.baustelle_verwendung(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Die Rücknahme
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
  -- Dieselbe Sperre wie Annahme und Link: keine Annahme einer anderen Fassung dazwischen.
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
    -- Erst jetzt gezählt: dieses Angebot zeigt nicht mehr auf die Baustelle.
    if not app.baustelle_haengt_etwas(app.baustelle_verwendung(p.id)) then
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
