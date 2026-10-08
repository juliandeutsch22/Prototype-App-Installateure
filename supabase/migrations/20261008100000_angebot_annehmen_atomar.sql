-- Angebot, Baustelle und Zähler gehören in eine Transaktion. Eine geladene
-- Browserfassung kennt weder einen parallelen Auftrag noch einen Abbruch.
create or replace function public.angebot_annehmen(
  p_id uuid,
  p_praefix text,
  p_abrechnung text default 'Pauschal'
) returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  angebot public.quotes;
  baustelle public.projects;
  jahr integer := extract(year from now() at time zone 'Europe/Vienna');
  lauf integer;
  nummer text;
  beschreibung text;
  auftragstext text;
begin
  if betrieb is null or not coalesce(app.angemeldet(), false)
     or not coalesce(app.darf(betrieb) and app.ist_fuehrung(), false) then
    raise exception 'Nur die Führung nimmt Angebote an' using errcode = '42501';
  end if;

  -- Die Sperre serialisiert auch Aufrufe aus zwei Geräten. Der zweite liest
  -- danach die Zuordnung des ersten statt seine alte Browserfassung.
  select * into angebot from public.quotes q
   where q.id = p_id and q.company_id = betrieb for update;
  if angebot.id is null then
    raise exception 'Das Angebot gibt es in diesem Betrieb nicht' using errcode = 'P0002';
  end if;

  select * into baustelle from public.projects p
   where p.company_id = betrieb
     and (p.id = angebot.project_id or p.project_number = angebot.project_number)
   order by (p.id = angebot.project_id) desc nulls last limit 1;
  if baustelle.id is not null then
    -- Auch eine Baustelle aus dem früheren mehrteiligen Ablauf bleibt erhalten.
    update public.quotes set status = 'Angenommen', project_number = baustelle.project_number
     where id = angebot.id;
    return baustelle.project_number;
  end if;

  if p_praefix is null or p_praefix !~ '^[A-Z0-9-]{0,6}$'
     or p_abrechnung is null or p_abrechnung not in ('Pauschal', 'Regie', 'Einheitspreis') then
    raise exception 'Baustellenvorsatz oder Abrechnungsart ist ungültig' using errcode = '22023';
  end if;
  lauf := public.naechste_nummer('projects', jahr);
  nummer := case when p_praefix = '' then '' else p_praefix || '-' end
    || jahr::text || '-' || lpad(lauf::text, greatest(4, length(lauf::text)), '0');
  -- Wie bisher String.trim(): auch Zeilenumbrüche, Tabulatoren und geschützte
  -- Leerzeichen am Rand gehören nicht zum Auftragsumfang.
  auftragstext := btrim(angebot.notes,
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  beschreibung := case when nullif(auftragstext, '') is null then ''
    else auftragstext || E'\n\n' end || 'Aus Angebot ' || angebot.quote_number;

  insert into public.projects (
    company_id, project_number, customer_id, customer_name, address,
    status, billing_mode, estimated_hours, description
  ) values (
    betrieb, nummer, angebot.customer_id, angebot.customer_name, angebot.address,
    'Aktiv', p_abrechnung,
    case when angebot.kalkulierte_stunden > 0 then angebot.kalkulierte_stunden else null end,
    beschreibung
  );
  -- Der vorhandene Auslöser setzt project_id wie bei allen anderen Schreibwegen.
  update public.quotes set status = 'Angenommen', project_number = nummer
   where id = angebot.id;
  return nummer;
end;
$$;

revoke all on function public.angebot_annehmen(uuid, text, text) from public, anon;
grant execute on function public.angebot_annehmen(uuid, text, text) to authenticated;
