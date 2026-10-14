-- Annahme und Einplanung sperren ihre Ausgangszeile bis alle Änderungen stehen.
-- Wiederholungen lesen die verknüpfte Baustelle, auch mit einem alten Browserstand.
create or replace function public.angebot_annehmen(p_angebot uuid, p_praefix text, p_abrechnung text default 'Pauschal')
returns text language plpgsql security definer set search_path = '' as $$
declare q public.quotes; nummer text; jahr integer; lfd bigint;
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
  select project_number into nummer from public.projects
    where company_id = q.company_id and project_number = q.project_number;
  if nummer is null then
    jahr := extract(year from now() at time zone 'Europe/Vienna');
    lfd := public.naechste_nummer('projects', jahr, 0, null);
    nummer := case when coalesce(p_praefix, '') = '' then '' else p_praefix || '-' end
      || jahr || '-' || lpad(lfd::text, greatest(4, length(lfd::text)), '0');
    insert into public.projects(company_id, project_number, customer_id, customer_name, address,
      status, billing_mode, estimated_hours, description)
    values(q.company_id, nummer, q.customer_id, q.customer_name, q.address, 'Aktiv', p_abrechnung,
      case when q.kalkulierte_stunden > 0 then q.kalkulierte_stunden end,
      coalesce(nullif(btrim(q.notes), '') || E'\n\n', '') || 'Aus Angebot ' || q.quote_number);
  end if;
  update public.quotes set status = 'Angenommen', project_number = nummer where id = q.id;
  return nummer;
end; $$;
revoke all on function public.angebot_annehmen(uuid, text, text) from public, anon;
grant execute on function public.angebot_annehmen(uuid, text, text) to authenticated;

create or replace function public.wartung_einplanen(p_wartung uuid, p_nummer text, p_praefix text, p_faellig date)
returns text language plpgsql security definer set search_path = '' as $$
declare w public.wartungen; k public.customers; nummer text; jahr integer; lfd bigint;
begin
  if app.ist_fuehrung() is not true then
    raise exception 'Wartungen einplanen darf nur die Führung' using errcode = '42501';
  end if;
  select * into w from public.wartungen where id = p_wartung
    and (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb())) for update;
  if w.id is null then raise exception 'Wartung nicht gefunden' using errcode = 'P0002'; end if;
  -- Ein alter Dialog darf nach Erledigung nicht gleich den nächsten Einsatz anlegen.
  if w.faellig_am is distinct from p_faellig then
    raise exception 'Der Wartungstermin wurde geändert. Bitte die Wartung neu öffnen.' using errcode = '40001';
  end if;
  if nullif(w.offene_baustelle, '') is not null then
    if exists(select 1 from public.projects where company_id = w.company_id and project_number = w.offene_baustelle) then
      return w.offene_baustelle;
    end if;
    raise exception 'Die eingeplante Baustelle fehlt. Bitte die Zuordnung prüfen.';
  end if;
  nummer := nullif(btrim(p_nummer), '');
  if nummer is null then
    jahr := extract(year from now() at time zone 'Europe/Vienna');
    lfd := public.naechste_nummer('projects', jahr, 0, null);
    nummer := case when coalesce(p_praefix, '') = '' then '' else p_praefix || '-' end
      || jahr || '-' || lpad(lfd::text, greatest(4, length(lfd::text)), '0');
  end if;
  select * into k from public.customers where id = w.customer_id and company_id = w.company_id;
  insert into public.projects(company_id, project_number, customer_id, customer_name, address, description, status)
    values(w.company_id, nummer, w.customer_id, coalesce(k.name, w.customer_name),
      coalesce(nullif(btrim(w.address), ''), k.address),
      'Wartung: ' || btrim(w.anlage) || coalesce(' · ' || nullif(btrim(w.hinweis), ''), ''), 'Aktiv');
  update public.wartungen set offene_baustelle = nummer where id = w.id;
  return nummer;
end; $$;
revoke all on function public.wartung_einplanen(uuid, text, text, date) from public, anon;
grant execute on function public.wartung_einplanen(uuid, text, text, date) to authenticated;
