-- RECHNUNG IN EINEM ZUG: NUMMER ZIEHEN, BELEGE SPERREN, ANLEGEN.
--
-- Aus dem Prüflauf (25.09.2026):
--
--   P2-04 — die Ansicht rief drei Dinge nacheinander auf: `naechste_nummer`,
--   das Sperren der Zeiteinträge (ein gewöhnliches `update` vom Browser aus)
--   und `rechnung_anlegen`. Brach es dazwischen ab, blieben eine verbrauchte
--   Nummer (eine Lücke im Kreis, § 132 BAO) und gesperrte Stunden ohne
--   Rechnung zurück. Und das Sperren fragte nicht, ob die Stunde noch frei
--   war: rechneten zwei Leute gleichzeitig dieselbe Baustelle ab, standen
--   dieselben Stunden auf zwei Rechnungen.
--
--   P2-03 — ob das Material eines Handwerksscheins schon verrechnet ist,
--   wusste nur der Browser, und zwar aus den fünfzig jüngsten Rechnungen.
--   Stand der Schein auf einer älteren, kam sein Material ein zweites Mal.
--
--   P2-10 — eine Rechnung ohne Positionen oder über null Euro liess sich
--   anlegen, und das Abzeichen im Menü zählte Rechnungen als fällige
--   Mahnung, auf denen nichts mehr offen ist.

-- ---------------------------------------------------------------------------
-- Ein Beleg steht auf höchstens einer gültigen Rechnung
-- ---------------------------------------------------------------------------

/*
  DIE DATENBANK WEISS ES, NICHT DER BROWSER.

  Zeiteinträge und Anforderungen tragen `is_billed`; ein Handwerksschein
  nicht — er ist nach der Unterschrift eingefroren. Für ihn gab es deshalb
  bisher gar keine Sperre, nur die Liste im Browser. Diese Prüfung gilt für
  alle drei Arten und auf jedem Weg, auf dem eine Abdeckung entsteht.

  EIN STORNO ZÄHLT NICHT: er gibt seine Belege frei, und genau dafür gibt es
  ihn. Die Abdeckung der stornierten Rechnung bleibt als Dokument stehen.

  DIE SPERRE GILT BIS ZUM ENDE DER TRANSAKTION. Rechnen zwei Leute im selben
  Augenblick denselben Schein ab, sieht keiner die noch nicht festgeschriebene
  Zeile des anderen; der zweite wartet deshalb hier, bis der erste fertig ist,
  und findet dann dessen Rechnung.
*/
create or replace function app.beleg_nur_einmal() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  schon text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('rechnungsbeleg:' || new.art || ':' || new.ziel_id::text, 0));

  select i.invoice_number into schon
    from public.invoice_coverage c
    join public.invoices i on i.id = c.invoice_id
   where c.company_id = new.company_id
     and c.art = new.art
     and c.ziel_id = new.ziel_id
     and c.invoice_id <> new.invoice_id
     and i.payment_status <> 'Storniert'
   limit 1;

  if schon is not null then
    raise exception 'Dieser Beleg steht schon auf der Rechnung % — ein zweites Mal wird er nicht verrechnet.', schon
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_coverage_nur_einmal on invoice_coverage;
create trigger invoice_coverage_nur_einmal before insert on invoice_coverage
  for each row execute function app.beleg_nur_einmal();

-- ---------------------------------------------------------------------------
-- Anlegen: Positionen prüfen, Belege sperren — oder gar nichts
-- ---------------------------------------------------------------------------

/*
  DIE BELEGE WERDEN HIER GESPERRT, nicht mehr vom Browser vorher.

  Gesperrt wird nur, was noch frei ist (`is_billed = false`), und gezählt
  wird, wie viele es waren. Fehlt auch nur einer — inzwischen auf einer
  anderen Rechnung, gelöscht, oder aus einem anderen Betrieb —, bricht alles
  ab: keine Rechnung, keine Positionen, kein gesperrter Beleg. Eine Rechnung
  über „die Stunden, die gerade noch frei waren" wäre eine andere als die, die
  in der Vorschau stand.

  Zwei gleichzeitige Abrechnungen derselben Stunde: die zweite wartet an der
  Zeilensperre der ersten, sieht danach `is_billed = true` und bricht ab.

  DIE POSITIONSPFLICHT steht hier und nicht nur am Knopf: eine Rechnung ohne
  Positionen ist eine Rechnung über nichts, mit einer verbrauchten Nummer,
  die sich nicht mehr wegräumen lässt. „Null Euro" misst die Gesamtleistung
  und nicht die Forderung — eine Schlussrechnung, deren Anzahlung alles
  gedeckt hat, fordert zu Recht nichts mehr und ist trotzdem ein Beleg.

  `app.rechnung_legt` ist ein Merker für die Dauer dieses Aufrufs, wie
  `app.zahlstand`: Positionen und Abdeckung entstehen nur zusammen mit ihrer
  Rechnung (Riegel in `20260926101000_rechnung_nur_ueber_funktionen.sql`).

  Die Spaltenliste ist die aus `20260919180000_rechnungsarten.sql`,
  unverändert.
*/
create or replace function public.rechnung_anlegen(
  p_kopf jsonb,
  p_positionen jsonb,
  p_belege jsonb
) returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  neu public.invoices;
  kennung uuid;
  zeile jsonb;
  belegart text;
  lauf integer := 0;
  kennungen uuid[];
  gesperrt integer;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  neu := jsonb_populate_record(null::public.invoices, p_kopf);

  if p_positionen is null or jsonb_typeof(p_positionen) <> 'array'
     or jsonb_array_length(p_positionen) = 0 then
    raise exception 'Eine Rechnung ohne Positionen ist eine Rechnung über nichts — sie wird nicht angelegt.'
      using errcode = '22023';
  end if;
  if coalesce(neu.gesamt_netto, neu.total_netto, 0) <= 0 then
    raise exception 'Eine Rechnung über null Euro wird nicht angelegt — bitte die Beträge der Positionen prüfen.'
      using errcode = '22023';
  end if;

  perform set_config('app.rechnung_legt', 'ja', true);

  insert into public.invoices (
    company_id, invoice_number, project_number, customer_id, customer_name,
    invoice_date, due_date, subtotal_netto, discount_mode, discount_value,
    discount_label, discount_amount, total_netto, total_vat, total_brutto,
    vat_rate, reverse_charge, customer_vat_id, address,
    leistung_von, leistung_bis, payment_status,
    art, vorrechnungen, gesamt_netto, gesamt_vat, gesamt_brutto
  ) values (
    betrieb, neu.invoice_number, neu.project_number, neu.customer_id,
    neu.customer_name, neu.invoice_date, neu.due_date, neu.subtotal_netto,
    neu.discount_mode, neu.discount_value, neu.discount_label,
    neu.discount_amount, neu.total_netto, neu.total_vat, neu.total_brutto,
    neu.vat_rate, coalesce(neu.reverse_charge, false), neu.customer_vat_id,
    neu.address, neu.leistung_von, neu.leistung_bis,
    coalesce(neu.payment_status, 'Offen'),
    coalesce(neu.art, 'einzel'), neu.vorrechnungen,
    neu.gesamt_netto, neu.gesamt_vat, neu.gesamt_brutto
  ) returning id into kennung;

  for zeile in select * from jsonb_array_elements(p_positionen) loop
    insert into public.invoice_lines (
      company_id, invoice_id, position, label, qty, unit, unit_price, netto
    ) values (
      betrieb, kennung, lauf, zeile ->> 'label', (zeile ->> 'qty')::numeric,
      coalesce(zeile ->> 'unit', ''), (zeile ->> 'unit_price')::numeric,
      (zeile ->> 'netto')::numeric
    );
    lauf := lauf + 1;
  end loop;

  for belegart in select * from jsonb_object_keys(coalesce(p_belege, '{}'::jsonb)) loop
    select coalesce(array_agg(distinct z::uuid), '{}'::uuid[]) into kennungen
      from jsonb_array_elements_text(p_belege -> belegart) z;
    if cardinality(kennungen) = 0 then
      continue;
    end if;

    if belegart = 'time_entry' then
      update public.time_entries t
         set is_billed = true, invoice_number = neu.invoice_number
       where t.company_id = betrieb
         and t.id = any(kennungen)
         and t.is_billed = false;
      get diagnostics gesperrt = row_count;
    elsif belegart = 'material_order' then
      update public.material_orders m
         set is_billed = true, invoice_number = neu.invoice_number
       where m.company_id = betrieb
         and m.id = any(kennungen)
         and m.is_billed = false;
      get diagnostics gesperrt = row_count;
    else
      -- Scheine tragen keinen Verrechnungsstand; über sie wacht
      -- `app.beleg_nur_einmal` an der Abdeckung.
      gesperrt := cardinality(kennungen);
    end if;

    if gesperrt <> cardinality(kennungen) then
      raise exception 'Ein Teil der Belege ist inzwischen verrechnet oder gehört nicht zu diesem Betrieb — die Rechnung ist nicht angelegt und nichts ist gesperrt. Bitte die Positionen neu zusammenstellen.'
        using errcode = '23505';
    end if;

    insert into public.invoice_coverage (company_id, invoice_id, art, ziel_id)
    select betrieb, kennung, belegart, k from unnest(kennungen) k;
  end loop;

  perform set_config('app.rechnung_legt', '', true);
  return kennung;
end;
$$;

revoke all on function public.rechnung_anlegen(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.rechnung_anlegen(jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Ausstellen: die Nummer in derselben Transaktion
-- ---------------------------------------------------------------------------

/*
  DIE NUMMER KOMMT ERST, WENN DIE RECHNUNG AUCH ENTSTEHT.

  `naechste_nummer` bleibt die einzige Stelle, die zählt (K8: lückenlos, der
  Wunsch nur bei der allerersten Rechnung). Neu ist nur, dass sie in derselben
  Transaktion läuft wie das Anlegen: scheitert das Anlegen — ein Beleg ist
  inzwischen verrechnet, eine Angabe fehlt —, rollt der Zählerstand mit
  zurück, und die Nummer ist nicht verbraucht. Die Zeilensperre am Zähler
  hält dabei gleichzeitige Abrechnungen desselben Betriebs hintereinander.

  DAS FORMAT IST DAS VON `belegNummer` (src/lib/praefixe.ts):
  „<Vorsatz>-<Jahr>-<vierstellig>", ohne Vorsatz „<Jahr>-<vierstellig>".
  `lpad` würde eine fünfstellige Zahl abschneiden, `padStart` nicht —
  deshalb die Fallunterscheidung.
*/
create or replace function public.rechnung_ausstellen(
  p_kopf jsonb,
  p_positionen jsonb,
  p_belege jsonb,
  p_praefix text,
  p_jahr integer,
  p_wunsch integer default null
) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  lfd integer;
  nummer text;
  kennung uuid;
begin
  lfd := public.naechste_nummer('invoices', p_jahr, 0, p_wunsch);
  nummer := case when coalesce(p_praefix, '') = '' then '' else p_praefix || '-' end
         || p_jahr::text || '-'
         || case when lfd >= 10000 then lfd::text else lpad(lfd::text, 4, '0') end;

  kennung := public.rechnung_anlegen(
    coalesce(p_kopf, '{}'::jsonb) || jsonb_build_object('invoice_number', nummer),
    p_positionen,
    p_belege);

  return jsonb_build_object('id', kennung, 'invoice_number', nummer);
end;
$$;

revoke all on function public.rechnung_ausstellen(jsonb, jsonb, jsonb, text, integer, integer) from public, anon;
grant execute on function public.rechnung_ausstellen(jsonb, jsonb, jsonb, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Das Abzeichen zählt nur, wo noch etwas offen ist
-- ---------------------------------------------------------------------------

/*
  WORTGLEICH ZUM MAHNLAUF (`mahnlauf.ts`: `offenerRest(inv) > 0`). Eine
  Rechnung über null Euro oder eine, deren Rest längst beglichen ist, bei der
  aber der Stand noch „Überfällig" trägt, ist keine Mahnung — das Menü zeigte
  sonst eine Eins, und der Mahnlauf darunter war leer.

  Die Fassung ist die aus `20260919120000_zahlungseingaenge.sql`, bis auf die
  eine Zeile mit dem Rest.
*/
create or replace function public.offene_posten(p_heute date default current_date)
  returns table (urlaub bigint, anforderungen bigint, mahnungen bigint)
  language sql stable
  set search_path = ''
as $$
  select
    case when app.darf_urlaub_entscheiden(app.betrieb())
      then (select count(*) from public.vacations v
             where v.company_id = app.betrieb()
               and v.status = 'Beantragt')
      else 0::bigint end,

    case when app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()
      then (select count(*) from public.material_orders m
             where m.company_id = app.betrieb()
               and m.status = 'Offen')
      else 0::bigint end,

    case when app.ist_buch_oder_spitze()
      then (select count(*) from public.invoices i
             where i.company_id = app.betrieb()
               -- Wortgleich zum Teilindex `invoices_offen`; steht hier etwas
               -- anderes, greift er nicht mehr.
               and i.payment_status in ('Offen', 'Überfällig', 'Teilbezahlt')
               and i.total_brutto - i.bezahlt_betrag > 0
               and app.mahnung_faellig(i.payment_status, i.due_date, i.mahnstufe,
                                       i.gemahnt_am, i.mahnfrist, p_heute))
      else 0::bigint end
$$;
revoke all on function public.offene_posten(date) from public, anon;
grant execute on function public.offene_posten(date) to authenticated, service_role;
