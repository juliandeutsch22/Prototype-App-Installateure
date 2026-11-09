/*
  VIER LÜCKEN IN BESTEHENDEN ABLÄUFEN (Befunde 09.11.2026).

  1. Eine gelöschte Baustelle gibt ihre eingeplanten Wartungen frei.
  2. Das persönliche Kalender-Abo liefert nur bei eingeschalteter
     Einsatzplanung.
  3. Die Nachkalkulation liest, was das Lager für eine Baustelle ausgegeben
     hat — über die ganze Laufzeit, nicht nur seit der letzten Rechnung.
  4. Ein Eingang, dessen Angebot im Papierkorb liegt, lässt sich wieder
     öffnen.

  Jede ersetzte Funktion in voller Fassung, nur die genannte Stelle
  geändert; die Rechte wie zuletzt. Altdaten bleiben, wie sie sind: eine
  Wartung, deren Baustelle schon vor dieser Migration gelöscht wurde, behält
  ihren toten Verweis — „Baustelle anlegen“ legt dann eine neue an (2b).
*/

-- ---------------------------------------------------------------------------
-- 1a. Die gelöschte Baustelle gibt die Wartung frei
-- ---------------------------------------------------------------------------

/*
  `wartungen.offene_baustelle` ist eine Nummer, kein Fremdschlüssel — wie
  jede Baustellennummer im Bestand, weil Buchungen offline auf eine Nummer
  geschrieben werden, die es noch nicht gibt. Bisher blieb die Nummer nach
  dem Löschen der Baustelle stehen: die Wartung galt als eingeplant auf eine
  Baustelle, die es nicht mehr gab. Sie fiel damit aus „Wartung fällig“ auf
  der Startseite und aus „fällig ohne Baustelle“, und „Baustelle anlegen“
  stand nicht mehr da.

  VOR dem Löschen, nicht danach: die alten Nummern der Baustelle
  (`baustelle_alte_nummern`) gehen mit ihr (`on delete cascade`), und eine
  Wartung kann eine davon tragen, wenn sie von Hand eingetragen wurde. Die
  Nummer gilt mit und ohne „PR-“ und ohne Rücksicht auf Gross- und
  Kleinschreibung, wie überall (`app.baustelle_wie_js`). Gibt es eine andere
  Baustelle mit derselben Nummer, bleibt der Verweis — er zeigt dann auf sie.

  Beim Löschen eines ganzen Betriebs nicht: dort gehen die Wartungen selbst.
*/
create or replace function app.wartung_baustelle_geloescht() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  formen text[];
begin
  if current_setting('app.betrieb_loeschung', true) = old.company_id then
    return old;
  end if;
  select coalesce(array_agg(distinct app.baustelle_wie_js(n.nummer)), '{}'::text[]) into formen
    from (select old.project_number as nummer
          union all
          select a.nummer from public.baustelle_alte_nummern a where a.project_id = old.id) n
   where nullif(app.baustelle_wie_js(n.nummer), '') is not null;
  if cardinality(formen) = 0 then
    return old;
  end if;
  update public.wartungen w
     set offene_baustelle = null
   where w.company_id = old.company_id
     and nullif(w.offene_baustelle, '') is not null
     and app.baustelle_wie_js(w.offene_baustelle) = any(formen)
     and not exists (
       select 1 from public.projects p
        where p.company_id = old.company_id
          and p.id <> old.id
          and app.baustelle_wie_js(p.project_number) = app.baustelle_wie_js(w.offene_baustelle));
  return old;
end;
$$;

revoke all on function app.wartung_baustelle_geloescht() from public, anon, authenticated;

drop trigger if exists projects_wartung_freigeben on public.projects;
create trigger projects_wartung_freigeben
  before delete on public.projects
  for each row execute function app.wartung_baustelle_geloescht();

-- ---------------------------------------------------------------------------
-- 1b. Wartung einplanen: eine fehlende Baustelle wird neu angelegt
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in `20261108300000_liegenschaften.sql`. Neu an der eingeplanten
  Baustelle:
  - sie gilt auch in der anderen Schreibweise der Nummer (mit oder ohne
    „PR-“) — zurück kommt die Nummer, wie die Baustelle sie trägt;
  - fehlt sie (gelöscht, bevor 1a das nachzog), bricht „Baustelle anlegen“
    nicht mehr mit „Die eingeplante Baustelle fehlt“ ab, sondern legt eine
    neue an, wie bei einer Wartung ohne Einplanung. Sonst bliebe die Wartung
    für immer ohne Einsatz: der Knopf stand dann ja auch nicht mehr da.
*/
create or replace function public.wartung_einplanen(p_wartung uuid, p_nummer text, p_praefix text, p_faellig date)
returns text language plpgsql security definer set search_path = '' as $$
declare w public.wartungen; k public.customers; nummer text; jahr integer; lfd bigint; mit_liegenschaft boolean;
        vorhanden text;
begin
  if app.ist_fuehrung() is not true then
    raise exception 'Wartungen einplanen darf nur die Führung' using errcode = '42501';
  end if;
  select * into w from public.wartungen where id = p_wartung
    and (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb())) for update;
  if w.id is null then raise exception 'Wartung nicht gefunden' using errcode = 'P0002'; end if;
  -- Ein alter Dialog darf nach Erledigung nicht gleich den nächsten Einsatz anlegen.
  if w.faellig_am is distinct from p_faellig then
    raise exception 'Der Wartungstermin wurde geändert. Bitte die Wartung neu öffnen.' using errcode = '40001';
  end if;
  if nullif(w.offene_baustelle, '') is not null then
    select p.project_number into vorhanden from public.projects p
     where p.company_id = w.company_id and p.project_number = w.offene_baustelle;
    if vorhanden is null then
      select p.project_number into vorhanden from public.projects p
       where p.company_id = w.company_id
         and app.baustelle_wie_js(p.project_number) = app.baustelle_wie_js(w.offene_baustelle)
       order by p.project_number
       limit 1;
    end if;
    if vorhanden is not null then
      return vorhanden;
    end if;
    -- Die eingeplante Baustelle gibt es nicht mehr: weiter wie ohne Einplanung.
  end if;
  nummer := nullif(btrim(p_nummer), '');
  if nummer is null then
    jahr := extract(year from now() at time zone 'Europe/Vienna');
    lfd := public.naechste_nummer('projects', jahr, 0, null);
    nummer := case when coalesce(p_praefix, '') = '' then '' else p_praefix || '-' end
      || jahr || '-' || lpad(lfd::text, greatest(4, length(lfd::text)), '0');
  end if;
  select * into k from public.customers where id = w.customer_id and company_id = w.company_id;
  -- M02c: Liegenschaft und Top der Wartung, solange das Modul an ist.
  mit_liegenschaft := w.liegenschaft_id is not null and app.modul_aktiv(w.company_id, 'kunden.liegenschaften');
  insert into public.projects(company_id, project_number, customer_id, customer_name, address, description, status,
                              liegenschaft_id, top_id)
    values(w.company_id, nummer, w.customer_id, coalesce(k.name, w.customer_name),
      coalesce(nullif(btrim(w.address), ''), k.address),
      'Wartung: ' || btrim(w.anlage) || coalesce(' · ' || nullif(btrim(w.hinweis), ''), ''), 'Aktiv',
      case when mit_liegenschaft then w.liegenschaft_id end, case when mit_liegenschaft then w.top_id end);
  update public.wartungen set offene_baustelle = nummer where id = w.id;
  return nummer;
end; $$;
revoke all on function public.wartung_einplanen(uuid, text, text, date) from public, anon;
grant execute on function public.wartung_einplanen(uuid, text, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Das persönliche Kalender-Abo nur mit Einsatzplanung
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in `20261004400000_gesamtplan_abo.sql`. Neu: auch das EIGENE
  Abo liefert nur, solange die Einsatzplanung an ist (dieselbe Regel wie die
  App, `app.modul_aktiv`). Beendet wird es unter „Mein Einsatzplan“ — und
  der ist bei abgeschalteter Einsatzplanung zu. Bisher gingen Einsätze mit
  Kundenadresse, Ansprechpartner und Telefon dann weiter an den Kalender
  hinaus, ohne dass jemand sie in der App noch sah oder abbestellen konnte.

  Anders als der Gesamtplan wird das eigene Abo dabei nicht gelöscht: es
  ruht und liefert wieder, sobald die Einsatzplanung wieder an ist — wie
  „Mein Einsatzplan“ selbst. Ein gelöschtes müsste jede Person auf jedem
  Telefon neu einrichten; das Abschalten eines Moduls ist oft nur eine
  Pause. Wer es nicht mehr will, beendet es dann dort.
*/
create or replace function public.kalender_abruf(p_schluessel_hash text) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  abo public.kalender_abos;
  person public.users;
  von date := (now() at time zone 'Europe/Vienna')::date - 62;
  bis date := (now() at time zone 'Europe/Vienna')::date + 366;
  einsaetze jsonb;
  baustellen jsonb;
  termine jsonb;
begin
  select * into abo from public.kalender_abos a where a.schluessel_hash = p_schluessel_hash;
  if abo.id is null then
    return null;
  end if;
  select * into person from public.users u where u.id = abo.user_id and u.company_id = abo.company_id;
  if person.id is null or person.active is distinct from true
     or app.betrieb_ruht(abo.company_id)
     or not exists (select 1 from public.companies c
                     where c.id = abo.company_id and c.kalender_abo_erlaubt) then
    return null;
  end if;
  if abo.art = 'gesamt' and not app.sieht_gesamtplan(person.id) then
    return null;
  end if;
  if abo.art = 'eigen' and not app.modul_aktiv(abo.company_id, 'einsatzplanung') then
    return null;
  end if;

  update public.kalender_abos a set zuletzt_abgerufen = now() where a.id = abo.id;

  if abo.art = 'gesamt' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'datum', g.date,
             'baustelle', g.project_number,
             'kunde', g.customer_name,
             'adresse', g.address,
             'leute', g.leute)
             order by g.date, g.project_number), '[]'::jsonb)
      into baustellen
      from (
        select e.date, e.project_number, b.customer_name, b.address,
               jsonb_agg(jsonb_build_object(
                 'name', coalesce(u.name, e.user_name),
                 'helfer', coalesce(e.as_helper, false),
                 'einstufung', u.einstufung,
                 'von', to_char(e.zeit_von, 'HH24:MI'),
                 'bis', to_char(e.zeit_bis, 'HH24:MI'))
                 order by coalesce(u.name, e.user_name)) as leute
          from public.assignments e
          left join public.projects b
            on b.company_id = e.company_id and b.project_number = e.project_number
          left join public.users u on u.id = e.user_id
         where e.company_id = abo.company_id
           and e.date between von and bis
         group by e.date, e.project_number, b.customer_name, b.address
      ) g;

    select coalesce(jsonb_agg(app.termin_fuers_abo(t) order by t.datum, t.zeit_von nulls first), '[]'::jsonb)
      into termine
      from public.termine t
     where t.company_id = abo.company_id
       and t.datum between von and bis;

    return jsonb_build_object(
      'art', 'gesamt',
      'kennung', person.id,
      'betrieb', (select c.name from public.companies c where c.id = abo.company_id),
      'baustellen', baustellen,
      'termine', termine);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'datum', e.date,
           'baustelle', e.project_number,
           'von', to_char(e.zeit_von, 'HH24:MI'),
           'bis', to_char(e.zeit_bis, 'HH24:MI'),
           'helfer', coalesce(e.as_helper, false),
           'kommentar', e.comment,
           'kunde', b.customer_name,
           'adresse', b.address,
           'ansprechpartner', b.contact_name,
           'telefon', b.contact_phone)
           order by e.date, e.zeit_von nulls first, e.project_number), '[]'::jsonb)
    into einsaetze
    from public.assignments e
    left join public.projects b
      on b.company_id = e.company_id and b.project_number = e.project_number
   where e.company_id = abo.company_id
     and e.user_id = abo.user_id
     and e.date between von and bis;

  select coalesce(jsonb_agg(app.termin_fuers_abo(t) order by t.datum, t.zeit_von nulls first), '[]'::jsonb)
    into termine
    from public.termine t
   where t.company_id = abo.company_id
     and t.datum between von and bis
     and (abo.user_id = any(t.teilnehmer)
          or (t.project_number is not null and exists (
                select 1 from public.assignments a
                 where a.company_id = t.company_id and a.date = t.datum
                   and a.project_number = t.project_number and a.user_id = abo.user_id)));

  return jsonb_build_object(
    'art', 'eigen',
    'kennung', person.id,
    'betrieb', (select c.name from public.companies c where c.id = abo.company_id),
    'einsaetze', einsaetze,
    'termine', termine);
end;
$$;

revoke all on function public.kalender_abruf(text) from public, anon, authenticated;
grant execute on function public.kalender_abruf(text) to service_role;

/*
  Rumpf wie in `20261004400000_gesamtplan_abo.sql`. Neu: ein eigenes Abo
  legt nur an, wer „Mein Einsatzplan“ hat — ein Link, der nichts liefert,
  wäre eine Einrichtung ohne Wirkung.
*/
create or replace function public.kalender_abo_anlegen(p_art text default 'eigen') returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users;
  schluessel text;
begin
  if p_art is null or p_art not in ('eigen', 'gesamt') then
    raise exception 'Unbekannte Art: % — erwartet „eigen" oder „gesamt"', p_art using errcode = '22023';
  end if;
  select * into ich from public.users u where u.id = auth.uid();
  if ich.id is null or ich.active is distinct from true
     or not app.betriebsmitglied(ich.company_id) then
    raise exception 'Kein aktives Konto in diesem Betrieb' using errcode = '42501';
  end if;
  if app.betrieb_ruht(ich.company_id) then
    raise exception 'Der Betrieb ist deaktiviert' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies c
                  where c.id = ich.company_id and c.kalender_abo_erlaubt) then
    raise exception 'Das Kalender-Abo ist in diesem Betrieb nicht eingeschaltet' using errcode = '42501';
  end if;
  if p_art = 'gesamt' and not app.sieht_gesamtplan(ich.id) then
    raise exception 'Den ganzen Einsatzplan abonniert nur, wer die Einsatzplanung sieht' using errcode = '42501';
  end if;
  if p_art = 'eigen' and not app.modul_aktiv(ich.company_id, 'einsatzplanung') then
    raise exception 'Die Einsatzplanung ist in diesem Betrieb ausgeschaltet (Einstellungen → Module)' using errcode = '42501';
  end if;

  -- 32 Zufallsbytes, für eine Adresse lesbar (Base64 ohne „+/=“).
  schluessel := translate(encode(extensions.gen_random_bytes(32), 'base64'), E'+/=\n', '-_');
  delete from public.kalender_abos a where a.user_id = ich.id and a.art = p_art;
  insert into public.kalender_abos (company_id, user_id, art, schluessel_hash)
  values (ich.company_id, ich.id, p_art, encode(sha256(convert_to(schluessel, 'UTF8')), 'hex'));
  return schluessel;
end;
$$;

revoke all on function public.kalender_abo_anlegen(text) from public, anon;
grant execute on function public.kalender_abo_anlegen(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Ausgegebenes Material über die ganze Laufzeit — für die Nachkalkulation
-- ---------------------------------------------------------------------------

/*
  `ausgegebenes_material` beantwortet die Frage der RECHNUNG: was ist seit
  der letzten Rechnung ausgegeben und noch nicht verrechnet. Die
  Nachkalkulation fragt etwas anderes — was hat die Baustelle das Material
  gekostet —, und dafür zählt alles, was das Lager je für sie ausgegeben
  hat, auch vor der Schlussrechnung. Bisher kannte sie nur die Scheine: eine
  Regiebaustelle, deren Material über das Lager lief und deren Rechnung es
  aus „ausgegeben“ übernahm, stand mit Erlös für das Material und Kosten
  null da.

  Dieselben Belege wie dort (abgeholte Anforderungen, Retouren negativ,
  eingeladene Rüstlisten ohne den angeforderten Teil), ohne Rechnungsgrenze,
  für mehrere Baustellen in einem Zug — die Nachkalkulation rechnet bis zu
  25 auf einmal. `baustelle` ist die Nummer ohne „PR-“, in Kleinschrift
  (wie `normProjectNumber` der App). Dieselbe Berechtigung: wer Rechnungen
  schreibt — die Nachkalkulation sieht nur die Spitze.
*/
create or replace function public.ausgegebenes_material_gesamt(p_baustellen text[])
  returns table(baustelle text, art text, datum date, material_id uuid, name text, einheit text, menge numeric)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  betrieb text := app.betrieb();
  schluessel text[];
begin
  if not (app.betriebsmitglied(betrieb) and app.ist_buch_oder_spitze()) then
    raise exception 'Ausgegebenes Material sieht nur, wer Rechnungen schreibt' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct lower(regexp_replace(trim(b), '^PR-', '', 'i'))), '{}'::text[]) into schluessel
    from unnest(coalesce(p_baustellen, '{}'::text[])) b
   where trim(coalesce(b, '')) <> '';
  if cardinality(schluessel) = 0 then
    return;
  end if;

  return query
  with ausgaben as (
    select lower(regexp_replace(trim(coalesce(o.project_number, '')), '^PR-', '', 'i')) as baustelle,
           'anforderung'::text as art,
           (coalesce(o.erledigt_am, o.updated_at) at time zone 'Europe/Vienna')::date as datum,
           o.material_id, o.material_name as name, m.unit as einheit, o.quantity as menge
      from public.material_orders o
      left join public.materials m on m.id = o.material_id and m.company_id = o.company_id
     where o.company_id = betrieb
       and o.transaction_type = 'order'
       and o.status = 'Erledigt'
       and lower(regexp_replace(trim(coalesce(o.project_number, '')), '^PR-', '', 'i')) = any(schluessel)
    union all
    select lower(regexp_replace(trim(coalesce(o.project_number, '')), '^PR-', '', 'i')),
           'retoure'::text,
           (o.created_at at time zone 'Europe/Vienna')::date,
           o.material_id, o.material_name, m.unit, -o.quantity
      from public.material_orders o
      left join public.materials m on m.id = o.material_id and m.company_id = o.company_id
     where o.company_id = betrieb
       and o.transaction_type = 'return'
       and lower(regexp_replace(trim(coalesce(o.project_number, '')), '^PR-', '', 'i')) = any(schluessel)
    union all
    -- Ohne den Teil, den eine Anforderung bringt — der steht oben als „anforderung“ (M5).
    select lower(regexp_replace(trim(k.project_number), '^PR-', '', 'i')),
           'ruestliste'::text, k.date,
           p.material_id, p.name, coalesce(nullif(p.einheit, ''), m.unit),
           greatest(p.menge - app.ruest_angefordert(k.id, p.id), 0)
      from public.einsatz_material k
      join public.einsatz_material_positionen p on p.einsatz_material_id = k.id
      left join public.materials m on m.id = p.material_id and m.company_id = k.company_id
     where k.company_id = betrieb
       and lower(regexp_replace(trim(k.project_number), '^PR-', '', 'i')) = any(schluessel)
       and k.geladen ? p.id::text
  )
  select a.baustelle, a.art, a.datum, a.material_id, a.name, a.einheit, a.menge
    from ausgaben a
   where a.menge <> 0
   order by a.baustelle, a.datum, a.name;
end;
$$;

revoke all on function public.ausgegebenes_material_gesamt(text[]) from public, anon;
grant execute on function public.ausgegebenes_material_gesamt(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Wieder öffnen, wenn das Angebot im Papierkorb liegt
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in `20261107300000_auftragseingang.sql`. Ein übernommener
  Eingang, dessen Angebot VERWORFEN ist (M01d: im Papierkorb, noch nicht
  endgültig gelöscht), war weder offen noch wieder zu öffnen — erst das
  endgültige Löschen im Papierkorb gab ihn frei. Jetzt gilt das verworfene
  Angebot wie ein gelöschtes: der Eingang wird wieder offen, der Verweis
  wird geleert — derselbe Stand, den das Löschen hinterlässt
  (`on delete set null`). Ein offener Eingang zeigt auf nichts; zeigte er
  weiter auf das verworfene Angebot, hätte er nach „Angebot anlegen“ oder
  „Baustelle anlegen“ zwei Ziele.

  Holt jemand das Angebot danach aus dem Papierkorb, ist es ein Entwurf
  ohne Eingang; der Eingang ist offen und kann ein neues Angebot oder eine
  Baustelle werden. Welcher Weg gilt, entscheidet das Büro.
*/
create or replace function public.eingang_wieder_oeffnen(p_eingang uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  e public.auftragseingaenge;
  angebot_verworfen boolean := false;
begin
  if app.hat_rolle(array['Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator']) is not true then
    raise exception 'Eingänge bearbeitet nur das Büro' using errcode = '42501';
  end if;
  e := app.eingang_sperren(p_eingang);
  if e.stand = 'offen' then
    return;
  end if;
  if e.stand = 'uebernommen' and e.project_id is null and e.quote_id is not null then
    angebot_verworfen := exists (select 1 from public.quotes q
                                  where q.id = e.quote_id and q.company_id = e.company_id and q.status = 'Verworfen');
  end if;
  if e.stand = 'uebernommen' and (e.project_id is not null or (e.quote_id is not null and not angebot_verworfen)) then
    raise exception 'Der Eingang % ist übernommen und belegt, woher % kam — er bleibt, wie er ist', e.nummer,
      case when e.project_id is not null then 'die Baustelle' else 'das Angebot' end
      using errcode = '55000';
  end if;
  update public.auftragseingaenge
     set stand = 'offen',
         abgelehnt_grund = null, abgelehnt_am = null, abgelehnt_von_uid = null, abgelehnt_von_name = null,
         uebernommen_am = null, uebernommen_von_uid = null, uebernommen_von_name = null,
         quote_id = case when angebot_verworfen then null else quote_id end
   where id = e.id;
end;
$$;

revoke all on function public.eingang_wieder_oeffnen(uuid) from public, anon;
grant execute on function public.eingang_wieder_oeffnen(uuid) to authenticated;
