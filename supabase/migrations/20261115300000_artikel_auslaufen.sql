/*
  EIN ARTIKEL MIT SPUREN WIRD NICHT GELÖSCHT, SONDERN LÄUFT AUS
  (Durchsicht 15.11.2026, M1).

  WAS DIE DURCHSICHT FAND.
  - Ein Artikel mit Bestand liess sich ohne Warnung löschen: das
    Bewegungsprotokoll (`lagerbewegungen`, `on delete cascade`) und der
    Bestand an weiteren Orten (`lagerbestaende`, ebenso) gingen still mit.
    Das widerspricht M28 („der Bestand ändert sich nur über Bewegungen“) —
    eine Bewegung, die mit ihrem Artikel verschwindet, hat es nie gegeben.
  - Ein einmal angeforderter oder auf einer Rüstliste geplanter Artikel liess
    sich gar nicht löschen (Fremdschlüssel ohne Löschregel), die App meldete
    nur „Die Aktion konnte nicht ausgeführt werden“ — und einen Ausweg gab es
    nicht: „ausgelaufen“ setzte nur der DATANORM-Import.

  WAS JETZT GILT.
  1. Gelöscht wird ein Artikel nur, wenn nichts daran hängt — kein Bestand
     (Hauptlager oder weiterer Ort), keine Buchung im Bewegungsprotokoll,
     keine Anforderung oder Retoure, keine Rüstliste, kein Handwerksschein,
     kein offener Posten auf der Einkaufsliste. Sonst weist die Datenbank das
     Löschen ab und sagt, was im Weg steht. Die Sperre steht hier und nicht in
     der Ansicht: auch die alte App auf einem Telefon oder der Import nehmen
     nichts mehr still mit.
  2. Das Bewegungsprotokoll hängt nicht mehr am Löschen des Artikels: der
     Fremdschlüssel verweist ohne `cascade` — das gilt auch für den
     Dienstschlüssel, den die Sperre aus 1 wie üblich durchlässt.
  3. Statt zu löschen lässt man auslaufen. Den Zustand gibt es schon
     (`materials.ausgelaufen`, seit `20260920140000_datanorm_uebernahme.sql`)
     samt seiner Regeln: kein Angebot mehr am Schein, in der Rüstliste, im
     Angebot und bei den Posten der Einkaufsliste; „Material anfordern“ nur,
     solange noch etwas im Lager liegt (Prüfbericht 10.11.2026 — den Rest
     aufzubrauchen ist erwünscht). Neu ist nur, dass der Betrieb ihn von Hand
     setzen kann (`artikel_auslaufen`) — und dass der Katalog eines
     Großhändlers diese Entscheidung nicht zurücknimmt (4).
  4. `ausgelaufen_von_hand`: der Import und `app.stamm_nachziehen` setzen
     `ausgelaufen` aus den Lieferantenartikeln; ohne Merker holte die nächste
     DATANORM-Datei einen von Hand ausgelaufenen Artikel wieder in jede
     Auswahl zurück. Zurück holt ihn nur „Wieder aufnehmen“.
  5. Die Bestellvorschläge schlagen keinen ausgelaufenen Artikel mehr vor —
     nachbestellt wird, was der Betrieb weiter führt.

  ALTDATEN. Nichts wird umgeschrieben: die neue Spalte steht für jeden
  bestehenden Artikel auf `false` (wie bisher: ausgelaufen nur durch den
  Import), bestehende Protokollzeilen bleiben, wie sie sind.

  ALTE APP. Sie kennt die Spalte und die Funktionen nicht und braucht sie
  nicht: ihr Löschen bekommt jetzt den Grund der Datenbank statt der
  Fremdschlüssel-Meldung, alles andere bleibt für sie gleich.
*/

-- ---------------------------------------------------------------------------
-- 1. Von Hand ausgelaufen
-- ---------------------------------------------------------------------------

alter table public.materials
  add column if not exists ausgelaufen_von_hand boolean not null default false;

comment on column public.materials.ausgelaufen_von_hand is
  'Der Betrieb hat den Artikel selbst auslaufen lassen (artikel_auslaufen). '
  'Der Katalog eines Großhändlers holt ihn dann nicht zurück; das tut nur „Wieder aufnehmen“.';

-- Von Hand ausgelaufen ohne ausgelaufen zu sein, wäre ein Merker ohne Sache.
alter table public.materials drop constraint if exists materials_von_hand_nur_ausgelaufen;
alter table public.materials
  add constraint materials_von_hand_nur_ausgelaufen check (not ausgelaufen_von_hand or ausgelaufen);

/*
  WORAN „VON HAND“ ERKANNT WIRD: an einer Einstellung, die nur
  `artikel_auslaufen` für die Dauer seiner Änderung setzt. `current_user`
  taugt hier nicht wie in `app.materialfelder_geschuetzt`: der
  DATANORM-Import läuft mit den Rechten des Aufrufers, für die Datenbank
  also genauso „authenticated“ wie eine Änderung aus der Maske.

  Jeder andere Weg — Import, `app.stamm_nachziehen`, eine direkte Änderung
  an der Tabelle — lässt den Merker, wie er ist, und einen von Hand
  ausgelaufenen Artikel ausgelaufen. Still, nicht mit Fehler: ein Import
  soll an einer Entscheidung des Betriebs nicht scheitern, sondern sie
  stehen lassen.
*/
create or replace function app.ausgelaufen_von_hand_bleibt() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if coalesce(current_setting('app.auslaufen_von_hand', true), '') = 'ja' then
    return new;
  end if;
  new.ausgelaufen_von_hand := old.ausgelaufen_von_hand;
  if old.ausgelaufen_von_hand then
    new.ausgelaufen := true;
  end if;
  return new;
end;
$$;

revoke all on function app.ausgelaufen_von_hand_bleibt() from public, anon, authenticated;

drop trigger if exists materials_ausgelaufen_von_hand on public.materials;
create trigger materials_ausgelaufen_von_hand
  before update on public.materials
  for each row execute function app.ausgelaufen_von_hand_bleibt();

-- ---------------------------------------------------------------------------
-- 2. Was an einem Artikel hängt
-- ---------------------------------------------------------------------------

/*
  EINE STELLE FÜR DIE FRAGE, aus der die Sperre (4) und die Rückfrage der
  App (3) lesen — damit der Dialog nie etwas anderes verspricht, als die
  Datenbank dann tut.

  WAS ZÄHLT, UND WARUM GERADE DAS:
  - Bestand im Hauptlager und an weiteren Orten: ein gelöschter Artikel
    nähme ihn mit, ohne Bewegung.
  - Das Bewegungsprotokoll: es ist der Nachweis jeder Bestandsänderung.
  - Anforderungen und Retouren: sie tragen Abholung, Rechnungsvorschlag und
    Gegenbuchung; ihr Fremdschlüssel verweigert das Löschen ohnehin.
  - Rüstlisten: ebenso.
  - Handwerksscheine: die Zeile trägt Name, Menge und Einheit, den
    Verkaufspreis für die Rechnung schlägt die App aber über den Artikel
    nach (`20261024200000_schein_material_katalog.sql`). Ohne Artikel stünde
    das Material eines noch nicht verrechneten Scheins „ohne Preis“ da.
  - Offene Posten der Einkaufsliste: „Geliefert“ bucht auf den Artikel.
    Gelieferte Posten haben eine Buchung und zählen dort.

  WAS NICHT ZÄHLT: Angebots- und Rechnungszeilen tragen Bezeichnung, Menge
  und Preis selbst und verlieren beim Löschen nur den Verweis (`on delete
  set null`, so entschieden und geprüft in `angebotPositionen.test.ts`).
  Lieferantenartikel und Preise sind Katalogdaten des Großhändlers, keine
  Spur des Betriebs; sie werden wie bisher gelöst.

  Zurück kommen die Gründe als Sätze für Menschen (`im_weg`, leer = frei)
  und der Zustand des Artikels.
*/
create or replace function app.artikel_verwendung(p_material uuid) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  m public.materials;
  e text;
  n bigint;
  menge numeric;
  im_weg text[] := '{}';
begin
  select * into m from public.materials x where x.id = p_material;
  if m.id is null then
    return null;
  end if;
  e := coalesce(nullif(btrim(m.unit), ''), 'Stk');

  if coalesce(m.stock, 0) <> 0 then
    im_weg := im_weg || format('%s %s im Lager', replace(trim_scale(m.stock)::text, '.', ','), e);
  end if;

  select count(*), coalesce(sum(b.menge), 0) into n, menge
    from public.lagerbestaende b
   where b.material_id = m.id and b.menge > 0;
  if n > 0 then
    im_weg := im_weg || format('%s %s %s', replace(trim_scale(menge)::text, '.', ','), e,
      case when n = 1 then 'an einem weiteren Lagerort oder Fahrzeug'
           else format('an %s weiteren Lagerorten oder Fahrzeugen', n) end);
  end if;

  select count(*) into n from public.lagerbewegungen g where g.material_id = m.id;
  if n > 0 then
    im_weg := im_weg || case when n = 1 then '1 Buchung im Bewegungsprotokoll'
                             else format('%s Buchungen im Bewegungsprotokoll', n) end;
  end if;

  select count(*) into n from public.material_orders o
   where o.material_id = m.id and o.transaction_type = 'order';
  if n > 0 then
    im_weg := im_weg || case when n = 1 then '1 Anforderung' else format('%s Anforderungen', n) end;
  end if;

  select count(*) into n from public.material_orders o
   where o.material_id = m.id and o.transaction_type = 'return';
  if n > 0 then
    im_weg := im_weg || case when n = 1 then '1 Retoure' else format('%s Retouren', n) end;
  end if;

  select count(distinct p.einsatz_material_id) into n
    from public.einsatz_material_positionen p where p.material_id = m.id;
  if n > 0 then
    im_weg := im_weg || case when n = 1 then '1 Rüstliste' else format('%s Rüstlisten', n) end;
  end if;

  -- Die Kennung am Schein ist kein Fremdschlüssel (offline geschrieben) — daher auch nach dem Betrieb.
  select count(distinct s.work_sheet_id) into n
    from public.work_sheet_material s where s.material_id = m.id and s.company_id = m.company_id;
  if n > 0 then
    im_weg := im_weg || case when n = 1 then '1 Handwerksschein' else format('%s Handwerksscheine', n) end;
  end if;

  select count(*) into n from public.einkauf_posten k
   where k.material_id = m.id and k.geliefert_am is null;
  if n > 0 then
    im_weg := im_weg || case when n = 1 then '1 offener Posten auf der Einkaufsliste'
                             else format('%s offene Posten auf der Einkaufsliste', n) end;
  end if;

  return jsonb_build_object(
    'im_weg', to_jsonb(im_weg),
    'ausgelaufen', m.ausgelaufen,
    'von_hand', m.ausgelaufen_von_hand);
end;
$$;

revoke all on function app.artikel_verwendung(uuid) from public, anon, authenticated;

-- Die Suche nach Scheinen mit diesem Artikel — ohne Index ginge sie über alle Scheinzeilen.
create index if not exists work_sheet_material_artikel
  on public.work_sheet_material (material_id) where material_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Die Rückfrage der App
-- ---------------------------------------------------------------------------

/*
  Für „Material löschen …“: was im Weg steht, bevor jemand bestätigt. Wer
  fragen darf, wie bei `materials_loeschen` — wer den Katalog pflegt. Ein
  fremder Artikel sieht aus wie einer, den es nicht gibt.
*/
create or replace function public.artikel_verwendung(p_material uuid) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text;
begin
  select m.company_id into betrieb from public.materials m where m.id = p_material;
  if betrieb is null
     or not coalesce(betrieb = (select app.lesebetrieb()) or betrieb = (select app.supportbetrieb()), false) then
    raise exception 'Diesen Artikel gibt es nicht' using errcode = 'P0002';
  end if;
  if not coalesce((select app.hat_rolle(array['Verwaltung'])) or (select app.ist_fuehrung()), false) then
    raise exception 'Was an einem Artikel hängt, sieht, wer den Katalog pflegt — die Verwaltung oder die Führung'
      using errcode = '42501';
  end if;
  return app.artikel_verwendung(p_material);
end;
$$;

revoke all on function public.artikel_verwendung(uuid) from public, anon;
grant execute on function public.artikel_verwendung(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Die Sperre beim Löschen
-- ---------------------------------------------------------------------------

/*
  VOR DEM LÖSCHEN, mit dem Grund in Worten — bis hierher kam beim
  Fremdschlüssel nur „violates foreign key constraint“ an, und das zeigt
  die App als festen Satz ohne Auskunft.

  Für jedes angemeldete Konto — die App, die alte App auf einem Telefon,
  den DATANORM-Import (er läuft mit den Rechten des Aufrufers) und jeden
  anderen Weg über die Schnittstelle. Der Dienstschlüssel bleibt aussen
  vor, wie beim Wächter der Bewegungen (`20260930380000_lagerbewegungen.sql`)
  und der Felder (`app.materialfelder_geschuetzt`): mit ihm löschen
  `betrieb_loeschen_ausfuehren` einen ganzen Betrieb und die Prüfungen ihre
  Betriebe Tabelle für Tabelle. Das Protokoll nimmt aber auch er nicht mit —
  das hält der Fremdschlüssel unten.
*/
create or replace function app.artikel_loeschen_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  stand jsonb;
  im_weg text;
begin
  if app.ist_dienst() then
    return old;
  end if;
  stand := app.artikel_verwendung(old.id);
  select string_agg(x, ', ') into im_weg from jsonb_array_elements_text(stand -> 'im_weg') as x;
  if im_weg is not null then
    raise exception '„%“ lässt sich nicht löschen — daran hängen: %. Stattdessen auslaufen lassen: dann wird er nicht mehr angeboten und bleibt überall lesbar, wo er schon steht.',
      old.name, im_weg
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke all on function app.artikel_loeschen_pruefen() from public, anon, authenticated;

drop trigger if exists materials_loeschen_nur_ohne_spuren on public.materials;
create trigger materials_loeschen_nur_ohne_spuren
  before delete on public.materials
  for each row execute function app.artikel_loeschen_pruefen();

/*
  DAS PROTOKOLL HÄNGT NICHT MEHR AM ARTIKEL. Die Sperre oben lässt einen
  Artikel mit Buchungen nicht mehr durch; ohne `cascade` hält der
  Fremdschlüssel auch dort dagegen, wo die Sperre nicht greift (Dienst-
  schlüssel). Beim Löschen eines ganzen Betriebs scheitert der Artikel so
  lange, wie sein Protokoll noch steht, und kommt in der nächsten Runde dran
  — `betrieb_loeschen_ausfuehren` geht genau dafür in Runden.
*/
alter table public.lagerbewegungen drop constraint if exists lagerbewegungen_material_id_fkey;
alter table public.lagerbewegungen
  add constraint lagerbewegungen_material_id_fkey
  foreign key (material_id) references public.materials (id);

-- ---------------------------------------------------------------------------
-- 5. Auslaufen lassen und wieder aufnehmen
-- ---------------------------------------------------------------------------

/*
  Setzt `ausgelaufen` und den Merker in einem Zug. Wer darf, wie bei
  `materials_loeschen` und wie `app.materialfelder_geschuetzt` es für
  „ausgelaufen“ verlangt: die Verwaltung oder die Führung. Geschrieben wird
  nur, was der Riegel `support_schreibt_nicht` an der Zeile durchlässt.

  Die Einstellung lebt nur für diese eine Änderung — danach behandelt der
  Auslöser (1) jede weitere Änderung in derselben Transaktion wieder als
  „nicht von Hand“.
*/
create or replace function public.artikel_auslaufen(p_material uuid, p_aus boolean) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text;
begin
  if p_aus is null then
    raise exception 'Auslaufen lassen oder wieder aufnehmen — eins von beiden' using errcode = '22023';
  end if;
  select m.company_id into betrieb from public.materials m where m.id = p_material for no key update;
  if betrieb is null
     or not coalesce(betrieb = (select app.lesebetrieb()) or betrieb = (select app.supportbetrieb()), false) then
    raise exception 'Diesen Artikel gibt es nicht' using errcode = 'P0002';
  end if;
  if not coalesce((select app.hat_rolle(array['Verwaltung'])) or (select app.ist_fuehrung()), false) then
    raise exception 'Auslaufen lässt einen Artikel, wer den Katalog pflegt — die Verwaltung oder die Führung'
      using errcode = '42501';
  end if;
  perform set_config('app.auslaufen_von_hand', 'ja', true);
  update public.materials
     set ausgelaufen = p_aus, ausgelaufen_von_hand = p_aus
   where id = p_material;
  perform set_config('app.auslaufen_von_hand', '', true);
end;
$$;

revoke all on function public.artikel_auslaufen(uuid, boolean) from public, anon;
grant execute on function public.artikel_auslaufen(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Bestellvorschläge ohne ausgelaufene Artikel
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in `20261108100000_materialbereitschaft.sql`; neu ist nur
  `and not m.ausgelaufen` beim Artikel. Auch eine Fehlmenge aus einer
  Rüstliste schlägt ihn nicht mehr zum Nachbestellen vor: was der
  Großhändler nicht mehr führt oder der Betrieb auslaufen lässt, wird nicht
  bestellt — die Rüstliste zeigt die Fehlmenge weiter (`materialdeckung`).
*/
create or replace function app.bestellvorschlag_stand(p_betrieb text, p_ids uuid[])
  returns table (material_id uuid, name text, einheit text, artikelnummer text,
                 mindestmenge numeric, sollbestand numeric, verpackungseinheit numeric,
                 frei numeric, zulauf numeric, grund text, menge numeric)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with heute as (
    select (now() at time zone 'Europe/Vienna')::date as d
  ),
  kandidaten as (
    select m.id
      from public.materials m
     where m.company_id = p_betrieb
       and m.lagerartikel
       and m.mindestmenge is not null
       and (p_ids is null or m.id = any (p_ids))
    union
    select p.material_id
      from public.einsatz_material_positionen p
      join public.einsatz_material e on e.id = p.einsatz_material_id
     cross join heute h
     where e.company_id = p_betrieb
       and p.material_id is not null
       and e.date >= h.d
       and not coalesce((e.geladen -> p.id) ? 'gebucht', false)
       and (p_ids is null or p.material_id = any (p_ids))
    union
    select o.material_id
      from public.material_orders o
     where o.company_id = p_betrieb
       and o.material_id is not null
       and o.transaction_type = 'order'
       and not o.processed
       and o.lagerort_id is null
       and (o.beschaffung = 'lager'
            or (o.beschaffung = 'einkauf' and o.geliefert_am is not null)
            or (o.beschaffung is null and o.status = 'Abholbereit'))
       and (p_ids is null or o.material_id = any (p_ids))
  ),
  rechnung as (
    select m.id, m.name, m.unit, m.article_number, m.mindestmenge, m.sollbestand, m.verpackungseinheit,
           app.deckung_frei_vor(p_betrieb, m.id, h.d - 1, null, null, h.d) as frei,
           coalesce((select sum(k.menge) from public.einkauf_posten k
                      where k.company_id = p_betrieb and k.material_id = m.id and k.geliefert_am is null), 0) as zulauf
      from kandidaten c
      join public.materials m on m.id = c.id and m.company_id = p_betrieb and not m.ausgelaufen
     cross join heute h
  ),
  bewertet as (
    select r.*,
           case when r.frei + r.zulauf < 0 then 'fehlmenge'
                when r.mindestmenge is not null and r.frei + r.zulauf < r.mindestmenge then 'mindestmenge'
           end as grund,
           greatest(coalesce(r.sollbestand, r.mindestmenge, 0), 0) - (r.frei + r.zulauf) as roh
      from rechnung r
  )
  select b.id, b.name, b.unit, b.article_number, b.mindestmenge, b.sollbestand, b.verpackungseinheit,
         b.frei, b.zulauf, b.grund, app.bestellmenge(b.roh, b.verpackungseinheit, b.unit)
    from bewertet b
   where b.grund is not null
     and b.roh > 0
$$;

revoke all on function app.bestellvorschlag_stand(text, uuid[]) from public, anon, authenticated;
