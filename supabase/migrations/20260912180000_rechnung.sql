-- Rechnung und Angebot: Nummernkreis, Anlegen, Storno, Storno-Aufhebung.

-- ---------------------------------------------------------------------------
-- Der Nummernkreis kann jetzt, was die Datenschicht schon konnte
-- ---------------------------------------------------------------------------

/*
  DREI DINGE FEHLTEN, UND JEDES HAT EINEN GRUND IM BETRIEB.

  1. ALTBESTAND (`p_seed`). Ein Betrieb, der die App einfuehrt, steht nicht
     bei null. Ohne den Startwert finge sein Nummernkreis wieder bei vorne an
     — und der Steuerberater haette zwei Rechnungen mit derselben Nummer.
     Er zaehlt nur beim allerersten Aufruf, wenn es den Zaehler noch nicht
     gibt; danach ist der Zaehler die Wahrheit.

  2. WUNSCHNUMMER (`p_wunsch`). Wer von Hand eine hoehere Nummer setzt, fuehrt
     bewusst seinen bestehenden Kreis fort. Eine bereits verbrauchte Nummer
     wird abgelehnt, und der Fehlertext nennt die naechste freie: wer eine
     Nummer von Hand setzt, will wissen, welche stattdessen geht, und nicht
     bloss, dass es nicht ging.

  3. DER START BEI 1001 FUER RECHNUNGEN. „RE-2026-0001" sieht nach der ersten
     Rechnung des Betriebs aus, und das ist eine Auskunft an jeden Kunden, die
     niemand geben will. Angebote fangen weiterhin bei 1 an — dort ist es
     gleichgueltig.

  Die alte Fassung mit zwei Parametern wird ersetzt, nicht ergaenzt: zwei
  Funktionen gleichen Namens waeren beim Aufruf mehrdeutig.
*/
drop function if exists public.naechste_nummer(text, integer);

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
  betrieb := app.betrieb();
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_art = 'invoices' and not app.ist_buch_oder_spitze() then
    raise exception 'Nur die Buchhaltung vergibt Rechnungsnummern' using errcode = '42501';
  end if;
  if p_art = 'quotes' and not (app.ist_fuehrung() or app.ist_buch_oder_spitze()) then
    raise exception 'Nur die Führung vergibt Angebotsnummern' using errcode = '42501';
  end if;

  -- Anlegen, falls es den Zaehler nicht gibt — mit dem Altbestand als Stand.
  insert into public.number_counters (company_id, art, jahr, stand)
       values (betrieb, p_art, p_jahr, greatest(coalesce(p_seed, 0), 0))
  on conflict (company_id, art, jahr) do nothing;

  -- `for update` sperrt die Zeile fuer die Dauer der Transaktion. Zwei
  -- gleichzeitige Abrechnungen koennen sich damit nicht dieselbe Nummer
  -- holen: die zweite wartet und liest den bereits erhoehten Stand.
  select c.stand into letzte from public.number_counters c
   where c.company_id = betrieb and c.art = p_art and c.jahr = p_jahr
     for update;

  if p_wunsch is null then
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
    neu := p_wunsch;
  end if;

  update public.number_counters
     set stand = neu, updated_at = now()
   where company_id = betrieb and art = p_art and jahr = p_jahr;

  return neu;
end;
$$;

revoke all on function public.naechste_nummer(text, integer, integer, integer) from public;
grant execute on function public.naechste_nummer(text, integer, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Eine Rechnung entsteht in einem Zug
-- ---------------------------------------------------------------------------

/*
  KOPF, POSITIONEN UND ABDECKUNG ZUSAMMEN.

  In Firestore war das ein Dokument: Positionen als Array darin, die drei
  Verknuepfungslisten als Arrays von Kennungen. Hier sind es drei Tabellen.
  Getrennt geschrieben stuende nach einem Abbruch eine Rechnung ohne
  Positionen da — eine Rechnung ueber nichts, mit einer verbrauchten Nummer,
  die sich nach § 132 BAO auch nicht mehr wegraeumen laesst.

  Die Positionen sind KOPIEN. Aendert morgen jemand den Artikelpreis, bleibt
  auf der Rechnung stehen, was der Kunde bezahlt hat.
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
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  neu := jsonb_populate_record(null::public.invoices, p_kopf);
  insert into public.invoices (
    company_id, invoice_number, project_number, customer_id, customer_name,
    invoice_date, due_date, subtotal_netto, discount_mode, discount_value,
    discount_label, discount_amount, total_netto, total_vat, total_brutto,
    vat_rate, reverse_charge, customer_vat_id, address,
    leistung_von, leistung_bis, payment_status
  ) values (
    betrieb, neu.invoice_number, neu.project_number, neu.customer_id,
    neu.customer_name, neu.invoice_date, neu.due_date, neu.subtotal_netto,
    neu.discount_mode, neu.discount_value, neu.discount_label,
    neu.discount_amount, neu.total_netto, neu.total_vat, neu.total_brutto,
    neu.vat_rate, coalesce(neu.reverse_charge, false), neu.customer_vat_id,
    neu.address, neu.leistung_von, neu.leistung_bis,
    coalesce(neu.payment_status, 'Offen')
  ) returning id into kennung;

  for zeile in select * from jsonb_array_elements(coalesce(p_positionen, '[]'::jsonb)) loop
    insert into public.invoice_lines (
      company_id, invoice_id, position, label, qty, unit, unit_price, netto
    ) values (
      betrieb, kennung, lauf, zeile ->> 'label', (zeile ->> 'qty')::numeric,
      coalesce(zeile ->> 'unit', ''), (zeile ->> 'unit_price')::numeric,
      (zeile ->> 'netto')::numeric
    );
    lauf := lauf + 1;
  end loop;

  /*
    `p_belege` kommt als { art: [kennung, …] }. Als Tabelle laesst sich das
    in beide Richtungen lesen: „was deckt diese Rechnung ab" UND „ist diese
    Buchung schon verrechnet" — die zweite Frage war bisher nur ueber das
    Feld is_billed zu beantworten, also ueber eine Kopie, die auseinander
    laufen kann.
  */
  -- `belegart` und nicht `art`: die Zieltabelle hat selbst eine Spalte `art`,
  -- und Postgres kann eine Variable dieses Namens dort nicht von ihr
  -- unterscheiden.
  for belegart in select * from jsonb_object_keys(coalesce(p_belege, '{}'::jsonb)) loop
    insert into public.invoice_coverage (company_id, invoice_id, art, ziel_id)
    select betrieb, kennung, belegart, z::uuid
      from jsonb_array_elements_text(p_belege -> belegart) z
    on conflict (invoice_id, art, ziel_id) do nothing;
  end loop;

  return kennung;
end;
$$;

revoke all on function public.rechnung_anlegen(jsonb, jsonb, jsonb) from public;
grant execute on function public.rechnung_anlegen(jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Storno und Storno-Aufhebung
-- ---------------------------------------------------------------------------

/*
  BEIDES BRAUCHT EINE KLAMMER, UND ZWAR EINE ECHTE.

  In Firestore war es ein Stapel; er ging ganz durch oder gar nicht, aber nur,
  solange die Zahl der Belege unter 500 blieb. Hier ist es eine Transaktion
  ohne diese Grenze.

  Was ohne Klammer passiert:

    Storno halb durch    → Rechnung storniert, Stunden weiter verrechnet. Sie
                           stehen auf keiner gueltigen Rechnung und lassen
                           sich auf keine neue nehmen. Geld, das nie wieder
                           eingefordert wird.

    Aufhebung halb durch → Rechnung wieder offen, Stunden frei. Sie koennen
                           ein ZWEITES Mal verrechnet werden — dieselbe Stunde
                           auf zwei Rechnungen an denselben Kunden.

  Welche Belege betroffen sind, steht in `invoice_coverage` und nicht im
  Aufruf: der Aufrufer koennte eine unvollstaendige Liste schicken, und dann
  bliebe genau der halbe Zustand stehen, den die Klammer verhindern soll.

  Handwerksscheine werden NICHT freigegeben — sie tragen keinen
  Verrechnungsstand. Ein unterschriebener Schein ist eingefroren; dass die
  Rechnung ihn verbraucht hat, merkt sich die Rechnung. Der Storno gibt ihn
  damit von selbst wieder frei.
*/
create or replace function public.rechnung_stornieren(
  p_id uuid,
  p_grund text
) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  getroffen integer;
begin
  update public.invoices
     set payment_status = 'Storniert',
         cancellation_note = p_grund,
         cancelled_at = now()
   where id = p_id and company_id = app.betrieb();

  get diagnostics getroffen = row_count;
  if getroffen = 0 then
    raise exception 'Diese Rechnung gibt es nicht' using errcode = 'P0002';
  end if;

  /*
    `null` statt Leerstring. In Firestore stand dort '' — die Sammlung kannte
    kein Loeschen eines Felds, und die leere Nummer war das Zeichen fuer
    „gehoert zu keiner Rechnung mehr". Eine Spalte kann leer sein; das ist
    dieselbe Aussage, nur ohne Behelf. Die Richtlinien pruefen ohnehin
    `coalesce(invoice_number, '') = ''`.
  */
  update public.time_entries t
     set is_billed = false, invoice_number = null
    from public.invoice_coverage c
   where c.invoice_id = p_id and c.art = 'time_entry' and t.id = c.ziel_id;

  update public.material_orders m
     set is_billed = false, invoice_number = null
    from public.invoice_coverage c
   where c.invoice_id = p_id and c.art = 'material_order' and m.id = c.ziel_id;
end;
$$;

revoke all on function public.rechnung_stornieren(uuid, text) from public;
grant execute on function public.rechnung_stornieren(uuid, text) to authenticated;

/*
  Hebt einen Storno wieder auf. Ein Fehlstorno war sonst nur durch Loeschen
  und vollstaendiges Neuerstellen zu heilen — inklusive neuer Nummer, also
  einer Luecke im Kreis.
*/
create or replace function public.rechnung_storno_aufheben(p_id uuid)
  returns void
  language plpgsql
  set search_path = ''
as $$
declare
  nummer text;
begin
  update public.invoices
     set payment_status = 'Offen',
         cancellation_note = null,
         cancelled_at = null
   where id = p_id and company_id = app.betrieb()
  returning invoice_number into nummer;

  if nummer is null then
    raise exception 'Diese Rechnung gibt es nicht' using errcode = 'P0002';
  end if;

  update public.time_entries t
     set is_billed = true, invoice_number = nummer
    from public.invoice_coverage c
   where c.invoice_id = p_id and c.art = 'time_entry' and t.id = c.ziel_id;

  update public.material_orders m
     set is_billed = true, invoice_number = nummer
    from public.invoice_coverage c
   where c.invoice_id = p_id and c.art = 'material_order' and m.id = c.ziel_id;
end;
$$;

revoke all on function public.rechnung_storno_aufheben(uuid) from public;
grant execute on function public.rechnung_storno_aufheben(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Angebot: Kopf und Positionen zusammen
-- ---------------------------------------------------------------------------

/*
  Dasselbe wie bei der Rechnung, mit einem Unterschied: ein Angebot DARF sich
  noch aendern. Also schreibt diese Funktion beides, anlegen wie aendern.

  `p_positionen = null` heisst UNBERUEHRT LASSEN. Die Ansicht schickt beim
  Aendern zwar immer alles mit, aber „leer" und „nicht mitgeschickt" duerfen
  nicht dasselbe bedeuten — sonst raeumte ein Teilschreiben die Kalkulation ab.

  Die Positionen sind auch hier KOPIEN: ein Angebot ist ein Versprechen zu
  einem Preis, und das gilt auch dann noch, wenn der Einkauf teurer geworden
  ist.
*/
create or replace function public.angebot_speichern(
  p_id uuid,
  p_kopf jsonb,
  p_positionen jsonb
) returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
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
        company_id, quote_id, position, label, qty, unit, unit_price, netto
      ) values (
        betrieb, kennung, lauf, zeile ->> 'label', (zeile ->> 'qty')::numeric,
        coalesce(zeile ->> 'unit', ''), (zeile ->> 'unit_price')::numeric,
        (zeile ->> 'netto')::numeric
      );
      lauf := lauf + 1;
    end loop;
  end if;

  return kennung;
end;
$$;

revoke all on function public.angebot_speichern(uuid, jsonb, jsonb) from public;
grant execute on function public.angebot_speichern(uuid, jsonb, jsonb) to authenticated;
