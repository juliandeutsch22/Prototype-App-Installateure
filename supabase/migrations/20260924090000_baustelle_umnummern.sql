-- DIE BAUSTELLENNUMMER ÄNDERN — und alles, was an ihr hängt, geht mit.
--
-- GEFUNDEN AM 23.09.2026: die Nummer liess sich in der Akte ändern, aber
-- Zeitbuchungen, Scheine, Einsätze, Rüstlisten, Anforderungen, Angebote und
-- Wiedervorlagen tragen sie als TEXT (`project_number`). Nach einem
-- korrigierten Zahlendreher stand die Baustelle mit null Stunden da, die
-- Rechnung fand ihre Scheine nicht — und nichts wies darauf hin.
--
-- WARUM TEXT UND NICHT NUR DIE KENNUNG: siehe `app.baustelle_aufloesen` —
-- der Monteur bucht auf eine Nummer, bevor das Büro die Baustelle anlegt.
-- Daran ändert sich nichts. Neu ist nur der Weg, die Nummer zu wechseln.
--
-- WANN ES NICHT GEHT, und das ist Absicht:
--   - Es gibt eine Rechnung auf dieser Nummer. Eine ausgestellte Rechnung
--     ändert man nicht (§ 132 BAO), und eine Baustelle, deren Belege eine
--     andere Nummer tragen als sie selbst, ist schlimmer als eine
--     unglückliche Nummer.
--   - Es gibt einen unterschriebenen oder stornierten Schein. Der Kunde hat
--     ihn mit dieser Nummer unterschrieben, und die Prüfsumme hängt daran.
--   - Etwas ist bereits verrechnet.
-- Das ist der Normalfall eines Zahlendrehers nicht: der fällt am ersten Tag
-- auf, nicht nach der Schlussrechnung.

create or replace function public.baustelle_umnummern(p_projekt uuid, p_neu text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  p public.projects;
  neu text := btrim(coalesce(p_neu, ''));
  alt text;
  gesperrt text[] := '{}';
  n integer;
  bewegt jsonb := '{}';
begin
  if betrieb is null or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  -- Dieselbe Grenze wie `projects_aendern`: wer die Baustelle nicht ändern
  -- darf, darf auch ihre Nummer nicht ändern.
  if not app.ist_fuehrung() then
    raise exception 'Die Nummer einer Baustelle ändert nur die Leitung' using errcode = '42501';
  end if;
  if neu = '' then
    raise exception 'Ohne Projektnummer geht es nicht' using errcode = '22023';
  end if;

  select * into p from public.projects
   where id = p_projekt and company_id = betrieb
   for update;
  if p.id is null then
    raise exception 'Diese Baustelle gibt es nicht' using errcode = 'P0002';
  end if;
  alt := p.project_number;
  if alt = neu then
    return jsonb_build_object('geaendert', false);
  end if;

  if exists (select 1 from public.projects
              where company_id = betrieb and project_number = neu) then
    raise exception 'Die Nummer „%" ist schon vergeben', neu using errcode = '23505';
  end if;

  -- Was die Nummer festhält — gesammelt, damit die Meldung ALLE Gründe nennt.
  select count(*) into n from public.invoices
   where company_id = betrieb and project_number = alt;
  if n > 0 then gesperrt := gesperrt || format('%s Rechnung(en)', n); end if;

  select count(*) into n from public.work_sheets
   where company_id = betrieb and project_number = alt
     and status in ('Unterschrieben', 'Storniert');
  if n > 0 then gesperrt := gesperrt || format('%s unterschriebene(r) Schein(e)', n); end if;

  select count(*) into n from public.time_entries
   where company_id = betrieb and project_number = alt and is_billed;
  if n > 0 then gesperrt := gesperrt || format('%s verrechnete Buchung(en)', n); end if;

  select count(*) into n from public.material_orders
   where company_id = betrieb and project_number = alt and is_billed;
  if n > 0 then gesperrt := gesperrt || format('%s verrechnete Anforderung(en)', n); end if;

  if array_length(gesperrt, 1) > 0 then
    raise exception 'Die Nummer steht schon auf Belegen und bleibt: %',
      array_to_string(gesperrt, ', ') using errcode = '55000';
  end if;

  -- ZUERST die Baustelle, DANN die Zeilen: `baustelle_aufloesen` sucht die
  -- Kennung über die neue Nummer und soll sie dort auch finden.
  update public.projects set project_number = neu where id = p.id;

  update public.time_entries set project_number = neu
   where company_id = betrieb and project_number = alt;
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('buchungen', n);

  update public.assignments set project_number = neu
   where company_id = betrieb and project_number = alt;
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('einsaetze', n);

  update public.einsatz_material set project_number = neu
   where company_id = betrieb and project_number = alt;
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('ruestlisten', n);

  -- Nur Entwürfe: ein verworfener Schein ist im Papierkorb und darf sich dort
  -- nicht ändern (`schein_zustandswechsel`). Wird er zurückgeholt, ist er
  -- wieder ein Entwurf — und dessen Nummer lässt sich im Schein ändern.
  update public.work_sheets set project_number = neu
   where company_id = betrieb and project_number = alt and status = 'Entwurf';
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('scheine', n);

  update public.material_orders set project_number = neu
   where company_id = betrieb and project_number = alt;
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('anforderungen', n);

  update public.quotes set project_number = neu
   where company_id = betrieb and project_number = alt;
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('angebote', n);

  update public.follow_ups set project_number = neu
   where company_id = betrieb and project_number = alt;
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('wiedervorlagen', n);

  return jsonb_build_object('geaendert', true, 'alt', alt, 'neu', neu, 'bewegt', bewegt);
end;
$$;

revoke all on function public.baustelle_umnummern(uuid, text) from public, anon;
grant execute on function public.baustelle_umnummern(uuid, text) to authenticated;
