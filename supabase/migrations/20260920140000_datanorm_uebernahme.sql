/*
  Der Weg vom gelesenen Katalog in den Materialstamm.

  WARUM EIN ZWISCHENLAGER UND KEIN EINZIGER AUFRUF. Ein DATANORM-Katalog
  eines Sanitaergrosshaendlers hat nicht dreihundert Artikel, sondern
  vierzigtausend. Die als eine jsonb-Ladung zu schicken, sprengt jede
  vernuenftige Grenze. Also: die Ansicht schickt die Zeilen in Haeppchen in
  ein Zwischenlager, und die Uebernahme liest sie dort in EINER Transaktion.
  Damit bleibt sie alles-oder-nichts — ein halb eingespielter Katalog waere
  das Schlimmste von beidem.

  DREI REGELN, DIE HIER IN DER DATENBANK STEHEN UND NICHT IN DER ANSICHT:

  1. ES WIRD NIE EIN ARTIKEL GELOESCHT. Ein Loeschsatz sagt, dass der
     Grosshaendler den Artikel nicht mehr fuehrt — nicht, dass er nie auf
     einem Handwerksschein oder einer Rechnung stand. Er wird als
     `ausgelaufen` markiert und bleibt.
  2. DER VERKAUFSPREIS WIRD NIE ANGEFASST. Das ist die Kalkulation des
     Betriebs; der Grosshaendler hat darin nichts verloren.
  3. AUS EINEM LISTENPREIS WIRD NUR MIT HINTERLEGTEM RABATTSATZ EIN
     EINKAUFSPREIS. Ohne Satz bleibt der Einkaufspreis leer, und die
     Nachkalkulation meldet die Luecke weiter — das ist richtig so. Ein
     Listenpreis als Einkauf gebucht hiesse: jede Baustelle sieht schlechter
     aus, als sie ist, und niemand weiss warum.
*/

-- ---------------------------------------------------------------------------
-- 1. Ausgelaufene Artikel
-- ---------------------------------------------------------------------------

alter table materials add column if not exists ausgelaufen boolean not null default false;

comment on column materials.ausgelaufen is
  'Der Grosshaendler fuehrt den Artikel nicht mehr. Er bleibt im Katalog, '
  'weil er auf alten Scheinen und Rechnungen steht; fuer neue Erfassungen '
  'wird er nicht mehr angeboten.';

-- ---------------------------------------------------------------------------
-- 2. Rabattsaetze je Lieferant und Rabattgruppe
-- ---------------------------------------------------------------------------

/*
  DIE ZAHL, DIE IN DER DATEI NICHT STEHT. DATANORM liefert die Rabattgruppe
  als Schluessel ("10", "AB"), nicht den Satz. Wie hoch der Rabatt ist, hat
  der Betrieb mit seinem Grosshaendler ausgehandelt; das steht in keiner
  Norm. Ohne diese Tabelle ist ein Listenpreis-Katalog ein Katalog ohne
  Einkaufspreise — also genau die Luecke, die der Import schliessen soll.
*/
create table if not exists rabattsaetze (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references companies (id),
  supplier_id uuid not null references suppliers (id) on delete cascade,
  gruppe      text not null,
  -- 100 % waere geschenkt und ist in aller Regel ein Tippfehler.
  prozent     numeric(6,3) not null check (prozent >= 0 and prozent < 100),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists rabattsaetze_je_gruppe on rabattsaetze (supplier_id, gruppe);
create index if not exists rabattsaetze_betrieb on rabattsaetze (company_id);

alter table rabattsaetze enable row level security;
create policy rabattsaetze_lesen on rabattsaetze
  for select using (app.darf(company_id));
create policy rabattsaetze_schreiben on rabattsaetze
  for all using (app.darf(company_id) and (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()))
  with check (app.darf(company_id) and (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()));

create trigger rabattsaetze_updated_at before update on rabattsaetze
  for each row execute function app.updated_at_setzen();
create trigger rabattsaetze_betrieb_fest before update on rabattsaetze
  for each row execute function app.betrieb_unveraenderlich();

alter table material_prices add column if not exists rabattgruppe text;

comment on column material_prices.rabattgruppe is
  'Der Schluessel aus der DATANORM-Datei. Er haelt fest, WORAUS der '
  'Einkaufspreis gerechnet wurde — aendert der Betrieb spaeter seinen '
  'Rabattsatz, ist nachvollziehbar, welche Artikel das betrifft.';

-- ---------------------------------------------------------------------------
-- 3. Das Zwischenlager: ein Lauf und seine Zeilen
-- ---------------------------------------------------------------------------

create table if not exists datanorm_laeufe (
  id           uuid primary key default gen_random_uuid(),
  company_id   text not null references companies (id),
  supplier_id  uuid not null references suppliers (id),
  dateiname    text,
  zeichensatz  text,
  status       text not null default 'offen'
                 check (status in ('offen', 'uebernommen', 'verworfen')),
  /*
    Der Befund des Probelaufs, wie er in der Ansicht stand — und nach der
    Uebernahme das Protokoll: wer wann welchen Katalog eingespielt hat und
    was dabei herauskam. Das ist die Antwort auf „seit wann steht bei dem
    Artikel dieser Preis".
  */
  bericht      jsonb,
  angelegt_von uuid references users (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  abgeschlossen_am timestamptz
);

create index if not exists datanorm_laeufe_betrieb on datanorm_laeufe (company_id, created_at desc);

create table if not exists datanorm_zeilen (
  id            bigint generated always as identity primary key,
  lauf_id       uuid not null references datanorm_laeufe (id) on delete cascade,
  company_id    text not null references companies (id),
  zeile         integer not null,
  artikelnummer text not null,
  name          text not null default '',
  einheit       text,
  preis         numeric(12,4),
  preis_art     text not null check (preis_art in ('liste', 'netto', 'unbekannt')),
  rabattgruppe  text,
  warengruppe   text,
  verarbeitung  text not null check (verarbeitung in ('neu', 'aenderung', 'loeschung'))
);

create index if not exists datanorm_zeilen_lauf on datanorm_zeilen (lauf_id);

alter table datanorm_laeufe enable row level security;
alter table datanorm_zeilen enable row level security;

/*
  EINSPIELEN DARF NUR, WER AUCH EINZELN EINKAUFSPREISE SETZEN DARF. Sonst
  waere der Import der bequeme Weg um `app.materialfelder_geschuetzt` herum:
  was von Hand der Geschaeftsfuehrung vorbehalten ist, koennte die Verwaltung
  zu vierzigtausend Stueck auf einmal tun.
*/
create policy datanorm_laeufe_lesen on datanorm_laeufe
  for select using (app.darf(company_id));
create policy datanorm_laeufe_schreiben on datanorm_laeufe
  for all using (app.darf(company_id) and app.ist_spitze())
  with check (app.darf(company_id) and app.ist_spitze());

create policy datanorm_zeilen_lesen on datanorm_zeilen
  for select using (app.darf(company_id));
create policy datanorm_zeilen_schreiben on datanorm_zeilen
  for all using (app.darf(company_id) and app.ist_spitze())
  with check (app.darf(company_id) and app.ist_spitze());

create trigger datanorm_laeufe_betrieb_fest before update on datanorm_laeufe
  for each row execute function app.betrieb_unveraenderlich();
create trigger datanorm_zeilen_betrieb_fest before update on datanorm_zeilen
  for each row execute function app.betrieb_unveraenderlich();

-- ---------------------------------------------------------------------------
-- 3b. Der Lieferant muss zum Betrieb gehoeren
-- ---------------------------------------------------------------------------

/*
  EIN FREMDSCHLUESSEL ALLEIN REICHT HIER NICHT. `supplier_id references
  suppliers (id)` prueft, dass es den Lieferanten GIBT — nicht, dass er zu
  diesem Betrieb gehoert. Der Zeilenschutz prueft nur `company_id`. Zwischen
  beiden klafft eine Luecke: ein Betrieb konnte einen Lauf auf den
  Lieferanten eines anderen Betriebs anlegen und haette danach Preiszeilen
  unter fremder Lieferantennummer im eigenen Stamm.

  Eine `check`-Bedingung kann das nicht: sie darf nicht in einer anderen
  Tabelle nachsehen. Also ein Ausloeser — und weil dieselbe Luecke bei den
  Rabattsaetzen und den Lieferantenpreisen besteht, einer fuer alle drei.
*/
create or replace function app.lieferant_im_betrieb() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.suppliers s
      where s.id = new.supplier_id and s.company_id = new.company_id
  ) then
    raise exception 'Der Lieferant gehört nicht zu diesem Betrieb' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger datanorm_laeufe_lieferant before insert or update on datanorm_laeufe
  for each row execute function app.lieferant_im_betrieb();
create trigger rabattsaetze_lieferant before insert or update on rabattsaetze
  for each row execute function app.lieferant_im_betrieb();
create trigger material_prices_lieferant before insert or update on material_prices
  for each row execute function app.lieferant_im_betrieb();

-- ---------------------------------------------------------------------------
-- 4. Die Uebernahme
-- ---------------------------------------------------------------------------

/*
  Alles-oder-nichts. Eine plpgsql-Funktion laeuft in EINER Transaktion: geht
  bei Artikel 39.000 etwas schief, ist auch Artikel 1 nicht geschrieben.
  Genau das ist gewollt — ein halb eingespielter Katalog ist schlimmer als
  gar keiner, weil niemand sagen kann, welche Haelfte stimmt.

  Zurueck kommen Zahlen, keine Meldung: angelegt, geaendert, ausgelaufen,
  Preise geschrieben, und — die wichtigste — wie viele Artikel OHNE
  Einkaufspreis blieben, weil zu ihrer Rabattgruppe kein Satz hinterlegt ist.
*/
create or replace function public.datanorm_uebernehmen(p_lauf uuid)
  returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb    text := app.betrieb();
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

grant execute on function public.datanorm_uebernehmen(uuid) to authenticated;
