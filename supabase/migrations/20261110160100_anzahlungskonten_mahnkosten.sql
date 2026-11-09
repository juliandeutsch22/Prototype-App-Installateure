-- ===========================================================================
-- ANZAHLUNGSKONTEN JE STEUERBEHANDLUNG, MAHNKOSTEN UND ZINSEN ALS EIGENER
-- EINGANG, RÜCKZAHLUNG NICHT ÜBER DAS LÖSCHEN (Durchsicht 09.11.2026)
-- ===========================================================================
--
-- BEFUND 3. Der BMD-Stapel buchte jede Anzahlungsrechnung auf DAS
-- Anzahlungskonto mit dessen Steuercode. Bei Übergang der Steuerschuld
-- (Bauleistung) oder 0 % entstand so Umsatzsteuer, die niemand schuldet,
-- und die Umbuchung mit der Schlussrechnung holte vom Konto mehr, als darauf
-- stand. Der Kontenrahmen bekommt deshalb je Steuerbehandlung ein
-- Anzahlungskonto: `anzahlung` mit Steuersatz (wie `erloes`) und
-- `anzahlung_rc` für Bauleistungen. Ein Anzahlungskonto ohne Satz bleibt,
-- wie es ist (Altbestand) — der Stapel nimmt es für 20 %, die Ansicht zeigt
-- es dort, und mit dem nächsten Speichern trägt es den Satz.
--
-- BEFUND 4. Zahlte der Kunde die Mahnung — Rest, Mahnspesen, Verzugszinsen —,
-- wurde das Mehr zum Guthaben, und die Maske schlug die Rückzahlung vor;
-- Spesen und Zinsen standen nirgends als Ertrag. Jetzt gibt es dafür einen
-- eigenen Eingang der Art „Mahnkosten“: er zählt NICHT in
-- `bezahlt_betrag`, sondern in `mahnkosten_betrag`, höchstens bis zu dem, was
-- die letzte Mahnung an Spesen und Zinsen gefordert hat. Im Zahlungsstapel
-- geht er auf ein eigenes Konto (`mahnkosten`), ohne Steuer — Mahnspesen und
-- Zinsen sind Schadenersatz, kein Entgelt.
--
-- BEFUND 5. „Zurückgezahlt höchstens, was eingegangen ist“ galt nur beim
-- Schreiben eines negativen Betrags. Wer danach den Eingang löschte oder
-- verringerte, hatte mehr zurückgezahlt als eingegangen. Die Grenze gilt
-- jetzt bei jeder Änderung, je Art des Eingangs (Rechnung bzw. Mahnkosten).

-- ---------------------------------------------------------------------------
-- 1. Kontenrahmen: Anzahlungskonten je Steuerbehandlung, Mahnkosten
-- ---------------------------------------------------------------------------

alter table public.buchungskonten drop constraint if exists buchungskonten_zweck_check;
alter table public.buchungskonten add constraint buchungskonten_zweck_check
  check (zweck in ('erloes', 'reverse_charge', 'anzahlung', 'anzahlung_rc',
                   'debitoren', 'bank', 'skonto', 'mahnkosten'));

/*
  DER STEUERSATZ beim Erlöskonto Pflicht, beim Anzahlungskonto erlaubt (ohne
  ihn: Altbestand, gilt für 20 %), sonst nirgends — ein Debitorenkonto „für
  20 %" bleibt ein Widerspruch. Der Eindeutigkeitsindex je Zweck und Satz
  gilt unverändert.
*/
alter table public.buchungskonten drop constraint if exists buchungskonten_satz_nur_bei_erloes;
alter table public.buchungskonten add constraint buchungskonten_satz_nur_bei_erloes
  check (case zweck
           when 'erloes' then ust_satz is not null
           when 'anzahlung' then true
           else ust_satz is null
         end);

-- ---------------------------------------------------------------------------
-- 2. Der Eingang „Mahnkosten“ und seine Summe an der Rechnung
-- ---------------------------------------------------------------------------

alter table public.zahlungseingaenge drop constraint if exists zahlungseingaenge_art_check;
alter table public.zahlungseingaenge
  add constraint zahlungseingaenge_art_check
  check (art in ('Überweisung', 'Bar', 'Karte', 'Sonstiges', 'Skonto', 'Mahnkosten'));

alter table public.invoices
  add column if not exists mahnkosten_betrag numeric(12,2) not null default 0;

comment on column public.invoices.mahnkosten_betrag is
  'Summe der Zahlungseingänge der Art Mahnkosten (bezahlte Mahnspesen und Verzugszinsen) — geschrieben nur von app.zahlstand_setzen; zählt nicht in bezahlt_betrag.';

/*
  Die Fassung aus `20261005400000_ruecklass.sql`; dazu `mahnkosten_betrag`,
  das wie der bezahlte Betrag nur `app.zahlstand_setzen` schreibt.
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
     or new.skonto_bis is distinct from old.skonto_bis then
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

/*
  Die Fassung aus `20260929160000_skonto.sql`. Neu: Mahnkosten zählen nicht
  in den bezahlten Betrag — sie begleichen keine Forderung der Rechnung,
  sondern die der Mahnung — und stehen getrennt in `mahnkosten_betrag`.
  Ohne das wurde aus Spesen und Zinsen ein Guthaben, das zurückzuzahlen war.
*/
create or replace function app.zahlstand_setzen(p_id uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  summe      numeric(12,2);
  skonto     numeric(12,2);
  mahnkosten numeric(12,2);
  brutto     numeric(12,2);
  status     text;
  neu        text;
begin
  select coalesce(sum(z.betrag) filter (where z.art is distinct from 'Mahnkosten'), 0),
         coalesce(sum(z.betrag) filter (where z.art = 'Skonto'), 0),
         coalesce(sum(z.betrag) filter (where z.art = 'Mahnkosten'), 0)
    into summe, skonto, mahnkosten
    from public.zahlungseingaenge z where z.invoice_id = p_id;

  select i.total_brutto, i.payment_status into brutto, status
    from public.invoices i where i.id = p_id;

  if brutto is null then
    return; -- Die Rechnung gibt es nicht (mehr).
  end if;

  if status = 'Storniert' then
    neu := 'Storniert';
  elsif summe <= 0 then
    neu := case when status = 'Überfällig' then 'Überfällig' else 'Offen' end;
  elsif summe < brutto then
    neu := 'Teilbezahlt';
  elsif summe = brutto then
    neu := 'Bezahlt';
  else
    neu := 'Überzahlt';
  end if;

  perform set_config('app.zahlstand', 'ja', true);
  update public.invoices
     set bezahlt_betrag = summe,
         skonto_betrag = skonto,
         mahnkosten_betrag = mahnkosten,
         payment_status = neu
   where id = p_id
     and (bezahlt_betrag is distinct from summe
          or skonto_betrag is distinct from skonto
          or mahnkosten_betrag is distinct from mahnkosten
          or payment_status is distinct from neu);
  perform set_config('app.zahlstand', '', true);
end;
$$;

/*
  Aufgerufen aus Auslösern und Funktionen, die mit den Rechten des Aufrufers
  laufen (`rechnung_storno_aufheben`) — deshalb für angemeldete Konten
  ausführbar. Das Schema `app` ist über die Schnittstelle nicht erreichbar.
*/
revoke all on function app.zahlstand_setzen(uuid) from public, anon;
grant execute on function app.zahlstand_setzen(uuid) to authenticated, service_role;

/*
  Was die letzte Mahnung an Mahnspesen und Verzugszinsen gefordert hat.

  Die Mahnung hält ihre Kosten fest (`inhalt.kosten`), seit 09.11.2026 auch
  die Zinsen als Zahl (`inhalt.zinsen`). Ältere tragen die Zinsen nur als
  Zeile des Zahlenblocks („Verzugszinsen …“, „3,16 €“) — so, wie die App sie
  schreibt; gelesen werden die Ziffern samt Komma, der Tausenderpunkt fällt
  weg. Vor dem 10.10.2026 gab es nur den Mahnstand an der Rechnung: dann
  gelten die Mahnspesen von dort.
*/
create or replace function app.mahnforderung(p_invoice uuid) returns numeric
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(
    (select round(
              coalesce((m.inhalt ->> 'kosten')::numeric, m.spesen, 0)
              + coalesce(
                  (m.inhalt ->> 'zinsen')::numeric,
                  (select coalesce(sum(replace(regexp_replace(z ->> 1, '[^0-9,]', '', 'g'), ',', '.')::numeric), 0)
                     from jsonb_array_elements(
                            case when jsonb_typeof(m.inhalt -> 'zeilen') = 'array'
                                 then m.inhalt -> 'zeilen' else '[]'::jsonb end) z
                    where z ->> 0 like 'Verzugszinsen%'
                      and regexp_replace(coalesce(z ->> 1, ''), '[^0-9,]', '', 'g') <> ''),
                  0), 2)
       from public.mahnungen m
      where m.invoice_id = p_invoice
      order by m.datum desc, m.angelegt_am desc
      limit 1),
    (select i.mahnspesen from public.invoices i
      where i.id = p_invoice and coalesce(i.mahnstufe, 0) > 0),
    0)
$$;

revoke all on function app.mahnforderung(uuid) from public, anon, authenticated;

/*
  WAS EIN EINGANG „MAHNKOSTEN“ DARF: über null nur nach einer Mahnung, nicht
  auf eine stornierte Rechnung und zusammen höchstens, was die letzte
  Mahnung an Spesen und Zinsen gefordert hat. Was der Kunde darüber hinaus
  zahlt, ist ein Guthaben wie bisher. Ein negativer Eingang (Rücklastschrift
  oder Rückzahlung der Mahnkosten) geht, solange die Summe nicht unter null
  fällt (`app.zahlung_nicht_unter_null`).
*/
create or replace function app.mahnkosten_passt() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  rechnung public.invoices;
  gefordert numeric(12,2);
  andere numeric(12,2);
begin
  if new.art is distinct from 'Mahnkosten' or new.betrag <= 0 then
    return new;
  end if;

  -- Gleichzeitige Eingänge auf dieselbe Rechnung warten aufeinander.
  select * into rechnung from public.invoices i where i.id = new.invoice_id for update;
  if rechnung.payment_status = 'Storniert' then
    raise exception 'Auf eine stornierte Rechnung gibt es keine Mahnspesen und Zinsen.' using errcode = '22023';
  end if;

  gefordert := app.mahnforderung(new.invoice_id);
  if gefordert <= 0 then
    raise exception 'Auf diese Rechnung ist keine Mahnung mit Mahnspesen oder Zinsen ergangen — der Betrag gehört auf die Rechnung.'
      using errcode = '22023';
  end if;

  select coalesce(sum(z.betrag), 0) into andere
    from public.zahlungseingaenge z
   where z.invoice_id = new.invoice_id and z.id is distinct from new.id and z.art = 'Mahnkosten';
  if andere + new.betrag > gefordert then
    raise exception 'Die letzte Mahnung fordert % € an Mahnspesen und Zinsen, davon sind % € schon verbucht. Was darüber eingeht, ist ein Guthaben des Kunden.',
      replace(gefordert::text, '.', ','), replace(andere::text, '.', ',')
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function app.mahnkosten_passt() from public, anon, authenticated;

drop trigger if exists zahlungen_mahnkosten_passt on public.zahlungseingaenge;
create trigger zahlungen_mahnkosten_passt
  before insert or update on public.zahlungseingaenge
  for each row execute function app.mahnkosten_passt();

/*
  Die Fassung aus `20261010400000_ruecklass_skonto_garantie.sql`. Der Skonto
  gleicht den Rest der RECHNUNG aus; bezahlte Mahnkosten gehören nicht dazu.
*/
create or replace function app.skonto_passt() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  rechnung public.invoices;
  zugesagt numeric(12,2);
  andere_skonto numeric(12,2);
  andere numeric(12,2);
begin
  if new.art is distinct from 'Skonto' then
    return new;
  end if;

  select * into rechnung from public.invoices i where i.id = new.invoice_id;
  if rechnung.skonto_prozent is null then
    raise exception 'Diese Rechnung sagt keinen Skonto zu.' using errcode = '22023';
  end if;
  if rechnung.payment_status = 'Storniert' then
    raise exception 'Auf eine stornierte Rechnung gibt es keinen Skonto.' using errcode = '22023';
  end if;
  if new.betrag <= 0 then
    raise exception 'Ein Skonto ist ein Abzug über null Euro.' using errcode = '22023';
  end if;

  -- Auf den Zahlbetrag: ohne den Rücklass (seit 10.10.2026; ohne Rücklass wie bisher).
  zugesagt := round((rechnung.total_brutto - coalesce(rechnung.ruecklass_betrag, 0)) * rechnung.skonto_prozent / 100, 2);
  select coalesce(sum(z.betrag) filter (where z.art = 'Skonto'), 0),
         coalesce(sum(z.betrag) filter (where z.art is distinct from 'Mahnkosten'), 0)
    into andere_skonto, andere
    from public.zahlungseingaenge z
   where z.invoice_id = new.invoice_id and z.id is distinct from new.id;

  if andere_skonto + new.betrag > zugesagt then
    raise exception 'Zugesagt sind % %% Skonto, also höchstens % €.',
      replace(trim(to_char(rechnung.skonto_prozent, 'FM990.99')), '.', ','),
      replace(zugesagt::text, '.', ',')
      using errcode = '22023';
  end if;
  if andere + new.betrag > rechnung.total_brutto then
    raise exception 'Der Skonto gleicht einen Rest aus — er ist höher als das, was noch offen ist.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function app.skonto_passt() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Zurückgezahlt höchstens, was eingegangen ist — bei JEDER Änderung
-- ---------------------------------------------------------------------------

/*
  Die Fassung aus `20260930340000_rueckzahlung.sql` prüfte nur das Schreiben
  eines negativen Betrags. Jetzt jede Änderung, die die Summe senkt:

    - auf der Seite, auf die geschrieben wird: ein negativer Eingang, ein
      verringerter, einer, der auf eine andere Rechnung oder Art wandert;
    - auf der Seite, von der etwas weggeht: ein gelöschter positiver Eingang
      oder einer, der die Rechnung oder Art wechselt.

  Gerechnet je Art: Eingänge auf die Rechnung (samt Skonto, wie bisher) und
  Mahnkosten getrennt — eine Rückzahlung der Rechnung lässt sich nicht mit
  bezahlten Mahnkosten decken.

  Beim Löschen ausgenommen sind der Dienstschlüssel (Rücklauf einer Sicherung,
  Löschen eines Betriebs) und eine Rechnung, die es nicht mehr gibt: dort
  gehen alle Eingänge mit, in beliebiger Reihenfolge.
*/
create or replace function app.zahlung_nicht_unter_null() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  andere numeric(12,2);
  mk_neu boolean;
  mk_alt boolean;
  gleich boolean := false;
begin
  if tg_op <> 'INSERT' then
    mk_alt := old.art = 'Mahnkosten';
  end if;
  if tg_op <> 'DELETE' then
    mk_neu := new.art = 'Mahnkosten';
  end if;
  if tg_op = 'UPDATE' then
    gleich := new.invoice_id = old.invoice_id and mk_neu = mk_alt;
  end if;

  if tg_op <> 'DELETE' and new.betrag < (case when gleich then old.betrag else 0 end) then
    select coalesce(sum(z.betrag), 0) into andere
      from public.zahlungseingaenge z
     where z.invoice_id = new.invoice_id and z.id is distinct from new.id
       and (z.art = 'Mahnkosten') = mk_neu;
    if andere + new.betrag < 0 then
      raise exception 'Zurückgezahlt werden kann höchstens, was eingegangen ist: % €.',
        replace(greatest(andere, 0)::text, '.', ',')
        using errcode = '22023';
    end if;
  end if;

  if (tg_op = 'DELETE' or (tg_op = 'UPDATE' and not gleich)) and old.betrag > 0
     and not app.ist_dienst()
     and exists (select 1 from public.invoices i where i.id = old.invoice_id) then
    select coalesce(sum(z.betrag), 0) into andere
      from public.zahlungseingaenge z
     where z.invoice_id = old.invoice_id and z.id <> old.id
       and (z.art = 'Mahnkosten') = mk_alt;
    if andere < 0 then
      raise exception 'Ohne diesen Eingang wäre auf die Rechnung mehr zurückgezahlt als eingegangen (% €). Bitte zuerst die Rückzahlung löschen oder berichtigen.',
        replace(andere::text, '.', ',')
        using errcode = '22023';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function app.zahlung_nicht_unter_null() from public, anon, authenticated;

drop trigger if exists zahlungen_nicht_unter_null on public.zahlungseingaenge;
create trigger zahlungen_nicht_unter_null
  before insert or update or delete on public.zahlungseingaenge
  for each row execute function app.zahlung_nicht_unter_null();

-- ---------------------------------------------------------------------------
-- 4. Änderungsjournal: `mahnkosten_betrag` ist eine Rechengröße
-- ---------------------------------------------------------------------------

/*
  Wie `bezahlt_betrag` und `skonto_betrag` (siehe
  `20261106100000_aenderungsjournal.sql`): gerechnet von `zahlstand_setzen`,
  jede Zahlung steht selbst im Verlauf der Rechnung.
*/
drop trigger if exists invoices_journal on public.invoices;
create trigger invoices_journal
  after insert or update or delete on public.invoices
  for each row execute function app.journal_protokollieren(
    'rechnung', '{id,company_id,created_at,updated_at,aussteller_stand,storno_aussteller_stand,project_id,customer_id,vorrechnungen,bezahlt_betrag,skonto_betrag,mahnkosten_betrag,mahnstufe,gemahnt_am,mahnfrist,mahnspesen}');
