-- TESTBERICHT 30.09.2026, PAKET 3c — VERGEBBARE FREIGABEN STATT NEUER ROLLEN
-- (M37, M38; entschieden am 30.09.2026).
--
--   M37  Der Lagerist ist Verwaltung. Die Geschäftsführung kann ihm in der
--        Benutzerakte zwei Freigaben geben: „Katalog einspielen“ (DATANORM,
--        samt Einkaufspreisen) und „Einkaufspreise sehen“.
--   M38  Die Projektleitung bekommt auf Wunsch „Rechnungen lesen“ — nur die
--        Rechnungen ihrer Baustellen (wo sie in der Leitung steht), ohne
--        Anlegen. Ob sie im Einsatzplan einteilbar ist und „Mein
--        Einsatzplan“ sieht, ist eine Betriebseinstellung (ab Werk aus).
--
-- Nach dem Muster „Kunden pflegen“ (20260924200000): ein Wahrheitswert an der
-- Person, eine Funktion, die nur die eigene Zeile liest, und die Rolle als
-- Bedingung — eine stehengebliebene Freigabe wirkt nach einem Rollenwechsel
-- nicht.

alter table public.users
  add column if not exists katalog_einspielen boolean not null default false,
  add column if not exists einkauf_sehen boolean not null default false,
  add column if not exists rechnungen_lesen boolean not null default false;

comment on column public.users.katalog_einspielen is
  'Darf einen DATANORM-Katalog einspielen und dabei Einkaufspreise setzen. Wirkt für die Verwaltung.';
comment on column public.users.einkauf_sehen is
  'Darf Einkaufspreise sehen. Wirkt für die Verwaltung.';
comment on column public.users.rechnungen_lesen is
  'Darf die Rechnungen der Baustellen lesen, in deren Leitung er steht. Wirkt für die Projektleitung.';

alter table public.companies
  add column if not exists projektleitung_im_einsatzplan boolean not null default false;

comment on column public.companies.projektleitung_im_einsatzplan is
  'Die Projektleitung ist im Einsatzplan einteilbar und sieht „Mein Einsatzplan“. Ab Werk aus.';

-- ---------------------------------------------------------------------------
-- Die Freigaben
-- ---------------------------------------------------------------------------

create or replace function app.eigene_freigabe(p_spalte text) returns boolean
  language plpgsql stable
  security definer
  set search_path = ''
as $$
declare
  ja boolean;
begin
  -- Nur diese drei Spalten; der Name kommt nie von aussen.
  if p_spalte not in ('katalog_einspielen', 'einkauf_sehen', 'rechnungen_lesen') then
    return false;
  end if;
  execute format('select coalesce(u.%I, false) and u.active from public.users u where u.id = $1', p_spalte)
    into ja using auth.uid();
  return coalesce(ja, false);
end;
$$;

revoke all on function app.eigene_freigabe(text) from public, anon, authenticated;

create or replace function app.darf_katalog_einspielen() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.ist_spitze()
      or (app.hat_rolle(array['Verwaltung']) and app.eigene_freigabe('katalog_einspielen'))
$$;

/*
  Wer einspielt, sieht die Einkaufspreise, die er einspielt — sonst liefe das
  Übernehmen eines Preises über eine Zeile, die er nicht lesen darf.
*/
create or replace function app.darf_einkauf_sehen() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.ist_spitze()
      or (app.hat_rolle(array['Verwaltung'])
          and (app.eigene_freigabe('einkauf_sehen') or app.eigene_freigabe('katalog_einspielen')))
$$;

create or replace function app.darf_rechnungen_lesen() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.hat_rolle(array['Projektleiter']) and app.eigene_freigabe('rechnungen_lesen')
$$;

revoke all on function app.darf_katalog_einspielen() from public, anon;
revoke all on function app.darf_einkauf_sehen() from public, anon;
revoke all on function app.darf_rechnungen_lesen() from public, anon;
grant execute on function app.darf_katalog_einspielen() to authenticated;
grant execute on function app.darf_einkauf_sehen() to authenticated;
grant execute on function app.darf_rechnungen_lesen() to authenticated;

-- ---------------------------------------------------------------------------
-- M37 — Katalog einspielen und Einkaufspreise
-- ---------------------------------------------------------------------------

drop policy if exists datanorm_laeufe_schreiben on public.datanorm_laeufe;
create policy datanorm_laeufe_schreiben on public.datanorm_laeufe
  for all using (app.darf(company_id) and app.darf_katalog_einspielen())
  with check (app.darf(company_id) and app.darf_katalog_einspielen());

drop policy if exists datanorm_zeilen_schreiben on public.datanorm_zeilen;
create policy datanorm_zeilen_schreiben on public.datanorm_zeilen
  for all using (app.darf(company_id) and app.darf_katalog_einspielen())
  with check (app.darf(company_id) and app.darf_katalog_einspielen());

drop policy if exists material_einkaufspreise_lesen on public.material_einkaufspreise;
create policy material_einkaufspreise_lesen on public.material_einkaufspreise
  for select using (
    (app.betriebsmitglied(company_id) and app.darf_einkauf_sehen()) or app.support_liest(company_id));

drop policy if exists material_einkaufspreise_schreiben on public.material_einkaufspreise;
create policy material_einkaufspreise_schreiben on public.material_einkaufspreise
  for all using (app.darf(company_id) and app.darf_katalog_einspielen())
  with check (app.darf(company_id) and app.darf_katalog_einspielen());

-- Der Wächter der Materialfelder: den Einkaufspreis setzt auch, wer einspielen darf.
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

-- Die Übernahme des Katalogs: dieselbe Funktion, nur die Freigabe statt der Spitze.
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

-- ---------------------------------------------------------------------------
-- M38 — Rechnungen lesen für die Projektleitung
-- ---------------------------------------------------------------------------

/*
  NUR DIE BAUSTELLEN, IN DEREN LEITUNG SIE STEHT (`projects.project_managers`).
  Lesen, nie schreiben — die Schreibregeln bleiben bei Buchhaltung und
  Spitze. Die Positionen folgen der Rechnung: wer sie lesen darf, liest ihre
  Zeilen.
*/
drop policy if exists invoices_lesen on public.invoices;
create policy invoices_lesen on public.invoices
  for select using (
    (app.darf(company_id) and app.ist_buch_oder_spitze())
    or app.support_liest(company_id)
    or (app.betriebsmitglied(company_id)
        and app.darf_rechnungen_lesen()
        and exists (select 1 from public.projects p
                     where p.id = invoices.project_id
                       and p.company_id = invoices.company_id
                       and auth.uid() = any (p.project_managers))));

drop policy if exists invoice_lines_lesen on public.invoice_lines;
create policy invoice_lines_lesen on public.invoice_lines
  for select using (
    (app.darf(company_id) and app.ist_buch_oder_spitze())
    or app.support_liest(company_id)
    or (app.darf_rechnungen_lesen()
        and exists (select 1 from public.invoices i where i.id = invoice_lines.invoice_id)));
