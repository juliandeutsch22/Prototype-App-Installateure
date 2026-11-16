-- Durchsicht 15.11.2026, F13: Kontoauszug abgleichen — Eingänge der Bank als
-- Vorschlag den offenen Rechnungen zuordnen und in einem Zug verbuchen.
--
-- WAS VORHER WAR: jede Zahlung wurde je Rechnung von Hand eingetippt — Betrag,
-- Tag, bei Skonto zweimal, bei Mahnspesen dreimal. Den Verwendungszweck mit
-- der Rechnungsnummer druckt jeder Beleg seit jeher.
--
-- DIE DATEI BLEIBT IM BROWSER. Gelesen und zugeordnet wird dort
-- (`src/features/invoices/kontoauszugLesen.ts`, `kontoauszugAbgleich.ts`).
-- Hier landet nur, was bestätigt ist: je Bankbewegung eine Zeile in
-- `bank_buchungen` mit einer Prüfsumme (SHA-256 über Tag, Betrag, IBAN und
-- Zweck — nichts davon im Klartext) und die Zahlungseingänge selbst.
--
-- DIE PRÜFSUMME IST DIE WIEDERHOLUNGSSPERRE: je Betrieb nur einmal. Wer
-- dieselbe Datei noch einmal einliest, bekommt „schon verbucht“ — auch dann,
-- wenn zwei Personen sie gleichzeitig verbuchen (der eindeutige Index lässt
-- den zweiten warten und dann leer ausgehen).
--
-- GEBUCHT WIRD ÜBER DIE BESTEHENDEN EINGÄNGE: eine Zeile „Überweisung“, dazu
-- „Skonto“ und „Mahnkosten“ wie im Zahlungsdialog. Damit gelten ohne
-- Ausnahme dieselben Auslöser: Sperre der Rechnung (G9), `skonto_passt`,
-- `mahnkosten_passt`, `zahlung_nicht_unter_null`, Zahlstand und Journal.
-- Jede Bewegung ist für sich ganz oder gar nicht gebucht (Teiltransaktion);
-- eine abgewiesene hält die übrigen nicht auf und kommt mit dem Grund der
-- Datenbank zurück.
--
-- WIRD EIN SOLCHER EINGANG GELÖSCHT (Fehlgriff), geht mit dem letzten
-- Eingang auch die Zeile in `bank_buchungen` — die Bewegung lässt sich dann
-- wieder einlesen. Sonst sperrte ein zurückgenommener Fehlgriff die Bewegung
-- für immer.
--
-- VERTRÄGLICH MIT DER ALTEN APP: eine neue Tabelle, eine neue Spalte mit
-- Vorgabe `null`, eine neue Funktion. Bestehende Eingänge bleiben, wie sie
-- sind.

create table if not exists public.bank_buchungen (
  id                uuid primary key default gen_random_uuid(),
  company_id        text not null references public.companies(id) on delete cascade,
  kennung           text not null check (kennung ~ '^[0-9a-f]{64}$'),
  buchungstag       date not null,
  betrag            numeric(12,2) not null check (betrag > 0),
  verbucht_am       timestamptz not null default now(),
  verbucht_von      uuid,
  verbucht_von_name text
);

create unique index if not exists bank_buchungen_kennung on public.bank_buchungen (company_id, kennung);
create index if not exists bank_buchungen_person on public.bank_buchungen (company_id, verbucht_von) where verbucht_von is not null;

comment on table public.bank_buchungen is
  'Aus einem Kontoauszug verbuchte Bankbewegungen (F13): je Bewegung eine Prüfsumme gegen das doppelte Verbuchen — Name, IBAN und Zweck stehen nicht darin.';
comment on column public.bank_buchungen.kennung is
  'SHA-256 (hex) über Buchungstag, Betrag, IBAN des Auftraggebers und Zweck, gerechnet im Browser (`kontoauszugKennungen`).';

alter table public.bank_buchungen enable row level security;
revoke all on public.bank_buchungen from anon, authenticated;
grant select on public.bank_buchungen to authenticated;

drop trigger if exists bank_buchungen_kein_support_schreiben on public.bank_buchungen;
create trigger bank_buchungen_kein_support_schreiben
  before insert or update or delete on public.bank_buchungen
  for each row execute function app.support_schreibt_nicht();

-- Lesen wie die Zahlungseingänge: wer Zahlungen erfasst, und der Support beim Einblick.
drop policy if exists bank_buchungen_lesen on public.bank_buchungen;
create policy bank_buchungen_lesen on public.bank_buchungen
  for select using (
    (company_id = (select app.lesebetrieb()) and (select app.ist_buch_oder_spitze()))
    or company_id = (select app.supportbetrieb()));

alter table public.zahlungseingaenge
  add column if not exists bank_buchung uuid references public.bank_buchungen(id) on delete set null;

comment on column public.zahlungseingaenge.bank_buchung is
  'Aus welcher Bankbewegung der Eingang verbucht wurde (F13) — leer bei Eingängen von Hand.';

create index if not exists zahlungseingaenge_bank_buchung
  on public.zahlungseingaenge (bank_buchung) where bank_buchung is not null;

/*
  DAS ÄNDERUNGSJOURNAL DER ZAHLUNG (M01b) kennt jede Spalte — als Text oder
  als Ausnahme (`aenderungsjournal.test.ts`). Die Bewegung ist eine Kennung,
  kein Inhalt für den Verlauf: sie kommt zu den Ausnahmen. Gezielt an die
  bestehende Liste gehängt statt sie neu zu schreiben, damit keine Ausnahme
  verloren geht, die eine andere Migration dazugesetzt hat.
*/
do $migration$
declare
  liste text;
begin
  select split_part(encode(t.tgargs, 'escape'), '\000', 2) into liste
    from pg_trigger t
   where t.tgrelid = 'public.zahlungseingaenge'::regclass and t.tgname = 'zahlungen_journal';
  if liste is null or liste !~ '^\{.*\}$' then
    raise exception 'Journal der Zahlungen: Ausnahmeliste nicht gefunden (%)', liste;
  end if;
  if not (string_to_array(trim(both '{}' from liste), ',') @> array['bank_buchung']) then
    liste := '{' || trim(both '{}' from liste) || ',bank_buchung}';
    drop trigger zahlungen_journal on public.zahlungseingaenge;
    execute format(
      'create trigger zahlungen_journal after insert or update or delete on public.zahlungseingaenge '
      'for each row execute function app.journal_protokollieren(%L, %L)', 'zahlung', liste);
  end if;
end;
$migration$;

/*
  MIT DEM LETZTEN EINGANG GEHT DIE BEWEGUNG. Nach dem Löschen eines Eingangs
  (auch über eine Umbuchung oder das Löschen der Rechnung): hängt an seiner
  Bewegung nichts mehr, wird sie freigegeben.
*/
create or replace function app.bank_buchung_freigeben() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if old.bank_buchung is not null then
    delete from public.bank_buchungen b
     where b.id = old.bank_buchung
       and not exists (select 1 from public.zahlungseingaenge z where z.bank_buchung = b.id);
  end if;
  return old;
end;
$$;

revoke all on function app.bank_buchung_freigeben() from public, anon, authenticated;

drop trigger if exists zahlungen_bank_buchung_freigeben on public.zahlungseingaenge;
create trigger zahlungen_bank_buchung_freigeben
  after delete on public.zahlungseingaenge
  for each row execute function app.bank_buchung_freigeben();

/*
  DIE BEWEGUNG GEHÖRT NICHT UMGEHÄNGT. Die Spalte setzt nur
  `kontoauszug_verbuchen`; von Hand gesetzt oder geändert, stimmte die
  Wiederholungssperre nicht mehr mit dem überein, was gebucht ist. Leeren
  bleibt möglich (das tut der Fremdschlüssel selbst).
*/
create or replace function app.bank_buchung_fest() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.bank_buchung is not null
     and (tg_op = 'INSERT' or new.bank_buchung is distinct from old.bank_buchung)
     and coalesce(current_setting('app.kontoauszug', true), '') <> 'ja'
     and not app.ist_dienst() then
    raise exception 'Die Bankbewegung eines Eingangs setzt nur der Abgleich des Kontoauszugs.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app.bank_buchung_fest() from public, anon, authenticated;

drop trigger if exists zahlungen_bank_buchung_fest on public.zahlungseingaenge;
create trigger zahlungen_bank_buchung_fest
  before insert or update of bank_buchung on public.zahlungseingaenge
  for each row execute function app.bank_buchung_fest();

/*
  VERBUCHEN. `p_posten` ist eine Liste von Bewegungen:

    { "kennung": "<64 hex>", "buchungstag": "JJJJ-MM-TT", "betrag": 123.45,
      "hinweis": "Kontoauszug: …",
      "teile": [ { "rechnung": "<uuid>", "betrag": 120.00, "skonto": 2.45, "mahnkosten": 0 } ] }

  Zurück kommt je Bewegung `{ kennung, ergebnis, grund }` mit
  `ergebnis` = `gebucht` | `schon_verbucht` | `abgewiesen`.

  Regeln: nur wer Zahlungen erfasst, im eigenen Betrieb; der Buchungstag
  liegt nicht in der Zukunft; zugeordnet wird nicht mehr, als eingegangen ist
  (Skonto zählt nicht, er ist kein Geld); jede Rechnung höchstens einmal je
  Bewegung; höchstens 500 Bewegungen je Aufruf.
*/
create or replace function public.kontoauszug_verbuchen(p_posten jsonb) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  heute date := (now() at time zone 'Europe/Vienna')::date;
  wer text;
  posten jsonb;
  teil jsonb;
  ergebnisse jsonb := '[]'::jsonb;
  v_kennung text;
  v_tag date;
  v_bank numeric(12,2);
  v_summe numeric(12,2);
  v_hinweis text;
  v_neu uuid;
  v_rechnung uuid;
  v_betrag numeric(12,2);
  v_skonto numeric(12,2);
  v_mahnkosten numeric(12,2);
  v_gesehen uuid[];
begin
  if betrieb is null or not app.betriebsmitglied(betrieb)
     or not app.hat_rolle(array['Buchhaltung', 'Geschäftsführung', 'Administrator']) then
    raise exception 'Den Kontoauszug verbucht, wer Zahlungen erfasst.' using errcode = '42501';
  end if;
  if p_posten is null or jsonb_typeof(p_posten) <> 'array' then
    raise exception 'Erwartet wird eine Liste von Bewegungen.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_posten) > 500 then
    raise exception 'Höchstens 500 Bewegungen auf einmal — bitte in Teilen verbuchen.' using errcode = '22023';
  end if;

  select u.name into wer from public.users u where u.id = auth.uid();

  for posten in select * from jsonb_array_elements(p_posten) loop
    v_kennung := posten ->> 'kennung';
    v_neu := null;
    begin
      if v_kennung is null or v_kennung !~ '^[0-9a-f]{64}$' then
        raise exception 'Die Kennung der Bewegung fehlt oder ist keine Prüfsumme.' using errcode = '22023';
      end if;
      v_tag := (posten ->> 'buchungstag')::date;
      v_bank := (posten ->> 'betrag')::numeric;
      if v_tag is null or v_tag > heute then
        raise exception 'Der Buchungstag fehlt oder liegt in der Zukunft.' using errcode = '22023';
      end if;
      if v_bank is null or v_bank <= 0 or v_bank <> round(v_bank, 2) then
        raise exception 'Der Betrag der Bewegung ist größer null und auf den Cent genau.' using errcode = '22023';
      end if;
      if jsonb_typeof(posten -> 'teile') is distinct from 'array' or jsonb_array_length(posten -> 'teile') = 0 then
        raise exception 'Keiner Rechnung zugeordnet.' using errcode = '22023';
      end if;

      v_summe := 0;
      v_gesehen := '{}';
      for teil in select * from jsonb_array_elements(posten -> 'teile') loop
        v_rechnung := (teil ->> 'rechnung')::uuid;
        v_betrag := coalesce((teil ->> 'betrag')::numeric, 0);
        v_skonto := coalesce((teil ->> 'skonto')::numeric, 0);
        v_mahnkosten := coalesce((teil ->> 'mahnkosten')::numeric, 0);
        if v_rechnung is null or v_rechnung = any(v_gesehen) then
          raise exception 'Jede Rechnung höchstens einmal je Bewegung.' using errcode = '22023';
        end if;
        v_gesehen := v_gesehen || v_rechnung;
        if v_betrag < 0 or v_skonto < 0 or v_mahnkosten < 0
           or v_betrag <> round(v_betrag, 2) or v_skonto <> round(v_skonto, 2) or v_mahnkosten <> round(v_mahnkosten, 2)
           or (v_betrag = 0 and v_skonto = 0 and v_mahnkosten = 0) then
          raise exception 'Die Beträge eines Teils sind nicht negativ, auf den Cent genau und nicht alle null.' using errcode = '22023';
        end if;
        if not exists (select 1 from public.invoices i where i.id = v_rechnung and i.company_id = betrieb) then
          raise exception 'Eine der Rechnungen gibt es hier nicht.' using errcode = 'P0002';
        end if;
        v_summe := v_summe + v_betrag + v_mahnkosten;
      end loop;
      if v_summe > v_bank then
        raise exception 'Zugeordnet sind % €, eingegangen nur % €.',
          replace(v_summe::text, '.', ','), replace(v_bank::text, '.', ',') using errcode = '22023';
      end if;

      v_hinweis := left(nullif(btrim(coalesce(posten ->> 'hinweis', '')), ''), 300);

      insert into public.bank_buchungen (company_id, kennung, buchungstag, betrag, verbucht_von, verbucht_von_name)
      values (betrieb, v_kennung, v_tag, v_bank, auth.uid(), wer)
      on conflict (company_id, kennung) do nothing
      returning id into v_neu;
      if v_neu is null then
        ergebnisse := ergebnisse || jsonb_build_object('kennung', v_kennung, 'ergebnis', 'schon_verbucht');
        continue;
      end if;

      perform set_config('app.kontoauszug', 'ja', true);
      for teil in select * from jsonb_array_elements(posten -> 'teile') loop
        v_rechnung := (teil ->> 'rechnung')::uuid;
        v_betrag := coalesce((teil ->> 'betrag')::numeric, 0);
        v_skonto := coalesce((teil ->> 'skonto')::numeric, 0);
        v_mahnkosten := coalesce((teil ->> 'mahnkosten')::numeric, 0);
        -- In einem Insert je Rechnung: weist die Datenbank Skonto oder Mahnkosten ab, ist auch die Zahlung nicht gebucht.
        insert into public.zahlungseingaenge
          (company_id, invoice_id, datum, betrag, art, hinweis, erfasst_von, erfasst_von_name, bank_buchung)
        select betrieb, v_rechnung, v_tag, x.betrag, x.art, x.hinweis, auth.uid(), wer, v_neu
          from (values (v_betrag, 'Überweisung', v_hinweis),
                       (v_skonto, 'Skonto', null::text),
                       (v_mahnkosten, 'Mahnkosten', v_hinweis)) as x(betrag, art, hinweis)
         where x.betrag <> 0;
      end loop;
      perform set_config('app.kontoauszug', '', true);

      ergebnisse := ergebnisse || jsonb_build_object('kennung', v_kennung, 'ergebnis', 'gebucht');
    exception when others then
      perform set_config('app.kontoauszug', '', true);
      ergebnisse := ergebnisse || jsonb_build_object('kennung', v_kennung, 'ergebnis', 'abgewiesen', 'grund', sqlerrm);
    end;
  end loop;

  return ergebnisse;
end;
$$;

revoke all on function public.kontoauszug_verbuchen(jsonb) from public, anon;
grant execute on function public.kontoauszug_verbuchen(jsonb) to authenticated;

/*
  WELCHE KENNUNGEN SCHON VERBUCHT SIND — für den Vorschlag, bevor jemand
  etwas bestätigt. Ein lesender Aufruf; er sieht nur den eigenen Betrieb.
*/
create or replace function public.kontoauszug_schon_verbucht(p_kennungen text[])
  returns table (kennung text, verbucht_am timestamptz, verbucht_von_name text)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select b.kennung, b.verbucht_am, b.verbucht_von_name
    from public.bank_buchungen b
   where b.company_id = app.betrieb()
     and app.betriebsmitglied(b.company_id)
     and app.hat_rolle(array['Buchhaltung', 'Geschäftsführung', 'Administrator'])
     and b.kennung = any(coalesce(p_kennungen, '{}'::text[]))
$$;

revoke all on function public.kontoauszug_schon_verbucht(text[]) from public, anon;
grant execute on function public.kontoauszug_schon_verbucht(text[]) to authenticated;

-- Datenauskunft und Löschung: wer eine Bewegung verbucht hat — gezielte Ergänzungen wie in 20261116075000.
do $migration$
declare
  quelle text;
  marke text;
  zahl integer;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('kontoauszug_verbucht' in quelle) = 0 then
    marke := $m$      'zahlungen_erfasst', (select count(*)$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenauskunft: Einfügestelle (Bearbeiter) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, $neu$      -- F13: Bankbewegungen, die sie aus einem Kontoauszug verbucht hat.
      'kontoauszug_verbucht', (select count(*) from public.bank_buchungen b
        where b.company_id = betrieb and b.verbucht_von = p_id),
$neu$ || marke);
    execute quelle;
  end if;

  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('bank_buchungen' in quelle) = 0 then
    marke := $m$      'geburtsdatum', (select count(*) from public.geburtsdaten g$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenlöschung: Einfügestelle (Zählung) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, ltrim($neu$
      'bank_buchungen', (select count(*) from public.bank_buchungen b
                          where b.company_id = betrieb and b.verbucht_von = p_id),
$neu$, E'\n') || marke);

    marke := $m$      delete from public.geburtsdaten g where g.company_id = betrieb and g.user_id = p_id;$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenlöschung: Einfügestelle (Löschen) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, marke || $neu$
      update public.bank_buchungen b set verbucht_von = null, verbucht_von_name = null
       where b.company_id = betrieb and b.verbucht_von = p_id;$neu$);
    execute quelle;
  end if;
end;
$migration$;
