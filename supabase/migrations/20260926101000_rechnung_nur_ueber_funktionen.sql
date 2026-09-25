-- EINE RECHNUNG ÄNDERT SICH NUR ÜBER DIE WEGE, DIE DAFÜR GEBAUT SIND.
--
-- Aus dem Prüflauf (25.09.2026):
--
--   P2-15 — was die Datenbank an einer Rechnung schützt, hatte Lücken:
--     * `invoice_coverage` war für die Buchhaltung frei beschreibbar
--       („for all") — wer eine Zeile löschte, machte eine verrechnete Stunde
--       wieder frei, ohne Storno.
--     * `invoice_lines` liess sich jederzeit einfügen — auch an eine längst
--       verschickte Rechnung.
--     * `app.rechnung_eingefroren` fror Fälligkeit, Anschrift, Rabatt,
--       Zwischensumme und Kunde nicht ein, und es wirkte nur beim Ändern:
--       eine Rechnung liess sich gleich als „Bezahlt" oder „Storniert"
--       ANLEGEN.
--     * „Storniert" liess sich per `update` setzen und wieder wegnehmen —
--       vorbei an `rechnung_stornieren` (gibt die Belege frei) und an
--       `rechnung_storno_aufheben` (nur am selben Tag, nur wenn nichts
--       weitergewandert ist).
--     * `rechnung_stornieren` stornierte auch eine schon stornierte Rechnung
--       noch einmal — mit neuem Stornodatum, also in einer anderen Periode.
--
--   P2-16 — das Aufheben eines Stornos prüfte nur Zeiteinträge und
--   Anforderungen darauf, ob sie inzwischen auf einer anderen Rechnung
--   stehen, nicht die Handwerksscheine.
--
-- WAS DIE APP WEITER KANN, Weg für Weg (`src/lib/db/pg/invoices.ts`,
-- `zahlungen.ts`): Anlegen über `rechnung_anlegen`/`rechnung_ausstellen`,
-- „Offen"↔„Überfällig" und das Mahnwesen per `update`, Zahlungen über
-- `zahlungseingaenge` (der Stand über `app.zahlstand_setzen`), Storno und
-- Aufheben über ihre Funktionen. Der Dienstschlüssel (Rücklauf einer
-- Sicherung) geht an den neuen Riegeln vorbei — er spielt zurück, was war.

-- ---------------------------------------------------------------------------
-- Positionen und Abdeckung entstehen nur mit ihrer Rechnung
-- ---------------------------------------------------------------------------

/*
  DER MERKER `app.rechnung_legt` wird von `rechnung_anlegen` für die Dauer
  des Aufrufs gesetzt — dasselbe Muster wie `app.zahlstand`. Ein Browser kann
  ihn nicht setzen: PostgREST reicht keine beliebigen Einstellungen durch.
*/
create or replace function app.nur_beim_anlegen() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() or coalesce(current_setting('app.rechnung_legt', true), '') = 'ja' then
    return new;
  end if;
  raise exception 'Positionen und verrechnete Belege entstehen nur zusammen mit ihrer Rechnung — eine ausgestellte Rechnung bekommt nichts dazu'
    using errcode = '42501';
end;
$$;

drop trigger if exists invoice_lines_nur_beim_anlegen on invoice_lines;
create trigger invoice_lines_nur_beim_anlegen before insert on invoice_lines
  for each row execute function app.nur_beim_anlegen();

drop trigger if exists invoice_coverage_nur_beim_anlegen on invoice_coverage;
create trigger invoice_coverage_nur_beim_anlegen before insert on invoice_coverage
  for each row execute function app.nur_beim_anlegen();

/*
  „FOR ALL" WIRD ZU „INSERT". Ändern und Löschen einer Abdeckung gibt es für
  niemanden mehr — die Freigabe eines Belegs heisst Storno. Das Anlegen bleibt
  als Richtlinie stehen, weil `rechnung_anlegen` mit den Rechten des Aufrufers
  schreibt; der Riegel oben lässt es nur innerhalb der Funktion zu.
*/
drop policy if exists invoice_coverage_schreiben on invoice_coverage;
drop policy if exists invoice_coverage_anlegen on invoice_coverage;
create policy invoice_coverage_anlegen on invoice_coverage
  for insert with check (app.darf(company_id) and app.ist_buch_oder_spitze());

-- ---------------------------------------------------------------------------
-- Eine neue Rechnung beginnt offen
-- ---------------------------------------------------------------------------

/*
  Zahlungsstand, Mahnwesen und Storno haben jeder einen eigenen Weg — keiner
  davon ist das Anlegen. Eine Rechnung, die schon „Bezahlt" auf die Welt
  kommt, trägt eine Zahlung ohne Eingang; eine, die „Storniert" beginnt,
  einen Storno ohne Datum und ohne Freigabe der Belege.
*/
create or replace function app.rechnung_beginnt_offen() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return new;
  end if;
  if new.payment_status is distinct from 'Offen'
     or coalesce(new.bezahlt_betrag, 0) <> 0
     or new.cancelled_at is not null
     or new.cancellation_note is not null
     or coalesce(new.mahnstufe, 0) <> 0
     or new.gemahnt_am is not null
     or new.mahnfrist is not null
     or new.mahnspesen is not null then
    raise exception 'Eine neue Rechnung beginnt offen — Zahlungen, Mahnungen und Storno kommen danach, jeweils über ihren eigenen Weg'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_beginnt_offen on invoices;
create trigger invoices_beginnt_offen before insert on invoices
  for each row execute function app.rechnung_beginnt_offen();

-- ---------------------------------------------------------------------------
-- Eingefroren ist alles, was auf dem Beleg steht
-- ---------------------------------------------------------------------------

/*
  DIE FASSUNG AUS `20260919180000_rechnungsarten.sql`, ergänzt um:

    * Fälligkeit, Anschrift, Zwischensumme, Rabatt und Kunde. Sie stehen auf
      dem Beleg, den der Kunde hat; eine andere Fälligkeit verschöbe den
      Mahnlauf, ein anderer Rabatt stünde gegen die Positionen.
    * STORNO NUR ÜBER DIE FUNKTIONEN. Der Wechsel nach und von „Storniert",
      das Stornodatum und der Grund ändern sich nur, wenn
      `rechnung_stornieren` oder `rechnung_storno_aufheben` laufen (beide
      setzen `app.zahlstand`). Der Dienstschlüssel geht vorbei: Prüfungen und
      Rücklauf stellen damit Stände her, die es gab.

  Der erste Block gilt wie bisher für jeden, auch für den Dienstschlüssel —
  eine ausgestellte Rechnung ändert niemand.
*/
create or replace function app.rechnung_eingefroren() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.invoice_number is distinct from old.invoice_number
     or new.invoice_date is distinct from old.invoice_date
     or new.due_date is distinct from old.due_date
     or new.total_netto is distinct from old.total_netto
     or new.total_vat is distinct from old.total_vat
     or new.total_brutto is distinct from old.total_brutto
     or new.subtotal_netto is distinct from old.subtotal_netto
     or new.discount_mode is distinct from old.discount_mode
     or new.discount_value is distinct from old.discount_value
     or new.discount_label is distinct from old.discount_label
     or new.discount_amount is distinct from old.discount_amount
     or new.vat_rate is distinct from old.vat_rate
     or new.reverse_charge is distinct from old.reverse_charge
     or new.customer_id is distinct from old.customer_id
     or new.customer_name is distinct from old.customer_name
     or new.customer_vat_id is distinct from old.customer_vat_id
     or new.address is distinct from old.address
     or new.project_number is distinct from old.project_number
     or new.leistung_von is distinct from old.leistung_von
     or new.leistung_bis is distinct from old.leistung_bis
     or new.art is distinct from old.art
     or new.vorrechnungen is distinct from old.vorrechnungen
     or new.gesamt_netto is distinct from old.gesamt_netto
     or new.gesamt_vat is distinct from old.gesamt_vat
     or new.gesamt_brutto is distinct from old.gesamt_brutto then
    raise exception 'Eine ausgestellte Rechnung lässt sich nicht mehr ändern — nur stornieren'
      using errcode = '42501';
  end if;

  if not app.zahlstand_laeuft() then
    if new.bezahlt_betrag is distinct from old.bezahlt_betrag then
      raise exception 'Der bezahlte Betrag ergibt sich aus den Zahlungseingängen'
        using errcode = '42501';
    end if;
    if new.payment_status is distinct from old.payment_status
       and (new.payment_status in ('Teilbezahlt', 'Bezahlt', 'Überzahlt')
            or (old.payment_status in ('Teilbezahlt', 'Bezahlt', 'Überzahlt')
                and new.payment_status <> 'Storniert')) then
      raise exception 'Der Zahlungsstand ergibt sich aus den Zahlungseingängen'
        using errcode = '42501';
    end if;

    if not app.ist_dienst()
       and ((new.payment_status = 'Storniert') is distinct from (old.payment_status = 'Storniert')
            or new.cancelled_at is distinct from old.cancelled_at
            or new.cancellation_note is distinct from old.cancellation_note) then
      raise exception 'Stornieren und einen Storno aufheben geht nur über die dafür vorgesehenen Wege — dort werden die Belege freigegeben und die Regeln geprüft'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Einmal storniert ist storniert
-- ---------------------------------------------------------------------------

/*
  DIE FASSUNG AUS `20260919220000_storno_abzug.sql`, mit einer Bedingung mehr
  im `update`: eine stornierte Rechnung wird nicht noch einmal storniert.
  Vorher setzte ein zweiter Storno das Stornodatum neu — der Buchungsstapel
  buchte die Gegenbuchung dann in einer anderen Periode als beim ersten
  Export, und der Grund des ersten war überschrieben.
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
  if exists (
    select 1
      from public.invoices i
     where i.company_id = app.betrieb()
       and i.id is distinct from p_id
       and i.payment_status is distinct from 'Storniert'
       and i.vorrechnungen @> jsonb_build_array(jsonb_build_object('invoiceId', p_id::text))
  ) then
    raise exception 'Diese Rechnung ist auf einer anderen abgezogen — erst diese stornieren'
      using errcode = '42501';
  end if;

  perform set_config('app.zahlstand', 'ja', true);
  update public.invoices
     set payment_status = 'Storniert',
         cancellation_note = p_grund,
         cancelled_at = now()
   where id = p_id
     and company_id = app.betrieb()
     and payment_status <> 'Storniert';
  /*
    `get diagnostics` LIEST DIE LETZTE ANWEISUNG — deshalb steht es vor dem
    Zurücksetzen des Merkers (siehe `20260919120000_zahlungseingaenge.sql`).
  */
  get diagnostics getroffen = row_count;
  perform set_config('app.zahlstand', '', true);

  if getroffen = 0 then
    if exists (select 1 from public.invoices i
                where i.id = p_id and i.company_id = app.betrieb()) then
      raise exception 'Diese Rechnung ist bereits storniert' using errcode = '22023';
    end if;
    raise exception 'Diese Rechnung gibt es nicht' using errcode = 'P0002';
  end if;

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

revoke all on function public.rechnung_stornieren(uuid, text) from public, anon;
grant execute on function public.rechnung_stornieren(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Aufheben nur, wenn auch kein Schein weitergewandert ist
-- ---------------------------------------------------------------------------

/*
  DIE FASSUNG AUS `20260925130000_storno_aufheben_nur_am_selben_tag.sql`,
  ergänzt um die Abdeckung selbst: steht irgendein Beleg dieser Rechnung —
  auch ein Handwerksschein, der keinen Verrechnungsstand trägt — inzwischen
  auf einer anderen, nicht stornierten Rechnung, bleibt der Storno. Sonst
  hinge das Material desselben Scheins an zwei gültigen Rechnungen.
*/
create or replace function public.rechnung_storno_aufheben(p_id uuid)
  returns void
  language plpgsql
  set search_path = ''
as $$
declare
  nummer text;
  storniert_am timestamptz;
  woanders text;
begin
  select i.invoice_number, i.cancelled_at into nummer, storniert_am
    from public.invoices i
   where i.id = p_id and i.company_id = app.betrieb() and i.payment_status = 'Storniert';
  if nummer is null then
    raise exception 'Diese Rechnung gibt es nicht, oder sie ist nicht storniert' using errcode = 'P0002';
  end if;

  if storniert_am is null
     or (storniert_am at time zone 'Europe/Vienna')::date <> (now() at time zone 'Europe/Vienna')::date then
    raise exception 'Ein Storno lässt sich nur am selben Tag aufheben — danach steht er in der Buchhaltung. Für die Leistung bitte eine neue Rechnung stellen.'
      using errcode = '42501';
  end if;

  select coalesce(t.invoice_number, m.invoice_number) into woanders
    from public.invoice_coverage c
    left join public.time_entries t on c.art = 'time_entry' and t.id = c.ziel_id
    left join public.material_orders m on c.art = 'material_order' and m.id = c.ziel_id
   where c.invoice_id = p_id
     and coalesce(t.is_billed, m.is_billed, false)
     and coalesce(t.invoice_number, m.invoice_number) is distinct from nummer
   limit 1;

  if woanders is null then
    select i.invoice_number into woanders
      from public.invoice_coverage c
      join public.invoice_coverage anders
        on anders.company_id = c.company_id
       and anders.art = c.art
       and anders.ziel_id = c.ziel_id
       and anders.invoice_id <> c.invoice_id
      join public.invoices i on i.id = anders.invoice_id
     where c.invoice_id = p_id
       and i.payment_status <> 'Storniert'
     limit 1;
  end if;

  if woanders is not null then
    raise exception 'Die Leistung dieser Rechnung steht inzwischen auf %. Der Storno bleibt — sonst hinge sie an zwei Rechnungen.', woanders
      using errcode = '42501';
  end if;

  perform set_config('app.zahlstand', 'ja', true);
  update public.invoices
     set payment_status = 'Offen',
         cancellation_note = null,
         cancelled_at = null
   where id = p_id and company_id = app.betrieb();
  perform set_config('app.zahlstand', '', true);

  update public.time_entries t
     set is_billed = true, invoice_number = nummer
    from public.invoice_coverage c
   where c.invoice_id = p_id and c.art = 'time_entry' and t.id = c.ziel_id;

  update public.material_orders m
     set is_billed = true, invoice_number = nummer
    from public.invoice_coverage c
   where c.invoice_id = p_id and c.art = 'material_order' and m.id = c.ziel_id;

  -- Und jetzt das, was die Zahlungen sagen.
  perform app.zahlstand_setzen(p_id);
end;
$$;

revoke all on function public.rechnung_storno_aufheben(uuid) from public, anon;
grant execute on function public.rechnung_storno_aufheben(uuid) to authenticated;
