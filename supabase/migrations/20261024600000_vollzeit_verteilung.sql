-- ---------------------------------------------------------------------------
-- Die Vollzeit je Wochentag (A6 der Durchsicht vom 24.10.2026)
--
-- Bei Teilzeit ist Mehrarbeit (§ 19d AZG), was über dem eigenen Soll bis zur
-- Vollzeit liegt — auch je Tag: bis zur Normalarbeitszeit, die eine Vollzeit
-- an DIESEM Tag hätte. Senklot nahm dafür ein Fünftel der Woche (T-1). Bei
-- einer ungleich verteilten Woche — etwa vier lange Tage und ein kurzer
-- Freitag — stimmt das nicht: am langen Tag begann die Überstunde zu früh,
-- am Freitag zu spät.
--
-- Jetzt kann der Betrieb die Verteilung seiner Vollzeit angeben: Stunden je
-- Wochentag (Schlüssel 0 = Sonntag bis 6 = Samstag, wie in der App). Ohne
-- Angabe gilt wie bisher ein Fünftel der Woche an jedem Tag; nichts ändert
-- sich für einen Betrieb, der nichts einstellt.
--
-- DIE DATENBANK PRÜFT, was die App prüft: höchstens 10 Std. Normalarbeitszeit
-- je Tag (§ 4 AZG), nichts Negatives, nur die sieben Wochentage, und die
-- Summe ist die Vollzeit je Woche. Sonst rechnete die Mehrarbeit mit einer
-- Woche, die es so nicht gibt.
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists vollzeit_verteilung jsonb;

/*
  Immutable, damit die Prüfregel sie aufrufen kann; sie liest nur ihre
  Argumente. SECURITY DEFINER und leerer Suchpfad wie jede neue Funktion.
*/
create or replace function app.vollzeit_verteilung_gueltig(p_verteilung jsonb, p_woche numeric)
  returns boolean
  language plpgsql
  immutable
  security definer
  set search_path = ''
as $$
declare
  schluessel text;
  wert jsonb;
  summe numeric := 0;
begin
  if p_verteilung is null then
    return true;
  end if;
  if jsonb_typeof(p_verteilung) <> 'object' then
    return false;
  end if;
  for schluessel, wert in select * from jsonb_each(p_verteilung) loop
    if schluessel !~ '^[0-6]$' or jsonb_typeof(wert) <> 'number'
       or (wert #>> '{}')::numeric < 0 or (wert #>> '{}')::numeric > 10 then
      return false;
    end if;
    summe := summe + (wert #>> '{}')::numeric;
  end loop;
  return abs(summe - p_woche) < 0.01;
end;
$$;

revoke all on function app.vollzeit_verteilung_gueltig(jsonb, numeric) from public, anon;
/*
  DIE PRÜFREGEL LÄUFT MIT DEN RECHTEN DESSEN, DER ÄNDERT. Ohne diese
  Freigabe scheiterte jede Änderung an `companies` — auch an der Bankverbindung
  — mit „permission denied“ (gefunden beim Bauen, `vollzeitWochenstunden.test.ts`).
  Die Funktion liest nur ihre Argumente, keine Tabelle.
*/
grant execute on function app.vollzeit_verteilung_gueltig(jsonb, numeric) to authenticated, service_role;

alter table public.companies drop constraint if exists companies_vollzeit_verteilung;
alter table public.companies add constraint companies_vollzeit_verteilung
  check (app.vollzeit_verteilung_gueltig(vollzeit_verteilung, vollzeit_wochenstunden));

comment on column public.companies.vollzeit_verteilung is
  'Bei tagesgrenze: Stunden einer Vollzeit je Wochentag ("0" = Sonntag bis "6" = Samstag), Summe = vollzeit_wochenstunden. Leer: ein Fünftel der Woche je Tag. Grenze der Mehrarbeit in Teilzeit je Tag (§ 19d AZG).';
