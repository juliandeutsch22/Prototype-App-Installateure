-- DIE BAUSTELLENNUMMER ÄNDERN — JETZT WIRKLICH ALLES, WAS AN IHR HÄNGT.
--
-- Aus dem Prüflauf vom 25.09.2026 (P3-26): `baustelle_umnummern` nahm zwei
-- Stellen nicht mit —
--
--   - die Wartungen (`letzte_baustelle`, `offene_baustelle`), die die Nummer
--     als Text tragen;
--   - verworfene Scheine. Der Riegel `schein_zustandswechsel` liess an einem
--     verworfenen Schein keine Änderung zu, auch nicht diese; wer ihn danach
--     zurückholte, hatte einen Entwurf zur alten Nummer.
--
-- Beide Funktionen hier in ihrer ganzen Fassung; geändert sind nur die
-- benannten Stellen. `schein_zustandswechsel` ist sonst Wort für Wort die
-- aus `20260926112500_schein_schreiben_wer_darf.sql`, `baustelle_umnummern`
-- die aus `20260924090000_baustelle_umnummern.sql`.

create or replace function app.schein_zustandswechsel() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() then return new; end if;

  if old.status = 'Entwurf' then
    if new.status = 'Storniert' then
      raise exception 'Ein Entwurf wird verworfen, nicht storniert — storniert wird ein unterschriebener Schein'
        using errcode = '42501';
    end if;
    if new.status = 'Unterschrieben'
       and (jsonb_typeof(new.unterschrift_monteur) is distinct from 'object'
            or jsonb_typeof(new.unterschrift_kunde) is distinct from 'object') then
      raise exception 'Unterschrieben ist ein Schein erst mit beiden Unterschriften — der des Monteurs und der des Kunden'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Die Pruefsumme nachtragen: nur sie, nur einmal, und nur die richtige.
  if new.status = old.status
     and old.inhalt_hash is null
     and new.inhalt_hash is not null
     and app.nur_diese_felder(to_jsonb(old), to_jsonb(new), array['inhalt_hash'])
     and new.inhalt_hash = app.schein_hash(new.id) then
    return new;
  end if;

  if old.status = 'Verworfen' and new.status = 'Entwurf' then
    if not app.nur_diese_felder(to_jsonb(old), to_jsonb(new), array['status']) then
      raise exception 'Beim Zurückholen ändert sich nur der Zustand, nicht der Inhalt'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Der verworfene Entwurf wandert mit, wenn die Baustelle eine neue Nummer
  -- bekommt — nur die Nummer, und nur aus `baustelle_umnummern` heraus
  -- (Eigentümerrechte, nicht aus der App).
  if old.status = 'Verworfen' and new.status = 'Verworfen'
     and current_user <> 'authenticated'
     and app.nur_diese_felder(to_jsonb(old), to_jsonb(new), array['project_number', 'project_id']) then
    return new;
  end if;

  if old.status = 'Unterschrieben' and new.status = 'Storniert' then
    if not app.ist_fuehrung() then
      raise exception 'Nur die Führung darf einen unterschriebenen Schein stornieren'
        using errcode = '42501';
    end if;
    if coalesce(new.storno_grund, '') = '' then
      raise exception 'Ein Storno braucht einen Grund' using errcode = '42501';
    end if;
    if not app.nur_diese_felder(to_jsonb(old), to_jsonb(new),
                                array['status', 'storno_grund', 'storniert_von_name']) then
      raise exception 'Der Storno ist eine Klammer um den Beleg, keine Gelegenheit ihn zu ändern'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Ein Schein im Zustand % lässt sich nicht mehr ändern (Ziel: %)',
    old.status, new.status using errcode = '42501';
end;
$$;

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

  -- Entwürfe UND verworfene Entwürfe. Der verworfene blieb bisher auf der
  -- alten Nummer stehen — wer ihn zurückholte, hatte einen Schein zu einer
  -- Baustelle, die es so nicht mehr gibt. `schein_zustandswechsel` lässt an
  -- ihm genau diese eine Änderung zu, und nur aus dieser Funktion heraus.
  -- Unterschriebene und stornierte Scheine halten die Nummer ohnehin fest
  -- (siehe oben): der Kunde hat sie so unterschrieben.
  update public.work_sheets set project_number = neu
   where company_id = betrieb and project_number = alt and status in ('Entwurf', 'Verworfen');
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

  -- Die Wartungen merken sich die letzte und die offene Baustelle als Text.
  -- Blieb dort die alte Nummer, führte „zur Baustelle" aus der Wartung ins
  -- Leere.
  update public.wartungen
     set letzte_baustelle = case when letzte_baustelle = alt then neu else letzte_baustelle end,
         offene_baustelle = case when offene_baustelle = alt then neu else offene_baustelle end
   where company_id = betrieb and (letzte_baustelle = alt or offene_baustelle = alt);
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('wartungen', n);

  return jsonb_build_object('geaendert', true, 'alt', alt, 'neu', neu, 'bewegt', bewegt);
end;
$$;

revoke all on function public.baustelle_umnummern(uuid, text) from public, anon;
grant execute on function public.baustelle_umnummern(uuid, text) to authenticated;
