/*
  DIE DATANORM-ÜBERNAHME IN BLÖCKEN (10.10.2026).

  WAS GEMESSEN WURDE. Je Katalogzeile laufen rund fünf Anweisungen, und jede
  prüft über Zeilenschutz und Auslöser Anmeldung, Konto und Rolle — gut
  20 ms je Zeile. Angemeldete Konten haben je Abfrage 8 Sekunden
  (`statement_timeout` der Rolle `authenticated`, auch im gehosteten
  Projekt). Eine Übernahme von 600 Zeilen brach nach genau 8 Sekunden mit
  „canceling statement due to statement timeout“ ab und schrieb nichts; ein
  Großhandelskatalog hat zehntausende Zeilen.

  WAS SICH ÄNDERT. `p_menge` begrenzt, wie viele Zeilen ein Aufruf
  übernimmt; die App ruft Block für Block, bis `fertig`. Jeder Block ist für
  sich ganz oder gar nicht. Was je Zeile geschieht, ist Wort für Wort
  dasselbe wie bisher.

  WAS VOM „ALLES ODER NICHTS“ BLEIBT, und was nicht:
    - Doppelte Artikelnummern im Stamm — der Fall, für den es gebaut war —
      prüft der erste Aufruf über ALLE Zeilen, bevor er etwas schreibt.
    - Bricht die Übernahme zwischen zwei Blöcken ab, bleiben die schon
      übernommenen Zeilen im Stamm. Der Lauf bleibt „offen“, sein
      Zwischenstand (`bericht.zwischenstand`) sagt, was übernommen und was
      offen ist, und ein neuer Aufruf setzt dort fort. Das ist die Stelle,
      an der sich ablesen lässt, welche Hälfte zu welchem Katalog gehört.

  OHNE `p_menge` arbeitet die Funktion alles in einem Zug ab — wie bisher,
  für eine noch geöffnete ältere Fassung der App.

  Die Funktion läuft weiter mit den Rechten des Aufrufers (`security
  invoker`, wie bisher): Zeilenschutz und Freigabe „Katalog einspielen“
  greifen unverändert.
*/

drop function if exists public.datanorm_uebernehmen(uuid);

create or replace function public.datanorm_uebernehmen(p_lauf uuid, p_menge integer default null)
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
  stand      jsonb;
  doppelt    text;
  erledigt   bigint[] := '{}';
  offen      integer;
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
  if p_menge is not null and p_menge < 1 then
    raise exception 'Ein Block braucht mindestens eine Zeile' using errcode = '22023';
  end if;

  /*
    FOR UPDATE: zwei Blöcke desselben Laufs nebeneinander (zweiter Tab,
    Doppelklick) laufen nacheinander und nie über dieselben Zeilen.
  */
  select * into lauf from public.datanorm_laeufe
    where id = p_lauf and company_id = betrieb
    for update;
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

  /*
    DOPPELTE ARTIKELNUMMERN VOR DEM ERSTEN BLOCK, über alle Zeilen des
    Laufs: steht eine Nummer im Stamm mehrfach, beginnt die Übernahme gar
    nicht erst — wie bisher, als sie in einem Zug lief. Die Prüfung in der
    Schleife bleibt als zweite Sicherung.
  */
  stand := lauf.bericht -> 'zwischenstand';
  if stand is null then
    -- `dz`, nicht `z`: so heißt schon die Zeile der Schleife unten.
    select dz.artikelnummer into doppelt
      from public.datanorm_zeilen dz
      join public.materials m on m.company_id = betrieb and m.article_number = dz.artikelnummer
     where dz.lauf_id = p_lauf
     group by dz.zeile, dz.artikelnummer
    having count(*) > 1
     order by dz.zeile
     limit 1;
    if doppelt is not null then
      raise exception 'Artikelnummer % steht im Katalog mehrfach — bitte zuerst bereinigen',
        doppelt using errcode = '23505';
    end if;
    stand := '{}'::jsonb;
  end if;
  -- Was frühere Blöcke dieses Laufs schon gezählt haben.
  angelegt  := coalesce((stand ->> 'angelegt')::integer, 0);
  geaendert := coalesce((stand ->> 'geaendert')::integer, 0);
  gelaufen  := coalesce((stand ->> 'ausgelaufen')::integer, 0);
  unbekannt := coalesce((stand ->> 'loeschungOhneArtikel')::integer, 0);
  preise    := coalesce((stand ->> 'preise')::integer, 0);
  ohne_satz := coalesce((stand ->> 'ohneRabattsatz')::integer, 0);

  -- Ohne `p_menge` alle Zeilen in einem Zug (`limit null`), wie bisher.
  for z in select * from public.datanorm_zeilen where lauf_id = p_lauf order by zeile limit p_menge loop
    erledigt := erledigt || z.id;
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

  /*
    Die abgearbeiteten Zeilen gehen aus dem Zwischenlager — am Ende des
    Laufs alle (wie bisher: sie würden sonst in jeder nächtlichen Sicherung
    und jedem DSGVO-Auszug mitfahren), dazwischen die dieses Blocks. So
    steht im Zwischenlager immer genau, was noch offen ist.
  */
  delete from public.datanorm_zeilen where lauf_id = p_lauf and id = any (erledigt);
  select count(*) into offen from public.datanorm_zeilen where lauf_id = p_lauf;

  if offen > 0 then
    /*
      DER ZWISCHENSTAND STEHT AM LAUF: was übernommen ist, was offen. Bricht
      die Übernahme zwischen zwei Blöcken ab (Netz, geschlossenes Fenster),
      ist an dieser Stelle abzulesen, wie weit sie kam, und ein neuer Aufruf
      setzt fort, statt von vorn zu beginnen.
    */
    update public.datanorm_laeufe set
      bericht = coalesce(bericht, '{}'::jsonb) || jsonb_build_object('zwischenstand', ergebnis || jsonb_build_object('offen', offen))
    where id = p_lauf;
    return ergebnis || jsonb_build_object('fertig', false, 'offen', offen);
  end if;

  update public.datanorm_laeufe set
    status = 'uebernommen',
    abgeschlossen_am = now(),
    bericht = (coalesce(bericht, '{}'::jsonb) - 'zwischenstand') || jsonb_build_object('uebernahme', ergebnis)
  where id = p_lauf;

  return ergebnis || jsonb_build_object('fertig', true, 'offen', 0);
end;
$$;

revoke all on function public.datanorm_uebernehmen(uuid, integer) from public, anon;
grant execute on function public.datanorm_uebernehmen(uuid, integer) to authenticated;
