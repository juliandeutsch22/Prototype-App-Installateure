-- TESTBERICHT 30.09.2026, PAKET 7c — KATALOG UND LAGER, AUFSCHLAG, WARTUNG.
--
--   M30  Ein Katalogartikel ist nicht von selbst ein Lagerartikel; erst
--        „im Lager führen“ macht ihn dazu. Mindestmenge je Artikel.
--   M31  Materialaufschlag: Standard in % je Betrieb, abweichend je
--        Warengruppe (aus DATANORM). Der Verkaufspreis wird vorgeschlagen und
--        bleibt überschreibbar.
--   M39  Anlagendaten der Wartung und Wartungspreis; der nächste Termin folgt
--        aus „zuletzt gewartet“ plus Intervall.

-- ---------------------------------------------------------------------------
-- M30 — Katalog getrennt vom Lager
-- ---------------------------------------------------------------------------

/*
  WAS VORHER GALT: jeder Katalogartikel stand im Lager. Nach einem vollen
  DATANORM-Import wären es zehntausende Artikel mit Bestand null gewesen —
  die Lagerliste unbrauchbar, „knapp“ bedeutungslos.

  JETZT: `lagerartikel` sagt, ob der Betrieb den Artikel im Lager führt. Neu
  eingespielte Artikel tun es nicht; von Hand angelegte entscheidet die Maske.

  BESTAND: geführt wird, was Bestand hat, was schon einmal bewegt wurde oder
  was von Hand angelegt ist (kein Preis eines Großhändlers). Was nur aus dem
  Katalogimport stammt und nie Bestand hatte, wird Katalog.

  WER BESTAND HAT, WIRD GEFÜHRT. Bucht ein Wareneingang oder eine Retoure auf
  einen Katalogartikel, wird er dabei zum Lagerartikel — ein Bestand, der in
  keiner Lagerliste steht, wäre der schlechteste Zustand. Umgekehrt lässt sich
  „im Lager führen“ nur abschalten, wenn der Bestand null ist.
*/
alter table public.materials
  add column if not exists lagerartikel boolean not null default false,
  add column if not exists mindestmenge numeric(12,3),
  add column if not exists warengruppe text;

update public.materials m
   set lagerartikel = true
 where m.stock <> 0
    or exists (select 1 from public.lagerbewegungen b where b.material_id = m.id)
    or not exists (select 1 from public.material_prices p where p.material_id = m.id);

alter table public.materials drop constraint if exists materials_mindestmenge;
alter table public.materials add constraint materials_mindestmenge
  check (mindestmenge is null or mindestmenge >= 0);

alter table public.materials drop constraint if exists materials_bestand_nur_im_lager;
alter table public.materials add constraint materials_bestand_nur_im_lager
  check (lagerartikel or stock = 0);

create or replace function app.lager_folgt_bestand() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- Nur wenn Bestand ENTSTEHT: wer bei Bestand abschalten will, soll den
  -- Grund hören (Prüfung unten), nicht still überstimmt werden.
  if new.stock <> 0 and (tg_op = 'INSERT' or new.stock is distinct from old.stock) then
    new.lagerartikel := true;
  end if;
  return new;
end;
$$;

revoke all on function app.lager_folgt_bestand() from public, anon, authenticated;

drop trigger if exists materials_lager_folgt_bestand on public.materials;
create trigger materials_lager_folgt_bestand
  before insert or update on public.materials
  for each row execute function app.lager_folgt_bestand();

-- Lagerartikel, Mindestmenge und Warengruppe pflegt, wer den Katalog pflegt.
create or replace function app.materialfelder_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  pflegt boolean := app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung();
  -- Seit 30.09.2026 (M37) auch, wer die Freigabe „Katalog einspielen“ hat.
  spitze boolean := app.ist_spitze() or app.darf_katalog_einspielen();
begin
  -- Ein Datanorm-Import bringt Einkaufspreise mit; er laeuft serverseitig.
  if app.ist_dienst() then return new; end if;

  if tg_op = 'INSERT' then
    if new.einkaufspreis is not null and not spitze then
      raise exception 'Den Einkaufspreis setzt die Geschäftsführung — oder wer die Freigabe „Katalog einspielen“ hat'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.einkaufspreis is distinct from old.einkaufspreis and not spitze then
    raise exception 'Den Einkaufspreis ändert die Geschäftsführung — oder wer die Freigabe „Katalog einspielen“ hat'
      using errcode = '42501';
  end if;

  if (new.name is distinct from old.name
      or new.category is distinct from old.category
      or new.article_number is distinct from old.article_number
      or new.unit is distinct from old.unit
      or new.verkaufspreis is distinct from old.verkaufspreis
      or new.warengruppe is distinct from old.warengruppe
      or new.lagerartikel is distinct from old.lagerartikel
      or new.mindestmenge is distinct from old.mindestmenge)
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
-- M31 — Warengruppe aus DATANORM, Aufschlag je Betrieb
-- ---------------------------------------------------------------------------

/*
  Die Warengruppe stand schon in der eingelesenen Datei, ging bei der
  Übernahme aber verloren. Jetzt bleibt sie am Artikel — eine leere Angabe
  überschreibt keine bekannte.
*/
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
  if not app.darf_katalog_einspielen() then
    raise exception 'Einen Katalog spielt die Geschäftsführung ein — oder wer die Freigabe „Katalog einspielen“ hat'
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
      insert into public.materials (company_id, name, article_number, unit, einkaufspreis, warengruppe)
        values (betrieb, z.name, z.artikelnummer, z.einheit, einkauf, nullif(btrim(coalesce(z.warengruppe, '')), ''))
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
        warengruppe = coalesce(nullif(btrim(coalesce(z.warengruppe, '')), ''), warengruppe),
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
  DER AUFSCHLAG unter `companies.rates -> 'materialaufschlag'`:
  `{ "standard": 25, "warengruppen": { "1201": 30 } }`, Prozent auf den
  Einkaufspreis. Ohne Angabe gibt es keinen Vorschlag — eine erfundene Marge
  wäre schlimmer als keine.
*/
create or replace function app.aufschlag_gueltig(a jsonb) returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select a is null
      or jsonb_typeof(a) = 'null'
      or (jsonb_typeof(a) = 'object'
          and not exists (
            select 1 from jsonb_each(a) e
             where e.key not in ('standard', 'warengruppen'))
          and (a -> 'standard' is null
               or jsonb_typeof(a -> 'standard') = 'null'
               or (jsonb_typeof(a -> 'standard') = 'number'
                   and (a ->> 'standard')::numeric between 0 and 1000))
          and (a -> 'warengruppen' is null
               or jsonb_typeof(a -> 'warengruppen') = 'null'
               or (jsonb_typeof(a -> 'warengruppen') = 'object'
                   and not exists (
                     select 1 from jsonb_each(a -> 'warengruppen') g
                      where btrim(g.key) = ''
                         or jsonb_typeof(g.value) <> 'number'
                         or (g.value #>> '{}')::numeric not between 0 and 1000))))
$$;

alter table public.companies drop constraint if exists companies_materialaufschlag;
alter table public.companies add constraint companies_materialaufschlag
  check (app.aufschlag_gueltig(rates -> 'materialaufschlag'));

/* Der Aufschlag eines Artikels in Prozent — Warengruppe vor Standard; ohne beides null. */
create or replace function app.aufschlag_fuer(p_rates jsonb, p_warengruppe text) returns numeric
  language sql
  immutable
  set search_path = ''
as $$
  select coalesce(
           (p_rates -> 'materialaufschlag' -> 'warengruppen' ->> btrim(coalesce(p_warengruppe, '')))::numeric,
           (p_rates -> 'materialaufschlag' ->> 'standard')::numeric)
$$;

/*
  VERKAUFSPREISE VORSCHLAGEN, NUR WO KEINER STEHT. Nach einem Katalogimport
  stehen viele Artikel ohne Verkaufspreis da und gehen so auf keine Rechnung.
  Diese Funktion setzt ihn aus Einkaufspreis und Aufschlag — ausschließlich
  dort, wo keiner (oder 0) steht. Ein gesetzter Preis ist die Kalkulation des
  Betriebs und wird nie angefasst; jeder vorgeschlagene bleibt änderbar.

  Nur, wer Einkaufspreise lesen darf: die Spitze und wer den Katalog einspielt.
*/
create or replace function public.verkaufspreise_vorschlagen() returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  saetze jsonb;
  gesetzt integer := 0;
  ohne_einkauf integer := 0;
  ohne_aufschlag integer := 0;
begin
  if betrieb is null or not app.betriebsmitglied(betrieb)
     or not (app.ist_spitze() or app.darf_katalog_einspielen()) then
    raise exception 'Verkaufspreise schlägt vor, wer die Einkaufspreise sieht — die Geschäftsführung oder wer den Katalog einspielt'
      using errcode = '42501';
  end if;
  select c.rates into saetze from public.companies c where c.id = betrieb;

  -- Unter dem Wächter der Felder hindurch, wie jede Funktion des Lagers.
  update public.materials m
     set verkaufspreis = round(e.einkaufspreis * (1 + app.aufschlag_fuer(saetze, m.warengruppe) / 100), 2)
    from public.material_einkaufspreise e
   where e.material_id = m.id
     and m.company_id = betrieb
     and not m.ausgelaufen
     and coalesce(m.verkaufspreis, 0) = 0
     and e.einkaufspreis is not null
     and app.aufschlag_fuer(saetze, m.warengruppe) is not null;
  get diagnostics gesetzt = row_count;

  select count(*) into ohne_einkauf
    from public.materials m
    left join public.material_einkaufspreise e on e.material_id = m.id
   where m.company_id = betrieb and not m.ausgelaufen
     and coalesce(m.verkaufspreis, 0) = 0 and e.einkaufspreis is null;
  select count(*) into ohne_aufschlag
    from public.materials m
    join public.material_einkaufspreise e on e.material_id = m.id
   where m.company_id = betrieb and not m.ausgelaufen
     and coalesce(m.verkaufspreis, 0) = 0 and e.einkaufspreis is not null
     and app.aufschlag_fuer(saetze, m.warengruppe) is null;

  return jsonb_build_object('gesetzt', gesetzt, 'ohneEinkauf', ohne_einkauf, 'ohneAufschlag', ohne_aufschlag);
end;
$$;

revoke all on function public.verkaufspreise_vorschlagen() from public, anon;
grant execute on function public.verkaufspreise_vorschlagen() to authenticated;

-- ---------------------------------------------------------------------------
-- M39 — Anlagendaten und Termin der Wartung
-- ---------------------------------------------------------------------------

/*
  Hersteller, Typ, Seriennummer und Baujahr standen bisher, wenn überhaupt,
  im Freitext. Dazu der vereinbarte Preis je Wartung (netto).
*/
alter table public.wartungen
  add column if not exists hersteller text,
  add column if not exists typ text,
  add column if not exists seriennummer text,
  add column if not exists baujahr smallint,
  add column if not exists preis numeric(12,2);

alter table public.wartungen drop constraint if exists wartungen_baujahr;
alter table public.wartungen add constraint wartungen_baujahr
  check (baujahr is null or baujahr between 1900 and 2100);
alter table public.wartungen drop constraint if exists wartungen_preis;
alter table public.wartungen add constraint wartungen_preis
  check (preis is null or preis >= 0);

/*
  DER NÄCHSTE TERMIN FOLGT AUS „ZULETZT GEWARTET“ PLUS INTERVALL. Ändert
  sich eines von beiden und wird der Termin nicht im selben Zug ausdrücklich
  gesetzt, rechnet die Datenbank ihn aus — wie `naechsterTermin` in der App
  (Monatsende bleibt Monatsende: 31.01. plus ein Monat ist der 28.02.). Ein
  ausdrücklich gesetzter Termin geht vor, etwa ein vereinbarter Ausweichtag.
*/
create or replace function app.wartung_termin() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.zuletzt_am is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.faellig_am is null then
      new.faellig_am := (new.zuletzt_am + make_interval(months => new.intervall_monate))::date;
    end if;
    return new;
  end if;
  if (new.zuletzt_am is distinct from old.zuletzt_am
      or new.intervall_monate is distinct from old.intervall_monate)
     and new.faellig_am is not distinct from old.faellig_am then
    new.faellig_am := (new.zuletzt_am + make_interval(months => new.intervall_monate))::date;
  end if;
  return new;
end;
$$;

revoke all on function app.wartung_termin() from public, anon, authenticated;

drop trigger if exists wartungen_termin on public.wartungen;
create trigger wartungen_termin
  before insert or update on public.wartungen
  for each row execute function app.wartung_termin();
