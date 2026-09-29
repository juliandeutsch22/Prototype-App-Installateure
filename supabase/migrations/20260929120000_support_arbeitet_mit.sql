/*
  DER SUPPORT ARBEITET AUCH DORT MIT, WO DIE APP ÜBER DEN SERVER GEHT
  (offene Punkte B2, Prüflauf P3-14).

  Mit der Stufe „mitarbeiten" ändert der Support Kunden, Baustellen und
  Stammdaten direkt. Was die App aber über eine Datenbankfunktion erledigt,
  holte den Betrieb aus dem Anmeldekonto (`app.betrieb()`) — und ein
  Plattformkonto hat keinen. Einsatz speichern, Rüstliste, Angebot,
  Angebots- und Baustellennummer, Kunden übernehmen und Katalog einspielen
  scheiterten deshalb mit „Nicht angemeldet".

  JETZT FRAGEN SIE `app.arbeitsbetrieb()`. Für jedes Betriebskonto ist das
  genau `app.betrieb()`, es ändert sich also nichts. Für ein Plattformkonto
  ist es der Betrieb des gerade begonnenen Einblicks (`app.einblick_aktuell`,
  B3) — und nur, wenn dort „mitarbeiten" gilt. Mit „ansehen", ohne Einblick
  oder nach Widerruf und Ablauf bleibt es leer, und die Funktionen weisen ab
  wie bisher.

  ALLES ÜBRIGE PRÜFT WEITER, WAS ES BISHER PRÜFTE. Die Funktionen laufen
  (bis auf die Nummernvergabe) mit den Rechten des Aufrufers; Zeilenschutz,
  Rollen und der Riegel `app.support_schreibt_nicht` gelten für den Support
  genauso wie bei seinen direkten Änderungen. Die Rümpfe sind Wort für Wort
  ihre letzten Fassungen, bis auf die Zeile mit dem Betrieb und drei
  benannte Stellen:
    - `naechste_nummer` gibt dem Support keine RECHNUNGSnummer (Begründung
      dort);
    - `naechste_nummern` fragt statt `app.betriebsmitglied` direkt, ob es
      einen Arbeitsbetrieb gibt — für Betriebskonten dasselbe;
    - `kunden_einspielen` lässt neben dem Mitglied den schreibenden Support
      durch.
  Dazu `app.materialfelder_geschuetzt`: der Einkaufspreis am Artikel fragt
  `app.ist_spitze()` statt der Rolle im Token, wie die Tabelle
  `material_einkaufspreise` selbst (B1). Ohne das käme der Support zwar an
  den Katalogimport heran und scheiterte dann an jedem Preis. Und
  `datanorm_laeufe.angelegt_von` (Abschnitt 5): der Lauf eines
  Plattformkontos scheiterte schon am Fremdschlüssel.

  BEWUSST NICHT UMGEBAUT: alles, was Zeitbuchungen, Urlaube oder Scheinfotos
  schreibt oder liest — Scheine, Rechnungen und Stornos, Baustellennummer
  ändern, Urlaub, Krankmeldungen, Betriebsurlaub, Wochenplan mit
  Abwesenheiten. Diese Tabellen bleiben dem Support verschlossen
  (`app.support_niemals`, `20260921100000_support_mitarbeiten.sql`); eine
  Funktion, die sie für ihn doch beschriebe, wäre die Hintertür. Ebenso der
  Datenauszug des ganzen Betriebs (`betrieb_auszug`) — er ist der Weg, alles
  mitzunehmen, und den geht nur der Betrieb selbst. Die Supportleiste nennt
  diese Grenze.
*/

-- ---------------------------------------------------------------------------
-- 1. Der Arbeitsbetrieb
-- ---------------------------------------------------------------------------

/*
  Mit Definer-Rechten, weil `app.einblick_aktuell` nur ihnen offen steht und
  `support_freigaben` selbst einen Zeilenschutz trägt. Heraus kommt eine
  Betriebskennung, die der Aufrufer ohnehin kennt — seine eigene oder die
  seines Einblicks.

  EIN PLATTFORMKONTO NIMMT NIE DEN BETRIEB AUS DEM TOKEN. Es trägt keinen
  (`app.plattform_anspruch` räumt ihn ab), und sollte doch einer darin
  stehen, gälte er hier nicht.
*/
create or replace function app.arbeitsbetrieb() returns text
  language sql stable
  security definer
  set search_path = ''
as $$
  select case
    when app.ist_plattform() then (
      select f.company_id
        from public.support_freigaben f
       where f.id = app.einblick_aktuell()
         and f.stufe = 'mitarbeiten')
    else app.betrieb()
  end
$$;

-- Die Funktionen unten laufen grossteils mit den Rechten des Aufrufers und
-- rufen sie von dort.
revoke all on function app.arbeitsbetrieb() from public, anon;
grant execute on function app.arbeitsbetrieb() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Einsatz und Rüstliste
-- ---------------------------------------------------------------------------

create or replace function public.einsatz_speichern(
  p_datum date,
  p_baustelle text,
  p_zeilen jsonb
) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  zeile jsonb;
  anzahl integer := 0;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  delete from public.assignments
   where company_id = betrieb and date = p_datum and project_number = p_baustelle;

  for zeile in select * from jsonb_array_elements(p_zeilen) loop
    insert into public.assignments (
      company_id, date, project_number, user_id, user_name, as_helper, comment, created_by
    ) values (
      betrieb, p_datum, p_baustelle,
      (zeile ->> 'user_id')::uuid, zeile ->> 'user_name',
      coalesce((zeile ->> 'as_helper')::boolean, false),
      zeile ->> 'comment', zeile ->> 'created_by'
    );
    anzahl := anzahl + 1;
  end loop;

  update public.einsatz_material
     set uids = coalesce(
           (select array_agg((z ->> 'user_id')::uuid) from jsonb_array_elements(p_zeilen) z),
           '{}'::uuid[])
   where company_id = betrieb and date = p_datum and project_number = p_baustelle;

  return anzahl;
end;
$$;

create or replace function public.laden_umschalten(
  p_datum date,
  p_baustelle text,
  p_position text,
  p_an boolean,
  p_von text
) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  getroffen integer;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  update public.einsatz_material
     set geladen = case
           when p_an then geladen || jsonb_build_object(
             p_position,
             jsonb_build_object('von', p_von, 'am', (extract(epoch from now()) * 1000)::bigint))
           else geladen - p_position
         end
   where company_id = betrieb and date = p_datum and project_number = p_baustelle;

  get diagnostics getroffen = row_count;
  if getroffen = 0 then
    raise exception 'Für diesen Einsatz gibt es keine Rüstliste'
      using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.ruestliste_speichern(
  p_datum date,
  p_baustelle text,
  p_positionen jsonb,
  p_uids uuid[],
  p_von text
) returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  kopf uuid;
  pos jsonb;
  behalten text[];
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  select e.id into kopf from public.einsatz_material e
   where e.company_id = betrieb and e.date = p_datum and e.project_number = p_baustelle;

  if jsonb_array_length(p_positionen) = 0 then
    if kopf is not null then delete from public.einsatz_material where id = kopf; end if;
    return null;
  end if;

  if kopf is null then
    insert into public.einsatz_material (company_id, date, project_number, uids, geladen, updated_by)
         values (betrieb, p_datum, p_baustelle, coalesce(p_uids, '{}'), '{}'::jsonb, p_von)
      returning id into kopf;
  else
    update public.einsatz_material
       set uids = coalesce(p_uids, uids), updated_by = p_von
     where id = kopf;
  end if;

  select coalesce(array_agg(p ->> 'id'), '{}')
    into behalten
    from jsonb_array_elements(p_positionen) p;

  delete from public.einsatz_material_positionen
   where einsatz_material_id = kopf and not (id = any(behalten));

  for pos in select * from jsonb_array_elements(p_positionen) loop
    insert into public.einsatz_material_positionen (
      id, company_id, einsatz_material_id, position, material_id, name, menge, einheit
    ) values (
      pos ->> 'id', betrieb, kopf,
      coalesce((pos ->> 'position')::integer, 0),
      nullif(pos ->> 'material_id', '')::uuid,
      pos ->> 'name', (pos ->> 'menge')::numeric, pos ->> 'einheit'
    )
    -- Das PAAR aus Liste und Kennung, nicht die Kennung allein. Sonst
    -- aktualisiert dieselbe Kennung aus einer anderen Liste deren Zeile und
    -- diese Liste bleibt leer.
    on conflict (einsatz_material_id, id) do update
       set position = excluded.position, material_id = excluded.material_id,
           name = excluded.name, menge = excluded.menge, einheit = excluded.einheit;
  end loop;

  update public.einsatz_material
     set geladen = (
       select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
         from jsonb_each(geladen) as g(k, v)
        where k = any(behalten))
   where id = kopf;

  return kopf;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Angebot und Nummern
-- ---------------------------------------------------------------------------

create or replace function public.angebot_speichern(
  p_id uuid,
  p_kopf jsonb,
  p_positionen jsonb
) returns uuid
  language plpgsql
  set search_path = ''
as $$
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
    insert into public.quotes (
      company_id, quote_number, customer_id, customer_name, address,
      quote_date, valid_until, status, discount_mode, discount_value,
      discount_label, discount_amount, subtotal_netto, total_netto,
      total_vat, total_brutto, vat_rate, kalkulierte_stunden, notes,
      project_number
    ) values (
      betrieb, neu.quote_number, neu.customer_id, neu.customer_name,
      neu.address, neu.quote_date, neu.valid_until,
      coalesce(neu.status, 'Entwurf'), neu.discount_mode, neu.discount_value,
      neu.discount_label, neu.discount_amount,
      coalesce(neu.subtotal_netto, 0), coalesce(neu.total_netto, 0),
      coalesce(neu.total_vat, 0), coalesce(neu.total_brutto, 0),
      neu.vat_rate, coalesce(neu.kalkulierte_stunden, 0), neu.notes,
      neu.project_number
    ) returning id into kennung;
  else
    kennung := alt.id;
    neu := jsonb_populate_record(alt, p_kopf);

    /*
      NUR DER ENTWURF ÄNDERT SEINEN INHALT. Verglichen wird Spalte für
      Spalte statt „wurde etwas mitgeschickt": die Ansicht schickt beim
      Annehmen den Status und die Baustelle, und das soll weiter gehen.
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
      project_number      = neu.project_number
     where id = kennung;
  end if;

  if p_positionen is not null then
    delete from public.quote_lines where quote_id = kennung;
    for zeile in select * from jsonb_array_elements(p_positionen) loop
      insert into public.quote_lines (
        company_id, quote_id, position, label, qty, unit, unit_price, netto,
        ist_arbeitszeit
      ) values (
        betrieb, kennung, lauf, zeile ->> 'label', (zeile ->> 'qty')::numeric,
        coalesce(zeile ->> 'unit', ''), (zeile ->> 'unit_price')::numeric,
        (zeile ->> 'netto')::numeric, (zeile ->> 'ist_arbeitszeit')::boolean
      );
      lauf := lauf + 1;
    end loop;
  end if;

  return kennung;
end;
$$;

create or replace function public.naechste_nummer(
  p_art text,
  p_jahr integer,
  p_seed integer default 0,
  p_wunsch integer default null
) returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text;
  letzte integer;
  neu integer;
begin
  betrieb := app.arbeitsbetrieb();
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  /*
    RECHNUNGSNUMMERN NICHT FÜR DEN SUPPORT. Eine Rechnung legt er nicht an —
    sie greift in die Zeitbuchungen, und die bleiben ihm verschlossen. Eine
    Nummer, die er zöge, würde deshalb nie eine Rechnung; in einer
    lückenlosen Folge wäre sie ein Loch, das der Betrieb dem Finanzamt
    erklären müsste.
  */
  if p_art = 'invoices' and app.ist_plattform() then
    raise exception 'Rechnungsnummern vergibt nur der Betrieb selbst — Rechnungen gehen im Supportzugang nicht'
      using errcode = '42501';
  end if;
  if p_art = 'invoices' and not app.ist_buch_oder_spitze() then
    raise exception 'Nur die Buchhaltung vergibt Rechnungsnummern' using errcode = '42501';
  end if;
  if p_art = 'quotes' and not (app.ist_fuehrung() or app.ist_buch_oder_spitze()) then
    raise exception 'Nur die Führung vergibt Angebotsnummern' using errcode = '42501';
  end if;
  if p_art = 'projects' and not app.ist_fuehrung() then
    raise exception 'Nur die Führung vergibt Baustellennummern' using errcode = '42501';
  end if;

  insert into public.number_counters (company_id, art, jahr, stand)
       values (betrieb, p_art, p_jahr, app.hoechste_lfd(p_art, betrieb, p_jahr))
  on conflict (company_id, art, jahr) do nothing;

  select c.stand into letzte from public.number_counters c
   where c.company_id = betrieb and c.art = p_art and c.jahr = p_jahr
     for update;

  /*
    ANGEBOTE UND BAUSTELLEN kann auch ein Mensch nummerieren — eine
    Baustelle mit der Nummer des Bauträgers, die zufällig ins Schema fällt.
    Der Zähler springt über jede, die es schon gibt, statt sie ein zweites
    Mal anzubieten. Rechnungen nicht: die vergibt nur er.
  */
  if p_art in ('quotes', 'projects') then
    letzte := greatest(letzte, app.hoechste_lfd(p_art, betrieb, p_jahr));
  end if;

  if p_wunsch is null or (letzte > 0 and p_wunsch = letzte + 1) then
    neu := case
             when letzte > 0 then letzte + 1
             when p_art = 'invoices' then 1001
             else 1
           end;
  else
    if p_wunsch < 1 then
      raise exception 'Eine Rechnungsnummer braucht eine ganze laufende Nummer.'
        using errcode = '22023';
    end if;
    if p_wunsch <= letzte then
      raise exception 'Die Nummer % ist bereits vergeben. Die nächste freie ist %.',
        to_char(p_wunsch, 'FM0000'), to_char(letzte + 1, 'FM0000')
        using errcode = '23505';
    end if;
    if p_art = 'invoices' and (letzte > 0 or exists (
         select 1 from public.invoices i where i.company_id = betrieb)) then
      raise exception 'Rechnungsnummern laufen lückenlos — die nächste ist %. Eine eigene Nummer geht nur bei der allerersten Rechnung, beim Umstieg aus dem bisherigen Programm.',
        to_char(letzte + 1, 'FM0000')
        using errcode = '22023';
    end if;
    neu := p_wunsch;
  end if;

  update public.number_counters
     set stand = neu, updated_at = now()
   where company_id = betrieb and art = p_art and jahr = p_jahr;

  return neu;
end;
$$;

create or replace function public.naechste_nummern(p_jahr integer)
  returns table (art text, naechste integer)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select a.art,
         case
           when coalesce(c.stand, app.hoechste_lfd(a.art, app.arbeitsbetrieb(), p_jahr)) > 0
             then coalesce(c.stand, app.hoechste_lfd(a.art, app.arbeitsbetrieb(), p_jahr)) + 1
           when a.art = 'invoices' then 1001
           else 1
         end
    from (values ('invoices'), ('quotes'), ('projects')) a(art)
    left join public.number_counters c
      on c.company_id = app.arbeitsbetrieb() and c.art = a.art and c.jahr = p_jahr
   where app.angemeldet() and app.arbeitsbetrieb() is not null
$$;

-- ---------------------------------------------------------------------------
-- 4. Kunden übernehmen und Katalog einspielen
-- ---------------------------------------------------------------------------

create or replace function public.kunden_einspielen(p_kunden jsonb, p_nur_pruefen boolean default true)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  vorhanden jsonb;
  angelegt integer := 0;
  gesamt integer;
begin
  if betrieb is null
     or not (app.betriebsmitglied(betrieb) or app.support_schreibt(betrieb))
     or not app.darf_kunden_pflegen() then
    raise exception 'Kunden übernehmen darf, wer Kunden anlegen darf — Leitung oder mit Freigabe „Kunden pflegen“'
      using errcode = '42501';
  end if;
  if p_kunden is null or jsonb_typeof(p_kunden) <> 'array' then
    raise exception 'Erwartet wird eine Liste von Kunden' using errcode = '22023';
  end if;
  gesamt := jsonb_array_length(p_kunden);
  if gesamt > 5000 then
    raise exception 'Höchstens 5000 Kunden auf einmal' using errcode = '22023';
  end if;

  with bestand as (
    select distinct app.kunden_schluessel(c.name) as schluessel
      from public.customers c
     where c.company_id = betrieb
  ), zeilen as (
    select (e.stelle - 1)::integer as nr, app.kunden_schluessel(e.k ->> 'name') as schluessel
      from jsonb_array_elements(p_kunden) with ordinality as e(k, stelle)
  )
  select coalesce(jsonb_agg(z.nr order by z.nr), '[]'::jsonb) into vorhanden
    from zeilen z
    join bestand b on b.schluessel = z.schluessel;

  if p_nur_pruefen then
    return jsonb_build_object('vorhanden', vorhanden);
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_kunden) k
     where app.kunden_schluessel(k ->> 'name') = ''
  ) then
    raise exception 'Jeder Kunde braucht einen Namen' using errcode = '22023';
  end if;

  insert into public.customers (
    company_id, name, address, contact_name, contact_phone, email, vat_id, notes, active)
  select betrieb,
         btrim(z.k ->> 'name'),
         nullif(btrim(coalesce(z.k ->> 'address', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'contactName', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'contactPhone', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'email', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'vatId', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'notes', '')), ''),
         true
    from (
      -- Kommt ein Name in der Liste zweimal, zählt der erste.
      select distinct on (app.kunden_schluessel(e.k ->> 'name')) e.k, e.stelle
        from jsonb_array_elements(p_kunden) with ordinality as e(k, stelle)
       where not ((e.stelle - 1)::integer in (select jsonb_array_elements_text(vorhanden)::integer))
       order by app.kunden_schluessel(e.k ->> 'name'), e.stelle
    ) z
   order by z.stelle;
  get diagnostics angelegt = row_count;

  return jsonb_build_object('angelegt', angelegt, 'uebersprungen', gesamt - angelegt);
end;
$$;

create or replace function public.datanorm_uebernehmen(p_lauf uuid)
  returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb    text := app.arbeitsbetrieb();
  lauf       public.datanorm_laeufe;
  z          public.datanorm_zeilen;
  vorhanden  public.materials;
  treffer    integer;
  satz       numeric;
  einkauf    numeric;
  liste      numeric;
  heute      date := current_date;
  angelegt   integer := 0;
  geaendert  integer := 0;
  gelaufen   integer := 0;
  unbekannt  integer := 0;
  preise     integer := 0;
  ohne_satz  integer := 0;
  ergebnis   jsonb;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if not app.ist_spitze() then
    raise exception 'Einen Katalog spielt nur die Geschäftsführung ein'
      using errcode = '42501';
  end if;

  /*
    Der Betriebsvergleich ist heute doppelt gemoppelt: die Funktion laeuft
    unter dem Zeilenschutz des Aufrufers, der Lauf eines fremden Betriebs
    kaeme hier ohnehin nicht an. Er bleibt trotzdem stehen — macht jemand
    diese Funktion eines Tages zu `security definer`, ist er die einzige
    Grenze, die dann noch greift. Er ist deshalb auch nicht durch eine
    Pruefung abgedeckt: kaputtmachen laesst er sich nicht, solange der
    Zeilenschutz daneben steht.
  */
  select * into lauf from public.datanorm_laeufe
    where id = p_lauf and company_id = betrieb;
  if not found then
    raise exception 'Lauf nicht gefunden' using errcode = 'P0002';
  end if;
  /*
    Zweimal uebernehmen heisst: die Preise des Laufs ein zweites Mal
    schreiben. Beim Doppelklick auf „Uebernehmen" ist das harmlos, nach einem
    spaeteren Katalog nicht mehr — dann traegt der Stamm wieder die alten
    Preise. Ein Lauf ist deshalb genau einmal zu haben.
  */
  if lauf.status <> 'offen' then
    raise exception 'Dieser Lauf wurde bereits abgeschlossen' using errcode = '22023';
  end if;

  for z in select * from public.datanorm_zeilen where lauf_id = p_lauf order by zeile loop
    select count(*) into treffer from public.materials m
      where m.company_id = betrieb and m.article_number = z.artikelnummer;
    if treffer > 1 then
      /*
        Zwei Artikel mit derselben Nummer — dann ist nicht entscheidbar,
        welcher gemeint ist. Lieber der ganze Import steht als der falsche
        Preis am falschen Artikel.
      */
      raise exception 'Artikelnummer % steht im Katalog mehrfach — bitte zuerst bereinigen',
        z.artikelnummer using errcode = '23505';
    end if;
    if treffer = 1 then
      select * into vorhanden from public.materials m
        where m.company_id = betrieb and m.article_number = z.artikelnummer;
    else
      vorhanden := null;
    end if;

    if z.verarbeitung = 'loeschung' then
      if treffer = 1 then
        update public.materials set ausgelaufen = true where id = vorhanden.id;
        gelaufen := gelaufen + 1;
      else
        -- Ein Loeschsatz fuer etwas, das hier nie im Katalog stand.
        unbekannt := unbekannt + 1;
      end if;
      continue;
    end if;

    satz := null;
    liste := null;
    einkauf := null;
    if z.preis is not null then
      if z.preis_art = 'netto' then
        einkauf := z.preis;
      elsif z.preis_art = 'liste' then
        liste := z.preis;
        select r.prozent into satz from public.rabattsaetze r
          where r.supplier_id = lauf.supplier_id
            and r.gruppe = coalesce(z.rabattgruppe, '');
        if satz is null then
          ohne_satz := ohne_satz + 1;
        else
          einkauf := round(z.preis * (1 - satz / 100), 4);
        end if;
      end if;
    end if;

    if treffer = 0 then
      insert into public.materials (company_id, name, article_number, unit, einkaufspreis)
        values (betrieb, z.name, z.artikelnummer, z.einheit, einkauf)
        returning * into vorhanden;
      angelegt := angelegt + 1;
    else
      /*
        DER EINKAUFSPREIS WIRD NICHT GELEERT. Bringt die Datei fuer diesen
        Artikel keinen brauchbaren Preis mit, ist der zuletzt bekannte immer
        noch die beste Auskunft, die der Betrieb hat.
      */
      update public.materials set
        name = case when z.name = '' then name else z.name end,
        unit = coalesce(z.einheit, unit),
        einkaufspreis = coalesce(einkauf, einkaufspreis),
        ausgelaufen = false
      where id = vorhanden.id;
      geaendert := geaendert + 1;
    end if;

    insert into public.material_prices (
      company_id, material_id, supplier_id, listenpreis, rabatt_prozent,
      einkaufspreis, rabattgruppe, gueltig_ab
    ) values (
      betrieb, vorhanden.id, lauf.supplier_id, liste, satz, einkauf, z.rabattgruppe, heute
    )
    on conflict (material_id, supplier_id, gueltig_ab) do update set
      listenpreis = excluded.listenpreis,
      rabatt_prozent = excluded.rabatt_prozent,
      einkaufspreis = excluded.einkaufspreis,
      rabattgruppe = excluded.rabattgruppe;
    preise := preise + 1;
  end loop;

  ergebnis := jsonb_build_object(
    'angelegt', angelegt,
    'geaendert', geaendert,
    'ausgelaufen', gelaufen,
    'loeschungOhneArtikel', unbekannt,
    'preise', preise,
    'ohneRabattsatz', ohne_satz
  );

  update public.datanorm_laeufe set
    status = 'uebernommen',
    abgeschlossen_am = now(),
    bericht = coalesce(bericht, '{}'::jsonb) || jsonb_build_object('uebernahme', ergebnis)
  where id = p_lauf;

  /*
    Die Zeilen haben ihren Zweck erfuellt. Sie stehen zu Zehntausenden im
    Zwischenlager und wuerden von da an in jeder naechtlichen Sicherung und
    in jedem DSGVO-Auszug mitfahren. Was bleibt, ist der Bericht am Lauf —
    die Frage „wer hat wann welchen Katalog eingespielt" beantwortet er, die
    Frage „welche Zeile stand in Zeile 12.481" beantwortet die Datei.
  */
  delete from public.datanorm_zeilen where lauf_id = p_lauf;

  return ergebnis;
end;
$$;

/*
  Rumpf wie in `20260926111000_bestand_nur_ueber_das_lager.sql`, bis auf
  `spitze`: dort stand die Rolle aus dem Token. Für Betriebskonten ist
  `app.ist_spitze()` dieselbe Frage; der Support mit „mitarbeiten" gilt
  darin als Spitze, wie in jeder Richtlinie.
*/
create or replace function app.materialfelder_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  pflegt boolean := app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung();
  spitze boolean := app.ist_spitze();
begin
  -- Ein Datanorm-Import bringt Einkaufspreise mit; er laeuft serverseitig.
  if app.ist_dienst() then return new; end if;

  if tg_op = 'INSERT' then
    if new.einkaufspreis is not null and not spitze then
      raise exception 'Den Einkaufspreis setzt nur die Geschäftsführung'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.einkaufspreis is distinct from old.einkaufspreis and not spitze then
    raise exception 'Den Einkaufspreis ändert nur die Geschäftsführung'
      using errcode = '42501';
  end if;

  if (new.name is distinct from old.name
      or new.category is distinct from old.category
      or new.article_number is distinct from old.article_number
      or new.unit is distinct from old.unit
      or new.verkaufspreis is distinct from old.verkaufspreis)
     and not pflegt then
    raise exception 'Den Katalog pflegt die Verwaltung oder die Führung'
      using errcode = '42501';
  end if;

  if (new.stock is distinct from old.stock
      or new.ausgelaufen is distinct from old.ausgelaufen)
     and not pflegt
     and current_user = 'authenticated' then
    raise exception 'Den Bestand bewegt das Lager — Abholung und Retoure buchen ihn selbst'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Wer einen Katalog-Lauf anlegt
-- ---------------------------------------------------------------------------

/*
  `angelegt_von` nimmt ab Werk `auth.uid()` und verweist auf die Belegschaft.
  Ein Plattformkonto steht dort nie (`app.plattform_anspruch` hält beide
  auseinander) — sein Lauf scheiterte am Fremdschlüssel, bevor die erste
  Zeile ankam. Für ihn bleibt das Feld leer; welches Plattformkonto wann im
  Betrieb gearbeitet hat, steht im Protokoll `support_zugriffe`, das der
  Betrieb liest. Für Betriebskonten bleibt es, wie es war.
*/
alter table public.datanorm_laeufe
  alter column angelegt_von
  set default (case when app.ist_plattform() then null else auth.uid() end);
