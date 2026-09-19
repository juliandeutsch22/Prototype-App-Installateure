-- ---------------------------------------------------------------------------
-- Zahlungseingänge — was tatsächlich hereingekommen ist
-- ---------------------------------------------------------------------------
--
-- WAS ES VORHER GAB: einen Haken. `payment_status` liess sich von Hand auf
-- „Bezahlt" stellen, und damit war die Rechnung erledigt. Kein Datum, kein
-- Betrag, keine Teilzahlung. Daran hängen mehr Dinge, als es zunächst
-- aussieht:
--
--   * Der Mahnlauf rechnet mit dem BRUTTOBETRAG. Wer auf eine Rechnung über
--     1.000 € vierhundert überweist, wird über 1.000 € gemahnt — und das ist
--     nicht bloss unhöflich, es ist falsch.
--   * Skonto, Anzahlung und Verzugszinsen brauchen alle dasselbe: WANN wie
--     viel gekommen ist. Ohne diese Tabelle lässt sich keines davon bauen.
--   * „Bezahlt" ohne Datum beantwortet die Frage nicht, die das Büro im
--     Jänner stellt: welche Rechnung war am 31.12. noch offen?
--
-- EINE EIGENE TABELLE UND KEIN FELD AN DER RECHNUNG. Teilzahlungen sind im
-- Handwerk der Normalfall — Anzahlung, Abschlag, Rest. Ein Betrag am Beleg
-- könnte immer nur den letzten festhalten, und die Zwischenstände wären weg.

create table zahlungseingaenge (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references companies (id),
  /*
    MIT DER RECHNUNG GEHT DIE ZAHLUNG. Ein Eingang ohne seine Rechnung ist
    kein Datensatz, sondern ein Rätsel: kein Betrag, gegen den er zählt, kein
    Kunde, keine Nummer.

    Im laufenden Betrieb greift das nie — Rechnungen werden nicht gelöscht,
    es gibt dafür keine Richtlinie (§ 132 BAO, sieben Jahre). Gebraucht wird
    es dort, wo mit dem Dienstschlüssel aufgeräumt wird: beim Rücklauf einer
    Sicherung und in den Prüfungen. Ohne die Weitergabe scheitert dort das
    Löschen der Rechnung am Fremdschlüssel — und zwar still, weil niemand die
    Fehlermeldung eines Aufräumschritts liest.
  */
  invoice_id  uuid not null references invoices (id) on delete cascade,
  datum       date not null,
  /*
    NEGATIVE BETRÄGE SIND ERLAUBT, null ist es nicht.

    Eine Rückzahlung ist derselbe Vorgang mit umgekehrtem Vorzeichen: der
    Kunde hat doppelt überwiesen, der Betrieb gibt es zurück. Ohne diese
    Möglichkeit bliebe eine überzahlte Rechnung für immer überzahlt, und das
    Guthaben stünde in den Büchern, obwohl es längst zurück ist.

    Eine Zahlung über null dagegen ist kein Vorgang, sondern ein Vertipper.
  */
  betrag      numeric(12,2) not null check (betrag <> 0),
  art         text not null check (art in ('Überweisung', 'Bar', 'Karte', 'Sonstiges')),
  hinweis     text,
  /* Wer sie erfasst hat — eine Zahl ohne Herkunft lässt sich nicht klären. */
  erfasst_von      uuid,
  erfasst_von_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index zahlungseingaenge_rechnung on zahlungseingaenge (invoice_id, datum);
create index zahlungseingaenge_betrieb_datum on zahlungseingaenge (company_id, datum desc);

alter table zahlungseingaenge enable row level security;

/*
  DIESELBE GRENZE WIE BEI DER RECHNUNG SELBST. Wer Rechnungen nicht sehen
  darf, hat mit ihren Zahlungen nichts zu tun — eine Zahlungsliste ist eine
  Umsatzliste.
*/
create policy zahlungen_lesen on zahlungseingaenge
  for select using (app.darf(company_id) and app.ist_buch_oder_spitze());
create policy zahlungen_anlegen on zahlungseingaenge
  for insert with check (app.darf(company_id) and app.ist_buch_oder_spitze());
create policy zahlungen_aendern on zahlungseingaenge
  for update using (app.darf(company_id) and app.ist_buch_oder_spitze())
  with check (app.darf(company_id) and app.ist_buch_oder_spitze());
/*
  HIER DARF GELÖSCHT WERDEN, anders als bei der Rechnung — und das ist kein
  Widerspruch, sondern derselbe Gedanke.

  Die Rechnung ist der BELEG; § 132 BAO verlangt sieben Jahre Aufbewahrung,
  und ihre Korrektur heisst Storno. Ein Zahlungseingang ist kein Beleg des
  Betriebs, sondern seine Notiz darüber, was auf dem Konto stand — der Beleg
  dazu ist der Kontoauszug der Bank. Wer sich beim Betrag vertippt, muss das
  geradebiegen können, ohne eine erfundene Gegenbuchung in die Bücher zu
  schreiben.
*/
create policy zahlungen_loeschen on zahlungseingaenge
  for delete using (app.darf(company_id) and app.ist_buch_oder_spitze());

/*
  DIE RECHNUNG MUSS DEMSELBEN BETRIEB GEHÖREN.

  Der Fremdschlüssel allein sagt nur, dass es die Rechnung GIBT. Ein Aufrufer
  könnte seinen eigenen Betrieb eintragen und die Kennung einer fremden
  Rechnung — die Zeile wäre für beide Seiten unsichtbar und stünde trotzdem in
  der Summe eines fremden Belegs. Der Zeilenschutz fängt das nicht, weil er
  über `company_id` geht und die stimmt ja.
*/
create or replace function app.zahlung_rechnung_passt() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb_der_rechnung text;
begin
  select i.company_id into betrieb_der_rechnung
    from public.invoices i where i.id = new.invoice_id;

  if betrieb_der_rechnung is distinct from new.company_id then
    raise exception 'Diese Rechnung gehört zu einem anderen Betrieb'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger zahlungen_updated_at before update on zahlungseingaenge
  for each row execute function app.updated_at_setzen();
create trigger zahlungen_betrieb_fest before update on zahlungseingaenge
  for each row execute function app.betrieb_unveraenderlich();
create trigger zahlungen_rechnung_passt before insert or update on zahlungseingaenge
  for each row execute function app.zahlung_rechnung_passt();

-- ---------------------------------------------------------------------------
-- Der Zahlungsstand der Rechnung wird abgeleitet, nicht gesetzt
-- ---------------------------------------------------------------------------

alter table invoices add column bezahlt_betrag numeric(12,2) not null default 0;

/*
  DER ALTBESTAND MUSS MITKOMMEN, sonst mahnt der erste Lauf den halben Betrieb.

  Rechnungen aus der Zeit vor dieser Tabelle tragen „Bezahlt" und einen
  bezahlten Betrag von null — den hat damals niemand erfasst, weil es das Feld
  nicht gab. Der Mahnlauf rechnet ab jetzt mit dem REST; ohne diese Zeilen
  wäre der Rest jeder alten, längst beglichenen Rechnung ihr voller Betrag.

  WAS HIER BEWUSST NICHT PASSIERT: Zahlungseingänge erfinden. Ein Eingang
  trägt ein Datum, und das weiss hier niemand — ein gesetztes wäre eine
  erfundene Angabe im Rechnungswesen. Nachgetragen wird deshalb nur die Summe,
  die aus dem alten Haken folgt: „Bezahlt" hiess „ganz bezahlt".

  Die Zeile läuft VOR der neuen Fassung von `app.rechnung_eingefroren()`, also
  noch ohne den Riegel, der genau diese Spalte schützt. Das ist Absicht und
  die einzige Stelle, an der sie von Hand geschrieben wird.
*/
update invoices set bezahlt_betrag = total_brutto where payment_status = 'Bezahlt';

/*
  ZWEI NEUE ZUSTÄNDE, und beide sind eine Tatsache und keine Stimmung.

  „Teilbezahlt" ist weder offen noch bezahlt. Es unter „Offen" zu führen hiesse
  zu verschweigen, dass Geld gekommen ist; unter „Bezahlt" wäre es eine Lüge
  über eine Forderung, die weiterbesteht.

  „Überzahlt" ist der Fall, den man nicht sehen will und deshalb sehen muss:
  der Kunde hat zweimal überwiesen. Als „Bezahlt" geführt verschwände die
  Rückzahlung aus dem Blick — und der Kunde ruft an, nicht der Betrieb.
*/
do $$
declare
  n text;
begin
  select conname into n from pg_constraint
   where conrelid = 'public.invoices'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%payment_status%';
  if n is not null then
    execute format('alter table public.invoices drop constraint %I', n);
  end if;
end $$;

alter table invoices add constraint invoices_payment_status_check
  check (payment_status in
    ('Offen', 'Überfällig', 'Teilbezahlt', 'Bezahlt', 'Überzahlt', 'Storniert'));

/*
  DER TEILINDEX MUSS DIE NEUE LISTE GENAU TREFFEN. Er trägt die Abfrage der
  offenen Posten; steht „Teilbezahlt" nicht drin, fällt die Abfrage auf einen
  Durchgang durch alle Rechnungen des Betriebs zurück — leise, und erst in
  drei Jahren spürbar.
*/
drop index if exists invoices_offen;
create index invoices_offen on invoices (company_id, payment_status, due_date)
  where payment_status in ('Offen', 'Überfällig', 'Teilbezahlt');

/*
  Ein Merker für die Dauer der Transaktion. Er unterscheidet „die Datenbank
  rechnet den Stand nach" von „jemand schreibt ihn von Hand".
*/
create or replace function app.zahlstand_laeuft() returns boolean
  language sql stable
  set search_path = ''
as $$
  select coalesce(current_setting('app.zahlstand', true), '') = 'ja'
$$;

/*
  Rechnet den Zahlungsstand EINER Rechnung neu.

  WARUM DER BETRAG AN DER RECHNUNG STEHT, obwohl er sich aus den Eingängen
  ergibt: die Liste zeigt dreihundert Rechnungen mit ihrem Restbetrag. Ohne
  die Spalte wäre das je Zeile eine eigene Abfrage — dreihundert Abfragen für
  eine Liste. Geschrieben wird sie ausschliesslich hier, und
  `tests/supabase/modulGeld.test.ts` rechnet sie gegen die Eingänge nach.

  DER STORNO BLEIBT STORNO. Eine stornierte Rechnung mit Zahlung ist kein
  Widerspruch, sondern der Normalfall nach einer Fehlrechnung: das Geld ist da,
  die Forderung nicht mehr. Der Betrag wird trotzdem mitgeführt — er ist dann
  ein GUTHABEN des Kunden, und wer ihn wegwirft, vergisst eine Rückzahlung.
*/
create or replace function app.zahlstand_setzen(p_id uuid) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  summe   numeric(12,2);
  brutto  numeric(12,2);
  status  text;
  neu     text;
begin
  select coalesce(sum(z.betrag), 0) into summe
    from public.zahlungseingaenge z where z.invoice_id = p_id;

  select i.total_brutto, i.payment_status into brutto, status
    from public.invoices i where i.id = p_id;

  if brutto is null then
    return; -- Die Rechnung gibt es nicht (mehr).
  end if;

  if status = 'Storniert' then
    neu := 'Storniert';
  elsif summe <= 0 then
    /*
      Der Fälligkeitsstand bleibt, wie er war. „Überfällig" hängt am Datum und
      nicht am Geld; ihn hier auf „Offen" zurückzustellen hiesse, eine
      zurückgenommene Zahlung als Heilung des Verzugs zu buchen.
    */
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
         payment_status = neu
   where id = p_id
     and (bezahlt_betrag is distinct from summe or payment_status is distinct from neu);
  perform set_config('app.zahlstand', '', true);
end;
$$;

create or replace function app.zahlung_wirkt() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- Beim Umhängen auf eine andere Rechnung müssen BEIDE nachgerechnet werden.
  if tg_op = 'UPDATE' and old.invoice_id is distinct from new.invoice_id then
    perform app.zahlstand_setzen(old.invoice_id);
  end if;
  if tg_op = 'DELETE' then
    perform app.zahlstand_setzen(old.invoice_id);
    return old;
  end if;
  perform app.zahlstand_setzen(new.invoice_id);
  return new;
end;
$$;

create trigger zahlungen_wirken after insert or update or delete on zahlungseingaenge
  for each row execute function app.zahlung_wirkt();

/*
  DER HAKEN VON HAND VERSCHWINDET, und zwar in der Datenbank und nicht nur in
  der Oberfläche.

  „Bezahlt" ist ab jetzt eine Aussage über eingegangenes Geld. Wer sie ohne
  Zahlungseingang setzen könnte, hätte genau den alten Zustand zurück — mit
  dem Unterschied, dass danach zwei Quellen dasselbe behaupten und
  auseinanderlaufen.

  Was der Aufrufer weiterhin darf: „Offen" und „Überfällig" (das hängt am
  Datum, nicht am Geld) und der Storno. Alles andere rechnet die Datenbank.
*/
create or replace function app.rechnung_eingefroren() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.invoice_number is distinct from old.invoice_number
     or new.invoice_date is distinct from old.invoice_date
     or new.total_netto is distinct from old.total_netto
     or new.total_vat is distinct from old.total_vat
     or new.total_brutto is distinct from old.total_brutto
     or new.vat_rate is distinct from old.vat_rate
     or new.reverse_charge is distinct from old.reverse_charge
     or new.customer_name is distinct from old.customer_name
     or new.customer_vat_id is distinct from old.customer_vat_id
     or new.project_number is distinct from old.project_number
     or new.leistung_von is distinct from old.leistung_von
     or new.leistung_bis is distinct from old.leistung_bis then
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
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mahnwesen und offene Posten rechnen mit dem Rest
-- ---------------------------------------------------------------------------

/*
  „Teilbezahlt" fällt hier absichtlich nicht heraus: es ist offen, nur eben
  nicht ganz. „Überzahlt" dagegen schuldet niemand mehr etwas.
*/
create or replace function app.mahnung_faellig(
  p_status text, p_faellig date, p_stufe integer,
  p_gemahnt date, p_frist date, p_heute date
) returns boolean
  language sql immutable
  set search_path = ''
as $$
  select p_status is distinct from 'Bezahlt'
     and p_status is distinct from 'Überzahlt'
     and p_status is distinct from 'Storniert'
     and p_faellig is not null
     and p_faellig < p_heute
     and coalesce(p_stufe, 0) < 3
     and (coalesce(p_stufe, 0) = 0
          or coalesce(p_frist, p_gemahnt + 7, p_faellig) < p_heute)
$$;

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
               and app.mahnung_faellig(i.payment_status, i.due_date, i.mahnstufe,
                                       i.gemahnt_am, i.mahnfrist, p_heute))
      else 0::bigint end
$$;
revoke all on function public.offene_posten(date) from public, anon;
grant execute on function public.offene_posten(date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storno und Storno-Aufhebung kennen den Zahlungsstand
-- ---------------------------------------------------------------------------

/*
  DIE ZAHLUNGEN BLEIBEN STEHEN. Sie mit dem Storno zu löschen wäre der
  naheliegende Griff und der teuerste: das Geld ist auf dem Konto, und eine
  Rückzahlung, an die nichts mehr erinnert, findet nicht statt.
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
  perform set_config('app.zahlstand', 'ja', true);
  update public.invoices
     set payment_status = 'Storniert',
         cancellation_note = p_grund,
         cancelled_at = now()
   where id = p_id and company_id = app.betrieb();
  /*
    `get diagnostics` LIEST DIE LETZTE ANWEISUNG, und das ist hier der Punkt:
    stünde das Zurücksetzen des Merkers davor, zählte es dessen Zeile statt
    der des UPDATE. Eine Rechnung, die es nicht gibt, ginge dann still durch —
    genau das hat `modulGeld.test.ts` gemeldet, als es einmal so dastand.
  */
  get diagnostics getroffen = row_count;
  perform set_config('app.zahlstand', '', true);

  if getroffen = 0 then
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
revoke all on function public.rechnung_stornieren(uuid, text) from public;
grant execute on function public.rechnung_stornieren(uuid, text) to authenticated;

/*
  NICHT ZURÜCK AUF „OFFEN", sondern zurück auf die Wahrheit.

  Hier stand `payment_status = 'Offen'`. Bei einer Rechnung, auf die längst
  gezahlt wurde, hätte das Aufheben eines Fehlstornos die Forderung wieder
  aufgemacht — und der Mahnlauf hätte einen Kunden gemahnt, der bezahlt hat.
*/
create or replace function public.rechnung_storno_aufheben(p_id uuid)
  returns void
  language plpgsql
  set search_path = ''
as $$
declare
  nummer text;
begin
  perform set_config('app.zahlstand', 'ja', true);
  update public.invoices
     set payment_status = 'Offen',
         cancellation_note = null,
         cancelled_at = null
   where id = p_id and company_id = app.betrieb()
  returning invoice_number into nummer;
  perform set_config('app.zahlstand', '', true);

  /* `returning … into` hängt nicht an der letzten Anweisung, anders als
     `get diagnostics` weiter oben. */
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

  -- Und jetzt das, was die Zahlungen sagen.
  perform app.zahlstand_setzen(p_id);
end;
$$;
revoke all on function public.rechnung_storno_aufheben(uuid) from public;
grant execute on function public.rechnung_storno_aufheben(uuid) to authenticated;
