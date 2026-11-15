/*
  DURCHSICHT 15.11.2026, P4 — STORNO EINES VERRECHNETEN SCHEINS.

  WAS DIE DURCHSICHT FAND (`analyse/3-planung-scheine.md`, M3). Ein Schein,
  der schon auf einer gültigen Rechnung steht, ließ sich ohne Hinweis
  stornieren (Trigger und Dialog kennen die Rechnung nicht). Der danach neu
  geschriebene Schein galt als „nicht verrechnet“ und die nächste Rechnung
  der Baustelle schlug sein Material noch einmal vor — die Therme stand
  zweimal auf Rechnungen. Umgekehrt stand auf der ersten Rechnung Material
  eines stornierten Belegs, und niemand wurde darauf hingewiesen.

  WAS JETZT GILT
  - VOR DEM STORNO sagt `schein_verrechnung`, ob und wo der Schein
    verrechnet ist. Der Dialog nennt die Rechnung (wer Rechnungen lesen darf)
    und was zu tun ist: Stimmt die Rechnung nicht mehr, sie stornieren und
    neu ausstellen. Abgewiesen wird der Storno nicht — er ist die Korrektur
    eines Belegs, und die Rechnung ist ein eigener Beleg mit eigenem Storno.
  - DER ERSATZSCHEIN trägt, wen er ersetzt (`work_sheets.ersetzt`, gesetzt
    nur beim Anlegen). Er ERBT DIE VERRECHNUNG: stand der stornierte Schein
    auf einer gültigen Rechnung (oder galt er sonst als verrechnet), gilt
    auch der Ersatz als verrechnet und kommt nicht noch einmal auf eine
    Rechnung. Wird jene Rechnung storniert, ist der Ersatz wieder offen und
    kommt mit der neuen Rechnung — dieselbe Regel wie für jeden Schein.
  - Ersetzt werden kann nur ein stornierter Schein des eigenen Betriebs, und
    höchstens von einem gültigen Schein zugleich (Entwurf oder
    unterschrieben): zwei Ersatzscheine erbten sonst beide die Verrechnung.

  ALTE APP: sie schickt `ersetzt` nicht mit; der Schein entsteht wie bisher
  ohne Bezug. `schein_speichern` behält Signatur und Ablauf
  (Rumpf aus 20261024200000_schein_material_katalog.sql), neu ist nur die
  Spalte beim Anlegen.

  DATENSCHUTZ: keine neuen Personendaten — ein Verweis zwischen zwei Belegen
  desselben Betriebs.
*/

-- ---------------------------------------------------------------------------
-- 1. Der Verweis
-- ---------------------------------------------------------------------------

alter table public.work_sheets
  add column if not exists ersetzt uuid references public.work_sheets (id) on delete set null;

comment on column public.work_sheets.ersetzt is
  'Der stornierte Schein, den dieser ersetzt (P4, 16.11.2026). Gesetzt nur beim Anlegen; erbt dessen Verrechnung.';

create index if not exists work_sheets_ersetzt on public.work_sheets (ersetzt) where ersetzt is not null;

create or replace function app.schein_ersetzt_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.ersetzt is distinct from old.ersetzt and not app.ist_dienst() then
    raise exception 'Wen ein Schein ersetzt, steht mit dem Anlegen fest' using errcode = '42501';
  end if;
  if new.ersetzt is null or new.status not in ('Entwurf', 'Unterschrieben') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('Entwurf', 'Unterschrieben') and new.ersetzt is not distinct from old.ersetzt then
    return new;
  end if;
  if new.ersetzt = new.id or not exists (
       select 1 from public.work_sheets w
        where w.id = new.ersetzt and w.company_id = new.company_id and w.status = 'Storniert') then
    raise exception 'Ersetzt werden kann nur ein stornierter Schein dieses Betriebs' using errcode = '23514';
  end if;
  if exists (select 1 from public.work_sheets w
              where w.ersetzt = new.ersetzt and w.id <> new.id and w.status in ('Entwurf', 'Unterschrieben')) then
    raise exception 'Für diesen stornierten Schein gibt es schon einen Ersatzschein' using errcode = '23505';
  end if;
  return new;
end;
$$;

revoke all on function app.schein_ersetzt_pruefen() from public, anon, authenticated;

drop trigger if exists work_sheets_ersetzt on public.work_sheets;
create trigger work_sheets_ersetzt
  before insert or update of ersetzt, status on public.work_sheets
  for each row execute function app.schein_ersetzt_pruefen();

-- ---------------------------------------------------------------------------
-- 2. Anlegen mit Verweis
-- ---------------------------------------------------------------------------

create or replace function public.schein_speichern(
  p_id uuid,
  p_kopf jsonb,
  p_zeiten jsonb,
  p_material jsonb,
  p_fotos jsonb
) returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  alt public.work_sheets;
  neu public.work_sheets;
  zeile jsonb;
  lauf integer;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  select * into alt from public.work_sheets where id = p_id;

  if alt.id is null then
    -- Anlegen. Der Zeilenschutz besteht darauf, dass es ein Entwurf auf den
    -- eigenen Namen ist; hier wird nichts zusaetzlich geprueft, sondern nur
    -- gesetzt, was der Aufrufer nicht selbst bestimmen darf.
    neu := jsonb_populate_record(null::public.work_sheets, p_kopf);
    insert into public.work_sheets (
      id, company_id, project_number, customer_id, customer_name, address,
      datum, status, abrechnung, notizen, erstellt_von_uid, erstellt_von_name,
      ersetzt
    ) values (
      p_id, betrieb, neu.project_number, neu.customer_id, neu.customer_name,
      neu.address, neu.datum, 'Entwurf', neu.abrechnung, neu.notizen,
      auth.uid(), neu.erstellt_von_name,
      -- NEU (P4): der stornierte Schein, den dieser ersetzt. Geprüft vom Auslöser.
      neu.ersetzt
    );
  elsif p_kopf is not null then
    /*
      `jsonb_populate_record` mit der ALTEN Zeile als Grundlage: was in
      `p_kopf` nicht vorkommt, behaelt seinen Wert. So ist ein Teilschreiben
      moeglich, ohne dass jedes Feld einzeln abgefragt werden muss.
    */
    neu := jsonb_populate_record(alt, p_kopf);
    update public.work_sheets set
      project_number = neu.project_number,
      customer_id    = neu.customer_id,
      customer_name  = neu.customer_name,
      address        = neu.address,
      datum          = neu.datum,
      abrechnung     = neu.abrechnung,
      notizen        = neu.notizen
     where id = p_id;
  end if;

  if p_zeiten is not null then
    delete from public.work_sheet_hours where work_sheet_id = p_id;
    lauf := 0;
    for zeile in select * from jsonb_array_elements(p_zeiten) loop
      insert into public.work_sheet_hours (
        company_id, work_sheet_id, position, datum, mitarbeiter,
        von, bis, pause_min, minuten, taetigkeit, helfer
      ) values (
        betrieb, p_id, lauf, (zeile ->> 'datum')::date, zeile ->> 'mitarbeiter',
        (nullif(zeile ->> 'von', ''))::time, (nullif(zeile ->> 'bis', ''))::time,
        coalesce((zeile ->> 'pause_min')::integer, 0),
        (zeile ->> 'minuten')::integer, zeile ->> 'taetigkeit',
        coalesce((zeile ->> 'helfer')::boolean, false)
      );
      lauf := lauf + 1;
    end loop;
  end if;

  if p_material is not null then
    delete from public.work_sheet_material where work_sheet_id = p_id;
    lauf := 0;
    for zeile in select * from jsonb_array_elements(p_material) loop
      insert into public.work_sheet_material (
        company_id, work_sheet_id, position, name, menge, einheit, material_id
      ) values (
        betrieb, p_id, lauf, zeile ->> 'name',
        (zeile ->> 'menge')::numeric, nullif(zeile ->> 'einheit', ''),
        -- Nur ein Verweis: was keine Kennung ist, wird weggelassen, statt den
        -- ganzen Schein am Speichern zu hindern.
        case when zeile ->> 'material_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then (zeile ->> 'material_id')::uuid end
      );
      lauf := lauf + 1;
    end loop;
  end if;

  if p_fotos is not null then
    delete from public.work_sheet_photos where work_sheet_id = p_id;
    lauf := 0;
    for zeile in select * from jsonb_array_elements(p_fotos) loop
      insert into public.work_sheet_photos (
        company_id, work_sheet_id, position, pfad, hash, bytes, geraet_zeit
      ) values (
        betrieb, p_id, lauf, zeile ->> 'pfad', zeile ->> 'hash',
        (zeile ->> 'bytes')::bigint,
        -- Als ISO-Zeichenkette, weil `objektAlsZeile` sie so liefert: die
        -- Umrechnung von Millisekunden steht an EINER Stelle, nicht an zweien.
        (zeile ->> 'geraet_zeit')::timestamptz
      );
      lauf := lauf + 1;
    end loop;
  end if;

  return p_id;
end;
$$;


revoke all on function public.schein_speichern(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.schein_speichern(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Der Ersatz erbt die Verrechnung — im Kern aus 20261116010100
-- ---------------------------------------------------------------------------
--
-- Rumpf wie in 20261116010100_scheine_unverrechnet.sql; neu ist die Kette
-- `ersatz`: ein Schein, dessen Vorgänger (oder dessen Vorgänger …) auf einer
-- gültigen Rechnung steht, gilt als verrechnet. Nur die Abdeckung vererbt
-- sich: Pauschale und abgerechneter Zeitraum hängen an Baustelle und Tag, die
-- der Ersatz ohnehin mit seinem Vorgänger teilt — er erfüllt sie selbst.

create or replace function app.scheine_verrechnet_kern(p_betrieb text, p_ids uuid[] default null)
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with recursive s as (
    select w.id, w.status, w.datum,
           lower(regexp_replace(btrim(coalesce(w.project_number, '')), '^pr-', '', 'i')) as nr
      from public.work_sheets w
     where w.company_id = p_betrieb
       and (p_ids is null or w.id = any (p_ids))
       and (p_ids is not null or w.status = 'Unterschrieben')
  ),
  gueltig as (
    select i.id, coalesce(i.art, 'einzel') as art, i.leistung_von,
           coalesce(i.leistung_bis, i.invoice_date) as bis,
           lower(regexp_replace(btrim(coalesce(i.project_number, '')), '^pr-', '', 'i')) as nr
      from public.invoices i
     where i.company_id = p_betrieb
       and i.payment_status is distinct from 'Storniert'
  ),
  abgedeckt as (
    select c.ziel_id as id
      from public.invoice_coverage c
      join gueltig g on g.id = c.invoice_id
     where c.company_id = p_betrieb and c.art = 'work_sheet'
  ),
  -- NEU (P4): die Ersatzscheine verrechneter Scheine, über jede Stufe.
  ersatz as (
    select w.id from public.work_sheets w
     where w.company_id = p_betrieb and w.ersetzt in (select id from abgedeckt)
    union
    select w.id from public.work_sheets w join ersatz e on w.ersetzt = e.id
     where w.company_id = p_betrieb
  ),
  pauschale as (
    select s.id
      from s
     where s.status = 'Unterschrieben' and s.nr <> ''
       and exists (select 1 from public.projects p
                    where p.company_id = p_betrieb
                      and p.billing_mode in ('Pauschal', 'Einheitspreis')
                      and lower(regexp_replace(btrim(coalesce(p.project_number, '')), '^pr-', '', 'i')) = s.nr)
       and exists (select 1 from gueltig g where g.nr = s.nr and g.art not in ('anzahlung', 'teil'))
  ),
  zeitraum as (
    select s.id
      from s
     where s.status = 'Unterschrieben' and s.nr <> '' and s.datum is not null
       and not exists (select 1 from public.work_sheet_material m
                        where m.work_sheet_id = s.id and m.menge > 0 and btrim(coalesce(m.name, '')) <> '')
       and exists (select 1 from gueltig g
                    where g.nr = s.nr and g.art <> 'anzahlung' and g.bis is not null
                      and s.datum <= g.bis and (g.leistung_von is null or s.datum >= g.leistung_von)
                      and exists (select 1 from public.invoice_coverage c
                                   where c.invoice_id = g.id
                                     and c.art in ('time_entry', 'material_order', 'work_sheet')))
  )
  select s.id from s where s.id in (select id from abgedeckt) or s.id in (select id from ersatz)
  union
  select id from pauschale
  union
  select id from zeitraum
$$;

revoke all on function app.scheine_verrechnet_kern(text, uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Vor dem Storno: ist der Schein verrechnet, und wo?
-- ---------------------------------------------------------------------------

/*
  Für den Storno-Dialog. Stornieren darf die Führung — auch die
  Projektleitung, die Rechnungen sonst nicht sieht. Sie erfährt, DASS der
  Schein verrechnet ist (sonst wäre der Hinweis keiner); welche Rechnung,
  sieht nur, wer Rechnungen lesen darf (Buchhaltung, Spitze, Projektleitung
  mit Freigabe „Rechnungen lesen“) — dieselbe Grenze wie bei den Rechnungen
  selbst.

  `grund`: 'rechnung' (steht auf einer gültigen Rechnung, auch über einen
  Vorgänger), 'abgerechnet' (Pauschale oder abgerechneter Zeitraum — der
  Schein steht auf keiner Rechnung, sein Inhalt ist aber abgerechnet) oder
  null (nicht verrechnet).
*/
create or replace function public.schein_verrechnung(p_id uuid)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := coalesce(app.arbeitsbetrieb(), app.lesebetrieb());
  kette uuid[];
  rechnungen jsonb;
  verrechnet boolean;
begin
  if betrieb is null or not (coalesce(app.ist_fuehrung(), false) or coalesce(app.ist_buch_oder_spitze(), false)) then
    raise exception 'Die Verrechnung eines Scheins sieht nur die Leitung und die Buchhaltung' using errcode = '42501';
  end if;
  if not exists (select 1 from public.work_sheets w where w.id = p_id and w.company_id = betrieb) then
    raise exception 'Diesen Schein gibt es nicht' using errcode = 'P0002';
  end if;

  -- Der Schein und seine Vorgänger: ihre Rechnung gilt auch für ihn.
  with recursive vor as (
    select w.id, w.ersetzt from public.work_sheets w where w.id = p_id and w.company_id = betrieb
    union
    select w.id, w.ersetzt from public.work_sheets w join vor v on w.id = v.ersetzt where w.company_id = betrieb
  )
  select array_agg(id) into kette from vor;

  select coalesce(jsonb_agg(jsonb_build_object('nummer', i.invoice_number, 'zahlung', i.payment_status)
                            order by i.invoice_date, i.invoice_number), '[]'::jsonb)
    into rechnungen
    from public.invoices i
   where i.company_id = betrieb
     and i.payment_status is distinct from 'Storniert'
     and exists (select 1 from public.invoice_coverage c
                  where c.invoice_id = i.id and c.art = 'work_sheet' and c.ziel_id = any (kette));

  verrechnet := exists (select 1 from app.scheine_verrechnet_kern(betrieb, array[p_id]) k);

  return jsonb_build_object(
    'verrechnet', verrechnet,
    'grund', case when jsonb_array_length(rechnungen) > 0 then 'rechnung'
                  when verrechnet then 'abgerechnet' end,
    'rechnungen', case when coalesce(app.ist_buch_oder_spitze(), false) or coalesce(app.darf_rechnungen_lesen(), false)
                       then rechnungen end);
end;
$$;

revoke all on function public.schein_verrechnung(uuid) from public, anon;
grant execute on function public.schein_verrechnung(uuid) to authenticated;
