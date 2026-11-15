/*
  DURCHSICHT 15.11.2026, P3 — „NICHT VERRECHNET“ ÜBER ALLE SCHEINE.

  WAS DIE DURCHSICHT FAND (`analyse/3-planung-scheine.md`, M2). Startseite,
  Rechnungen und Scheinliste suchten unverrechnete Scheine nur unter den 60
  zuletzt ANGELEGTEN (`UNVERRECHNET_BASIS`). Bei fünf Monteuren mit einem
  Schein am Tag sind das zwölf Arbeitstage: ein Schein fiel aus der Basis,
  bevor er die Vier-Wochen-Schwelle erreichen konnte. Die Warnung „über 4
  Wochen“ — der eigentliche Zweck — löste in größeren Betrieben praktisch nie
  aus, und ein vergessener Schein verschwand still aus allen drei Listen.

  WAS JETZT GILT. Eine Funktion über ALLE unterschriebenen Scheine des
  Betriebs liefert die unverrechneten, älteste zuerst. Zähler, Liste und
  Schwelle kommen aus ihr — auf der Startseite, unter Rechnungen und in der
  Scheinliste dieselbe Menge. Sie gibt nur den Kopf (Kennung, Baustelle,
  Kunde, Tag, Abrechnung): Stunden, Material und die Unterschriftsbilder lädt die Liste
  erst, wenn sie die Scheine zeigt.

  DIESELBEN REGELN WIE BISHER (`src/lib/db/pg/invoices.ts: scheineAufRechnung`,
  `src/features/worksheets/unverrechnet.ts`), jetzt in EINEM Kern, den auch
  `scheineAufRechnung` fragt — so können Liste und Baustellenakte nicht
  auseinanderlaufen. Verrechnet ist ein Schein,
    1. der auf einer gültigen (nicht stornierten) Rechnung steht
       (`invoice_coverage`, Art `work_sheet`);
    2. der zu einer Pauschal- oder Einheitspreisbaustelle gehört, deren
       Einzel- oder Schlussrechnung gültig ist (Befund 09.11.2026) — das
       Angebot ist dort die Rechnung;
    3. der kein Material trägt und dessen Tag eine gültige Rechnung derselben
       Baustelle schon abgerechnet hat (Gesamtanalyse 12.11.2026, A1): keine
       Anzahlung, mit verbrauchten Belegen, Zeitraum bis „Leistung bis“
       (ohne sie: Rechnungsdatum), ab „Leistung von“, falls gesetzt.
  Die Baustellennummer wird verglichen wie in der App: ohne „PR-“, ohne
  Leerzeichen am Rand, ohne Groß/klein.

  WER. Wer Rechnungen schreibt (Buchhaltung, Spitze, Support beim
  Mitarbeiten) und der Support beim Lesen — wie die Abdeckung, aus der die
  App bisher las. Allen anderen ein Fehler statt einer leeren Liste: leer
  hieße „alles verrechnet“.
*/

/*
  Der Kern: welche der genannten Scheine verrechnet sind (null = alle
  unterschriebenen des Betriebs). Ohne Rechteprüfung — nur für die beiden
  Funktionen unten, die prüfen.
*/
create or replace function app.scheine_verrechnet_kern(p_betrieb text, p_ids uuid[] default null)
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with s as (
    select w.id, w.status, w.datum,
           lower(regexp_replace(btrim(coalesce(w.project_number, '')), '^pr-', '', 'i')) as nr
      from public.work_sheets w
     where w.company_id = p_betrieb
       and (p_ids is null or w.id = any (p_ids))
       and (p_ids is not null or w.status = 'Unterschrieben')
  ),
  gueltig as (
    select i.id, coalesce(i.art, 'einzel') as art, i.leistung_von,
           coalesce(i.leistung_bis, i.invoice_date) as bis,
           lower(regexp_replace(btrim(coalesce(i.project_number, '')), '^pr-', '', 'i')) as nr
      from public.invoices i
     where i.company_id = p_betrieb
       and i.payment_status is distinct from 'Storniert'
  ),
  -- 1. Auf einer gültigen Rechnung.
  abgedeckt as (
    select c.ziel_id as id
      from public.invoice_coverage c
      join gueltig g on g.id = c.invoice_id
     where c.company_id = p_betrieb and c.art = 'work_sheet'
  ),
  -- 2. In einer verrechneten Pauschale.
  pauschale as (
    select s.id
      from s
     where s.status = 'Unterschrieben' and s.nr <> ''
       and exists (select 1 from public.projects p
                    where p.company_id = p_betrieb
                      and p.billing_mode in ('Pauschal', 'Einheitspreis')
                      and lower(regexp_replace(btrim(coalesce(p.project_number, '')), '^pr-', '', 'i')) = s.nr)
       and exists (select 1 from gueltig g where g.nr = s.nr and g.art not in ('anzahlung', 'teil'))
  ),
  -- 3. Ohne Material, Tag schon abgerechnet.
  zeitraum as (
    select s.id
      from s
     where s.status = 'Unterschrieben' and s.nr <> '' and s.datum is not null
       and not exists (select 1 from public.work_sheet_material m
                        where m.work_sheet_id = s.id and m.menge > 0 and btrim(coalesce(m.name, '')) <> '')
       and exists (select 1 from gueltig g
                    where g.nr = s.nr and g.art <> 'anzahlung' and g.bis is not null
                      and s.datum <= g.bis and (g.leistung_von is null or s.datum >= g.leistung_von)
                      and exists (select 1 from public.invoice_coverage c
                                   where c.invoice_id = g.id
                                     and c.art in ('time_entry', 'material_order', 'work_sheet')))
  )
  select s.id from s where s.id in (select id from abgedeckt)
  union
  select id from pauschale
  union
  select id from zeitraum
$$;

revoke all on function app.scheine_verrechnet_kern(text, uuid[]) from public, anon, authenticated;

/* Der Betrieb, über den gefragt werden darf — sonst ein Fehler. */
create or replace function app.verrechnung_betrieb() returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  b text;
begin
  if coalesce(app.ist_buch_oder_spitze(), false) then
    b := coalesce(app.arbeitsbetrieb(), app.lesebetrieb());
  end if;
  b := coalesce(b, app.supportbetrieb());
  if b is null then
    raise exception 'Ob ein Schein verrechnet ist, sieht nur, wer Rechnungen schreibt' using errcode = '42501';
  end if;
  return b;
end;
$$;

revoke all on function app.verrechnung_betrieb() from public, anon, authenticated;

/*
  ALLE UNVERRECHNETEN SCHEINE, älteste zuerst — Zähler, Liste und Schwelle.
  Bewusst ohne Grenze: die Antwort ist schmal (fünf Spalten), und genau die
  Vollständigkeit ist die Zusage. Ein Betrieb, der Hunderte unverrechnete
  Scheine hat, soll diese Zahl sehen.
*/
create or replace function public.scheine_unverrechnet()
  returns table (id uuid, project_number text, customer_name text, datum date, abrechnung text)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  betrieb text := app.verrechnung_betrieb();
begin
  return query
  select w.id, w.project_number, w.customer_name, w.datum, w.abrechnung
    from public.work_sheets w
   where w.company_id = betrieb
     and w.status = 'Unterschrieben'
     and w.id not in (select k from app.scheine_verrechnet_kern(betrieb, null) k)
   order by w.datum, w.id;
end;
$$;

revoke all on function public.scheine_unverrechnet() from public, anon;
grant execute on function public.scheine_unverrechnet() to authenticated;

/* Welche der genannten Scheine verrechnet sind — für die Baustellenakte und die Rechnung. */
create or replace function public.scheine_verrechnet(p_ids uuid[])
  returns setof uuid
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.verrechnung_betrieb();
begin
  if coalesce(cardinality(p_ids), 0) = 0 then
    return;
  end if;
  return query select k from app.scheine_verrechnet_kern(betrieb, p_ids) k;
end;
$$;

revoke all on function public.scheine_verrechnet(uuid[]) from public, anon;
grant execute on function public.scheine_verrechnet(uuid[]) to authenticated;

-- Der Kern sucht die unterschriebenen Scheine eines Betriebs; die übrigen Zustände bleiben außen vor.
create index if not exists work_sheets_unterschrieben
  on public.work_sheets (company_id, datum)
  where status = 'Unterschrieben';
