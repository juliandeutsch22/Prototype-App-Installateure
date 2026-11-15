-- Durchsicht 15.11.2026, G7: eine Rundung für Geld — und der Skontobetrag
-- des Belegs wird festgehalten.
--
-- DIE APP RUNDET JETZT WIE DIE DATENBANK. Bis hierher rundete sie auf der
-- Gleitkommazahl: 2 % Skonto auf 106,75 € ergaben in der App 2,13 €, hier
-- (`round(numeric, 2)` in `app.skonto_passt`) 2,14 €. An den Funktionen der
-- Datenbank ändert sich dafür nichts — sie runden schon kaufmännisch auf dem
-- Dezimalwert (`app.skonto_passt`, die Rücklassprüfung in
-- `rechnung_anlegen`, `app.mahnforderung`, `verkaufspreise_vorschlagen`).
--
-- WAS DIESE MIGRATION TUT: Sie hält den Skontobetrag fest, den eine Rechnung
-- zusagt. Er stand bisher nur im Zahlungssatz des PDFs („abzüglich 2 %
-- Skonto: 104,61 €“) und wurde bei jedem Nachdruck aus Satz und Betrag neu
-- gerechnet. Mit der neuen Rundung ergäbe der Nachdruck einer älteren
-- Rechnung genau an der Halbcent-Grenze einen anderen Betrag als das
-- Original. Ein ausgestellter Beleg wird nicht neu gerechnet: Rechnungen ab
-- jetzt tragen den Betrag, ältere bleiben ohne (null) — für sie gibt die App
-- die damalige Rundung wieder (`src/features/invoices/rundungBisher.ts`).
-- Bestehende Zeilen werden nicht angefasst.
--
-- Verträglich mit der alten App: sie kennt die Spalte nicht und schreibt sie
-- nicht; der Auslöser setzt sie bei jeder neuen Rechnung selbst.

alter table public.invoices
  add column if not exists skonto_zugesagt numeric(12,2);

comment on column public.invoices.skonto_zugesagt is
  'Zugesagter Skonto in Euro, wie er auf dem Beleg steht: round((total_brutto − ruecklass_betrag) × skonto_prozent / 100, 2) — gesetzt beim Anlegen von app.skonto_zugesagt_festhalten, danach eingefroren. Null ohne Skonto und bei Rechnungen vor dem 15.11.2026.';

/*
  DER BETRAG KOMMT VON HIER, nicht von der App. Dieselbe Formel prüft
  `app.skonto_passt` beim Ausgleich — so kann das, was der Beleg verspricht,
  nicht von dem abweichen, was die Datenbank zulässt.

  Der Name des Auslösers (`invoices_zugesagter_skonto`) ordnet ihn nach
  `invoices_vorrechnungen` ein: Postgres ruft Auslöser derselben Art in der
  Reihenfolge ihrer Namen auf. Keiner der früheren ändert Betrag, Rücklass
  oder Skontosatz; stünde doch einer davor, rechnete dieser mit dem Ergebnis.
*/
create or replace function app.skonto_zugesagt_festhalten() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  new.skonto_zugesagt := case
    when new.skonto_prozent is null then null
    else round((new.total_brutto - coalesce(new.ruecklass_betrag, 0)) * new.skonto_prozent / 100, 2)
  end;
  return new;
end;
$$;

revoke all on function app.skonto_zugesagt_festhalten() from public, anon, authenticated;

drop trigger if exists invoices_zugesagter_skonto on public.invoices;
create trigger invoices_zugesagter_skonto
  before insert on public.invoices
  for each row execute function app.skonto_zugesagt_festhalten();

/*
  Die Fassung aus `20261110160100_anzahlungskonten_mahnkosten.sql`; dazu
  `skonto_zugesagt`: er gehört zum Beleg wie Satz und Frist.
*/
create or replace function app.rechnung_eingefroren() returns trigger
  language plpgsql
  security definer
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
     or new.steuerbefreiung is distinct from old.steuerbefreiung
     or new.customer_id is distinct from old.customer_id
     or new.customer_name is distinct from old.customer_name
     or new.customer_vat_id is distinct from old.customer_vat_id
     or new.address is distinct from old.address
     or new.leistungsort is distinct from old.leistungsort
     or new.bestellnummer is distinct from old.bestellnummer
     or new.ruecklass_art is distinct from old.ruecklass_art
     or new.ruecklass_prozent is distinct from old.ruecklass_prozent
     or new.ruecklass_betrag is distinct from old.ruecklass_betrag
     or new.ruecklass_bis is distinct from old.ruecklass_bis
     or new.project_number is distinct from old.project_number
     or new.leistung_von is distinct from old.leistung_von
     or new.leistung_bis is distinct from old.leistung_bis
     or new.art is distinct from old.art
     or new.vorrechnungen is distinct from old.vorrechnungen
     or new.gesamt_netto is distinct from old.gesamt_netto
     or new.gesamt_vat is distinct from old.gesamt_vat
     or new.gesamt_brutto is distinct from old.gesamt_brutto
     or new.skonto_prozent is distinct from old.skonto_prozent
     or new.skonto_bis is distinct from old.skonto_bis
     or new.skonto_zugesagt is distinct from old.skonto_zugesagt then
    raise exception 'Eine ausgestellte Rechnung lässt sich nicht mehr ändern — nur stornieren'
      using errcode = '42501';
  end if;

  if not app.zahlstand_laeuft() then
    if new.bezahlt_betrag is distinct from old.bezahlt_betrag
       or new.skonto_betrag is distinct from old.skonto_betrag
       or new.mahnkosten_betrag is distinct from old.mahnkosten_betrag then
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

revoke all on function app.rechnung_eingefroren() from public, anon, authenticated;
