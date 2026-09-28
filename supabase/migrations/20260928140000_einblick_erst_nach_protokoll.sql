/*
  KEIN EINBLICK OHNE PROTOKOLLEINTRAG — VON DER DATENBANK ERZWUNGEN (offene
  Punkte B4, Prüflauf P3-15).

  Bisher schrieb die App den Eintrag „Betrieb" in `support_zugriffe`, bevor
  sie den ersten Datensatz holte. Die Datenbank verlangte ihn nicht: wer mit
  einem Plattformkonto an der App vorbei direkt über die Schnittstelle las,
  las mit jeder gültigen Freigabe — und hinterliess nichts.

  JETZT ÖFFNET SICH EIN BETRIEB ERST NACH DEM EINTRAG. Lesen und Schreiben
  des Supports (`app.support_liest`, `app.support_schreibt`,
  `app.support_arbeitet`) verlangen zusätzlich zur gültigen Freigabe einen
  Eintrag DIESES Plattformkontos für GENAU DIESE Freigabe. Eine neue Freigabe
  heisst: neu beginnen, neuer Eintrag. Ein Eintrag eines anderen
  Plattformkontos öffnet nichts.

  Keine Leseregel schreibt dafür mit — das bliebe falsch (siehe
  `20260920180000_supportzugang.sql`, 3b). Die Regel prüft nur, ob der
  Eintrag DA ist; geschrieben wird er wie bisher über den gewöhnlichen Weg.
  Die App tut das schon so, sie ändert sich nicht.

  DER ERSTE EINTRAG BRAUCHT DESHALB EINE EIGENE PRÜFUNG. Die Regel zum
  Melden fragte `app.support_liest` — die nun erst nach einem Eintrag ja sagt.
  Sie fragt jetzt direkt: gültige Freigabe, und zwar für den Betrieb, der im
  Eintrag steht. Das Letzte fehlte bisher; ein Eintrag konnte die Freigabe
  eines anderen Betriebs nennen.

  WAS WEITER BEI DER APP LIEGT: welche Bereiche danach geöffnet werden. Das
  Protokoll hält fest, dass und wann ein Einblick begann; die einzelnen
  Bereiche meldet die App.
*/

-- Die gültige Freigabe, nach der jeder Einstieg fragt. Mit Definer-Rechten
-- aus demselben Grund wie `app.support_liest`: auf `support_freigaben` liegt
-- selbst ein Zeilenschutz, der wieder nach dem Support fragt.
create or replace function app.freigabe_gilt(p_freigabe uuid, p_betrieb text) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.support_freigaben f
     where f.id = p_freigabe
       and f.company_id = p_betrieb
       and f.widerrufen_am is null
       and f.gilt_bis > now())
$$;

revoke all on function app.freigabe_gilt(uuid, text) from public, anon, authenticated;
grant execute on function app.freigabe_gilt(uuid, text) to authenticated;

create or replace function app.support_liest(betrieb text) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.ist_plattform() and exists (
    select 1 from public.support_freigaben f
     where f.company_id = betrieb
       and f.widerrufen_am is null
       and f.gilt_bis > now()
       and exists (
         select 1 from public.support_zugriffe z
          where z.freigabe_id = f.id
            and z.admin_uid = auth.uid()))
$$;

create or replace function app.support_schreibt(betrieb text) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.ist_plattform() and exists (
    select 1 from public.support_freigaben f
     where f.company_id = betrieb
       and f.stufe = 'mitarbeiten'
       and f.widerrufen_am is null
       and f.gilt_bis > now()
       and exists (
         select 1 from public.support_zugriffe z
          where z.freigabe_id = f.id
            and z.admin_uid = auth.uid()))
$$;

create or replace function app.support_arbeitet() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.ist_plattform() and exists (
    select 1 from public.support_freigaben f
     where f.stufe = 'mitarbeiten'
       and f.widerrufen_am is null
       and f.gilt_bis > now()
       and exists (
         select 1 from public.support_zugriffe z
          where z.freigabe_id = f.id
            and z.admin_uid = auth.uid()))
$$;

drop policy if exists support_zugriffe_melden on support_zugriffe;
create policy support_zugriffe_melden on support_zugriffe
  for insert with check (
    app.ist_plattform() and admin_uid = auth.uid()
    and app.freigabe_gilt(freigabe_id, company_id));

-- Jede Leseregel fragt jetzt nach dem Eintrag zur Freigabe.
create index if not exists support_zugriffe_freigabe
  on support_zugriffe (freigabe_id, admin_uid);
