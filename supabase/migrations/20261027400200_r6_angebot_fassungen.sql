/*
  ANGEBOTE: FASSUNGEN, ARBEITSZEIT UND ANSPRECHPARTNER (Testbericht Runde 6, G15, G24, Hinweis 11)

  G15 — EINE ÜBERHOLTE FASSUNG LIESS SICH NOCH ANNEHMEN. Nach dem Annehmen
  von AN-2026-0009 („Neue Fassung“ von AN-2026-0008) stand AN-2026-0008
  weiter auf „Versendet“ mit „Annehmen → Baustelle“; ein Klick hätte eine
  zweite Baustelle zum selben Auftrag angelegt.
  - Neuer Stand `Ersetzt`: wird eine Fassung angenommen, gelten die übrigen
    noch offenen Fassungen desselben Angebots (Entwurf, Versendet) als
    ersetzt. Abgelehnte bleiben abgelehnt.
  - Eine Fassung wird nicht angenommen, wenn eine andere desselben Angebots
    schon angenommen ist — auf jedem Weg, nicht nur über `angebot_annehmen`
    (Wächter am Status). Eine ersetzte Fassung wird nicht wieder offen.
  - „Dasselbe Angebot“ sind alle Fassungen, die über `vorgaenger_id`
    zusammenhängen, vorwärts und rückwärts.
  - Bestand: Fassungen, die schon heute neben einer angenommenen offen
    stehen, werden NICHT umgeschrieben. Annehmen lassen sie sich trotzdem
    nicht mehr — das verhindert der Wächter.

  G24 — „ZÄHLT ALS ARBEITSZEIT“ BEI EINER PAUSCHALE. Der Haken nahm die
  Menge als Stunden: „1 Pauschale“ ergab 1 h Budget. Die App bietet ihn nur
  noch bei einer Stunden-Einheit an; die Datenbank hält dasselbe für neue
  Positionen fest (`not valid`: gespeicherte Zeilen bleiben, wie sie sind).
  Das Budget der Baustelle bleibt die Zahl, die am Angebot steht
  (`kalkulierte_stunden`) — sie rechnet die App aus genau diesen Zeilen.

  HINWEIS 11 — DER ANSPRECHPARTNER DES KUNDEN. Beim Anlegen einer Baustelle
  musste er neu getippt werden. Die Baustelle aus einem Angebot bekommt
  Ansprechpartner und Telefon aus der Kundenakte vorbelegt; in der
  Baustellenakte bleiben sie änderbar.

  `angebot_annehmen`: Rumpf wie in 20261013100000_baustelle_atomare_annahme.sql,
  ergänzt um den Ansprechpartner und das Ersetzen der übrigen Fassungen.
*/

-- ---------------------------------------------------------------------------
-- G15: der Stand „Ersetzt“
-- ---------------------------------------------------------------------------

alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('Entwurf', 'Versendet', 'Angenommen', 'Abgelehnt', 'Ersetzt'));

/* Alle Fassungen eines Angebots: nach oben bis zur ersten, von dort alle Nachfolger. */
create or replace function app.angebot_fassungen(p_angebot uuid)
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with recursive hoch(id, vorgaenger_id) as (
    select q.id, q.vorgaenger_id from public.quotes q where q.id = p_angebot
    union
    select v.id, v.vorgaenger_id from public.quotes v join hoch h on v.id = h.vorgaenger_id
  ),
  runter(id) as (
    select h.id from hoch h where h.vorgaenger_id is null
       or not exists (select 1 from public.quotes x where x.id = h.vorgaenger_id)
    union
    select n.id from public.quotes n join runter r on n.vorgaenger_id = r.id
  )
  select id from runter
$$;

revoke all on function app.angebot_fassungen(uuid) from public, anon, authenticated;

create or replace function app.angebot_fassung_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  andere public.quotes;
begin
  if app.ist_dienst() or new.status is not distinct from old.status then
    return new;
  end if;
  if old.status = 'Ersetzt' then
    raise exception 'Angebot % ist durch eine andere Fassung ersetzt und wird nicht wieder offen', old.quote_number
      using errcode = '55000';
  end if;
  if new.status = 'Angenommen' then
    select q.* into andere
      from public.quotes q
     where q.id in (select app.angebot_fassungen(new.id))
       and q.id <> new.id
       and q.status = 'Angenommen'
     limit 1;
    if andere.id is not null then
      raise exception 'Von diesem Angebot ist schon die Fassung % angenommen% — eine zweite Baustelle zum selben Auftrag entsteht nicht',
        andere.quote_number,
        coalesce(' (Baustelle ' || nullif(andere.project_number, '') || ')', '')
        using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app.angebot_fassung_pruefen() from public, anon, authenticated;

drop trigger if exists quotes_fassung_pruefen on public.quotes;
create trigger quotes_fassung_pruefen
  before update of status on public.quotes
  for each row execute function app.angebot_fassung_pruefen();

-- ---------------------------------------------------------------------------
-- G15 und Hinweis 11: annehmen
-- ---------------------------------------------------------------------------

create or replace function public.angebot_annehmen(p_angebot uuid, p_praefix text, p_abrechnung text default 'Pauschal')
returns text language plpgsql security definer set search_path = '' as $$
declare q public.quotes; k public.customers; nummer text; jahr integer; lfd bigint;
begin
  if app.ist_fuehrung() is not true then
    raise exception 'Angebote annehmen darf nur die Führung' using errcode = '42501';
  end if;
  select * into q from public.quotes where id = p_angebot
    and (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb())) for update;
  if q.id is null then raise exception 'Angebot nicht gefunden' using errcode = 'P0002'; end if;
  if p_abrechnung is null or p_abrechnung not in ('Regie', 'Pauschal', 'Einheitspreis') then
    raise exception 'Unbekannte Abrechnungsart' using errcode = '22023';
  end if;
  -- G15: vor dem Zähler, damit keine Baustellennummer für nichts vergeben wird.
  if q.status = 'Ersetzt' then
    raise exception 'Angebot % ist durch eine andere Fassung ersetzt', q.quote_number using errcode = '55000';
  end if;
  select project_number into nummer from public.projects
    where company_id = q.company_id and project_number = q.project_number;
  if nummer is null then
    jahr := extract(year from now() at time zone 'Europe/Vienna');
    lfd := public.naechste_nummer('projects', jahr, 0, null);
    nummer := case when coalesce(p_praefix, '') = '' then '' else p_praefix || '-' end
      || jahr || '-' || lpad(lfd::text, greatest(4, length(lfd::text)), '0');
    -- Hinweis 11: der Ansprechpartner aus der Kundenakte, änderbar in der Baustelle.
    select * into k from public.customers where id = q.customer_id and company_id = q.company_id;
    insert into public.projects(company_id, project_number, customer_id, customer_name, address,
      status, billing_mode, estimated_hours, description, contact_name, contact_phone)
    values(q.company_id, nummer, q.customer_id, q.customer_name, q.address, 'Aktiv', p_abrechnung,
      case when q.kalkulierte_stunden > 0 then q.kalkulierte_stunden end,
      coalesce(nullif(btrim(q.notes), '') || E'\n\n', '') || 'Aus Angebot ' || q.quote_number,
      nullif(btrim(coalesce(k.contact_name, '')), ''), nullif(btrim(coalesce(k.contact_phone, '')), ''));
  end if;
  -- Der Wächter am Status (`quotes_fassung_pruefen`) hält eine zweite angenommene Fassung auf.
  update public.quotes set status = 'Angenommen', project_number = nummer where id = q.id;
  -- G15: die übrigen offenen Fassungen desselben Angebots sind damit ersetzt.
  update public.quotes set status = 'Ersetzt'
   where id in (select app.angebot_fassungen(q.id))
     and id <> q.id
     and status in ('Entwurf', 'Versendet');
  return nummer;
end; $$;
revoke all on function public.angebot_annehmen(uuid, text, text) from public, anon;
grant execute on function public.angebot_annehmen(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- G24: Arbeitszeit nur in Stunden
-- ---------------------------------------------------------------------------

alter table public.quote_lines drop constraint if exists quote_lines_arbeitszeit_in_stunden;
alter table public.quote_lines add constraint quote_lines_arbeitszeit_in_stunden
  check (not coalesce(ist_arbeitszeit, false) or btrim(coalesce(unit, '')) ~* '^(h|std\.?|stunden?)$')
  not valid;
