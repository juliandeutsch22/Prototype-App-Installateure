/*
  DER SUPPORT ARBEITET IN EINEM BETRIEB ZUR ZEIT (offene Punkte B3, Prüflauf
  P3-02, Rest).

  Die Rollenfunktionen (`app.ist_spitze`, `app.ist_fuehrung`, …) kennen keinen
  Betrieb; für ein Plattformkonto sagten sie ja, sobald IRGENDEINE Freigabe
  „mitarbeiten" galt (`app.support_arbeitet`). Wer in A mitarbeiten durfte und
  in B nur ansehen, sah in B deshalb auch, was dort nur die Spitze liest —
  Angebote etwa. Geschrieben wurde in B nichts, gelesen zu viel.

  JETZT GILT DER ZULETZT BEGONNENE EINBLICK. Seit B4 beginnt jeder Einblick
  mit einem Eintrag in `support_zugriffe`. Lesen, schreiben und die Rolle
  gelten nur für die Freigabe, zu der der jüngste Eintrag dieses
  Plattformkontos gehört (unter den noch gültigen). Wer von A nach B
  wechselt, ist in B — und A ist zu, bis er dort wieder beginnt. Eine Rolle
  aus A kann in B nichts mehr öffnen, weil in B nicht A gilt.

  Die App tut das ohnehin so: „Öffnen" beginnt mit einem Eintrag, und das
  Wiederherstellen nach dem Neuladen beginnt jetzt ebenso neu.
*/

create index if not exists support_zugriffe_konto_zeit
  on public.support_zugriffe (admin_uid, wann desc);

-- Die Freigabe des jüngsten Einblicks dieses Plattformkontos — oder keine.
create or replace function app.einblick_aktuell() returns uuid
  language sql stable
  security definer
  set search_path = ''
as $$
  select z.freigabe_id
    from public.support_zugriffe z
    join public.support_freigaben f on f.id = z.freigabe_id
   where z.admin_uid = auth.uid()
     and f.widerrufen_am is null
     and f.gilt_bis > now()
   order by z.wann desc
   limit 1
$$;

-- Nur die drei Definer-Funktionen unten fragen sie, mit Eigentümerrechten.
revoke all on function app.einblick_aktuell() from public, anon, authenticated;

create or replace function app.support_liest(betrieb text) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.ist_plattform() and exists (
    select 1 from public.support_freigaben f
     where f.id = app.einblick_aktuell()
       and f.company_id = betrieb)
$$;

create or replace function app.support_schreibt(betrieb text) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.ist_plattform() and exists (
    select 1 from public.support_freigaben f
     where f.id = app.einblick_aktuell()
       and f.company_id = betrieb
       and f.stufe = 'mitarbeiten')
$$;

create or replace function app.support_arbeitet() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.ist_plattform() and exists (
    select 1 from public.support_freigaben f
     where f.id = app.einblick_aktuell()
       and f.stufe = 'mitarbeiten')
$$;
