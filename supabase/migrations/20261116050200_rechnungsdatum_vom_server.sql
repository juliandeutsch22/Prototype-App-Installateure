-- Durchsicht 15.11.2026, G5: Rechnungsdatum und das Jahr der Rechnungsnummer
-- bestimmt die Datenbank, nicht die Uhr des Geräts. Ebenso der Tag einer
-- Mahnung.
--
-- NACHGESTELLT (Kratzdatenbank): ein Gerät mit leerer Pufferbatterie schickt
-- als Rechnungsdatum den 01.01.2020 und als Jahr 2020 — angelegt wurde
-- „RE-2020-1001“ vom 01.01.2020, sofort überfällig, mit einem neu eröffneten
-- Zähler für 2020. Der Beleg ist danach eingefroren. `rechnung_ausstellen`
-- nahm Jahr und Datum ungeprüft; die Stornorechnung nimmt beides seit jeher
-- vom Server (`stornorechnung_ausstellen`).
--
-- DIE REGEL: Das Rechnungsdatum ist der heutige Tag in Wien. Schickt die App
-- ein anderes, wird nichts angelegt und keine Nummer verbraucht — mit einer
-- Meldung, die die Uhr des Geräts nennt. Das Jahr der Nummer folgt dem
-- Rechnungsdatum; `p_jahr` bleibt als Parameter, damit die alte App ihren
-- Aufruf behält, zählt aber nicht mehr. Ein abweichendes Datum gibt es nur
-- ausdrücklich (`p_datum_ausdruecklich`) — für Übernahmen und Prüfungen; die
-- Oberfläche setzt es nie: das Ausstellungsdatum einer Rechnung ist der Tag,
-- an dem sie ausgestellt wird (§ 11 Abs 1 Z 3 lit g UStG).
--
-- Die App schickt ihr Datum weiter mit: aus ihm rechnet sie Zahlungsziel und
-- Skontofrist. Stimmt es, stimmen auch diese; stimmt es nicht, entsteht kein
-- Beleg mit falschen Fristen.
--
-- DIE MAHNUNG: `mahnung_festhalten` nahm den Mahntag ebenso vom Gerät. Ab
-- ihm laufen die Verzugszinsen und die nächste Stufe. Dieselbe Regel.
--
-- VERTRÄGLICH MIT DER ALTEN APP: beide Funktionen behalten ihre Parameter;
-- der neue hat einen Vorgabewert. Die alte App schickt Gerätedatum und -jahr;
-- stimmen sie (der Normalfall), ändert sich nichts.

drop function if exists public.rechnung_ausstellen(jsonb, jsonb, jsonb, text, integer, integer);

create function public.rechnung_ausstellen(
  p_kopf jsonb,
  p_positionen jsonb,
  p_belege jsonb,
  p_praefix text,
  p_jahr integer default null,
  p_wunsch integer default null,
  p_datum_ausdruecklich boolean default false
) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  heute date := (now() at time zone 'Europe/Vienna')::date;
  datum date;
  jahr integer;
  lfd integer;
  nummer text;
  kennung uuid;
begin
  -- `p_jahr` zählt nicht mehr: das Jahr folgt dem Rechnungsdatum (G5).
  datum := coalesce(nullif(p_kopf ->> 'invoice_date', '')::date, heute);
  if datum <> heute and not coalesce(p_datum_ausdruecklich, false) then
    raise exception 'Das Datum dieses Geräts (%) ist nicht der heutige Tag (%). Die Rechnung ist nicht angelegt, keine Nummer verbraucht — bitte Datum und Uhrzeit des Geräts prüfen und neu laden.',
      to_char(datum, 'DD.MM.YYYY'), to_char(heute, 'DD.MM.YYYY')
      using errcode = '22023';
  end if;
  jahr := extract(year from datum)::integer;

  lfd := public.naechste_nummer('invoices', jahr, 0, p_wunsch);
  nummer := case when coalesce(p_praefix, '') = '' then '' else p_praefix || '-' end
         || jahr::text || '-'
         || case when lfd >= 10000 then lfd::text else lpad(lfd::text, 4, '0') end;

  kennung := public.rechnung_anlegen(
    coalesce(p_kopf, '{}'::jsonb) || jsonb_build_object('invoice_number', nummer, 'invoice_date', datum),
    p_positionen,
    p_belege);

  return jsonb_build_object('id', kennung, 'invoice_number', nummer, 'invoice_date', datum);
end;
$$;

revoke all on function public.rechnung_ausstellen(jsonb, jsonb, jsonb, text, integer, integer, boolean) from public, anon;
grant execute on function public.rechnung_ausstellen(jsonb, jsonb, jsonb, text, integer, integer, boolean) to authenticated, service_role;

/*
  DIE MAHNUNG — die Fassung aus `20261011100000_mahnung_nur_offen.sql`, dazu
  der Mahntag vom Server.
*/
drop function if exists public.mahnung_festhalten(uuid, integer, date, date, numeric, jsonb);

create function public.mahnung_festhalten(
  p_invoice uuid,
  p_stufe integer,
  p_datum date,
  p_frist date,
  p_spesen numeric,
  p_inhalt jsonb,
  p_datum_ausdruecklich boolean default false
) returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  heute date := (now() at time zone 'Europe/Vienna')::date;
  rechnung public.invoices;
  neu uuid;
begin
  if p_stufe is null or p_stufe not between 1 and 3 then
    raise exception 'Mahnstufe 1 bis 3' using errcode = '22023';
  end if;
  if p_datum is null or p_frist is null or p_inhalt is null or jsonb_typeof(p_inhalt) <> 'object' then
    raise exception 'Tag, Frist und Inhalt der Mahnung fehlen' using errcode = '22023';
  end if;
  -- Ab dem Mahntag laufen Zinsen und die nächste Stufe — er kommt nicht vom Gerät (G5).
  if p_datum <> heute and not coalesce(p_datum_ausdruecklich, false) then
    raise exception 'Das Datum dieses Geräts (%) ist nicht der heutige Tag (%). Es wurde keine Mahnung festgehalten — bitte Datum und Uhrzeit des Geräts prüfen.',
      to_char(p_datum, 'DD.MM.YYYY'), to_char(heute, 'DD.MM.YYYY')
      using errcode = '22023';
  end if;

  -- Durch denselben Zeilenschutz wie das Ändern: wer nicht mahnen darf, findet sie nicht.
  select * into rechnung from public.invoices i where i.id = p_invoice for update;
  if rechnung.id is null then
    raise exception 'Diese Rechnung gibt es hier nicht, oder sie darf von hier aus nicht gemahnt werden'
      using errcode = '42501';
  end if;

  if rechnung.payment_status = 'Storniert' then
    raise exception 'Die Rechnung ist inzwischen storniert — es wurde keine Mahnung festgehalten.'
      using errcode = '22023';
  end if;
  if rechnung.payment_status in ('Bezahlt', 'Überzahlt') or rechnung.total_brutto - rechnung.bezahlt_betrag <= 0 then
    raise exception 'Die Rechnung ist inzwischen bezahlt — es wurde keine Mahnung festgehalten.'
      using errcode = '22023';
  end if;
  if p_stufe <= rechnung.mahnstufe then
    raise exception 'Die Rechnung ist inzwischen schon mit Stufe % gemahnt — es wurde keine weitere Mahnung festgehalten.',
      rechnung.mahnstufe
      using errcode = '22023';
  end if;
  if p_stufe > rechnung.mahnstufe + 1 then
    raise exception 'Vor Stufe % muss Stufe % gemahnt sein.', p_stufe, rechnung.mahnstufe + 1
      using errcode = '22023';
  end if;

  update public.invoices i
     set mahnstufe = p_stufe,
         gemahnt_am = p_datum,
         mahnfrist = p_frist,
         mahnspesen = p_spesen,
         payment_status = case when i.payment_status = 'Offen' then 'Überfällig' else i.payment_status end
   where i.id = p_invoice;

  perform set_config('app.mahnung_legt', 'ja', true);
  insert into public.mahnungen (company_id, invoice_id, stufe, datum, frist, spesen, inhalt)
  values (rechnung.company_id, p_invoice, p_stufe, p_datum, p_frist, coalesce(p_spesen, 0), p_inhalt)
  returning id into neu;
  perform set_config('app.mahnung_legt', '', true);

  return neu;
end;
$$;

revoke all on function public.mahnung_festhalten(uuid, integer, date, date, numeric, jsonb, boolean) from public, anon;
grant execute on function public.mahnung_festhalten(uuid, integer, date, date, numeric, jsonb, boolean) to authenticated, service_role;
