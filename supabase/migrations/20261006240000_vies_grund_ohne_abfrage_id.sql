-- ===========================================================================
-- WARUM EINE VIES-ABFRAGE KEINE ABFRAGE-ID HAT (Testbericht Runde 3, G21)
-- ===========================================================================
--
-- In der Kundenakte stand „ohne Abfrage-ID“ ohne den Grund, den das Handbuch
-- verspricht. Die Edge Function kannte ihn (etwa „VIES erkennt die eigene
-- UID-Nummer aus den Firmendaten nicht an“), gab ihn aber nur einmal als
-- Hinweis zurück — beim nächsten Öffnen der Akte war er weg. Jetzt steht er
-- an der Abfrage selbst.
--
-- Die Funktion bekommt einen Parameter mit Vorgabe; die alte Fassung mit
-- neun Parametern geht, sonst wäre ein Aufruf mit neun benannten Werten
-- mehrdeutig. Eine Edge Function vom alten Stand ruft bis zu ihrer
-- Auslieferung die neue Fassung ohne Grund auf.

alter table public.uid_pruefungen
  add column if not exists ohne_id_grund text;

comment on column public.uid_pruefungen.ohne_id_grund is
  'Warum VIES keine Abfrage-ID vergeben hat — nur bei einer Abfrage ohne ID (Runde 3, G21).';

drop function if exists public.uid_pruefung_festhalten(uuid, uuid, text, boolean, text, text, text, text, timestamptz);

-- Rumpf wie 20261002400000_uid_vies_und_kalender.sql, dazu der Grund.
create or replace function public.uid_pruefung_festhalten(
  p_aufrufer uuid,
  p_kunde uuid,
  p_uid text,
  p_gueltig boolean,
  p_name text,
  p_adresse text,
  p_abfrage_id text,
  p_eigene_uid text,
  p_abgefragt_am timestamptz,
  p_ohne_id_grund text default null
) returns public.uid_pruefungen
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  geprueft record;
  ich public.users;
  zeile public.uid_pruefungen;
begin
  if p_gueltig is null or p_abgefragt_am is null then
    raise exception 'Ergebnis und Zeitpunkt der Abfrage fehlen' using errcode = '22023';
  end if;
  -- Dieselben Bedingungen noch einmal, und die UID muss noch die sein, die
  -- abgefragt wurde: wer sie inzwischen geändert hat, bekäme sonst einen
  -- Nachweis für eine Nummer, die nicht mehr am Kunden steht.
  select * into geprueft from public.uid_pruefung_vorbereiten(p_aufrufer, p_kunde);
  if geprueft.uid is distinct from app.uid_normalisieren(p_uid) then
    raise exception 'Die UID-Nummer des Kunden wurde während der Abfrage geändert' using errcode = '40001';
  end if;
  select * into ich from public.users u where u.id = p_aufrufer;

  insert into public.uid_pruefungen (
    company_id, customer_id, uid, gueltig, name, adresse, abfrage_id, eigene_uid,
    abgefragt_am, durch, durch_name, ohne_id_grund
  ) values (
    ich.company_id, p_kunde, geprueft.uid, p_gueltig,
    nullif(btrim(coalesce(p_name, '')), ''), nullif(btrim(coalesce(p_adresse, '')), ''),
    nullif(btrim(coalesce(p_abfrage_id, '')), ''), app.uid_normalisieren(p_eigene_uid),
    p_abgefragt_am, p_aufrufer, ich.name,
    -- Ein Grund gehört nur zu einer Abfrage ohne ID.
    case when nullif(btrim(coalesce(p_abfrage_id, '')), '') is null
         then nullif(btrim(coalesce(p_ohne_id_grund, '')), '') end
  ) returning * into zeile;
  return zeile;
end;
$$;

revoke all on function public.uid_pruefung_festhalten(uuid, uuid, text, boolean, text, text, text, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.uid_pruefung_festhalten(uuid, uuid, text, boolean, text, text, text, text, timestamptz, text)
  to service_role;
