-- Der Eimer fuer die naechtliche Ausleitung.
--
-- OHNE EINE EINZIGE RICHTLINIE, und das ist keine Luecke, sondern der Punkt:
-- an `storage.objects` haengt der Zeilenschutz, und was keine Richtlinie
-- trifft, ist zu. Erreichbar ist der Eimer damit nur mit dem
-- Dienstschluessel, den allein die Edge Function hat.
--
-- WARUM NICHT LESBAR FUER DIE GESCHAEFTSFUEHRUNG. Ein Stand enthaelt den
-- ganzen Betrieb in einer Datei — Loehne, Kundenstamm, Preise. Wer ihn
-- braucht, holt ihn ueber den DSGVO-Auszug (`public.betrieb_auszug`), der
-- ausschliesslich den EIGENEN Betrieb liefert und die Rolle prueft. Ein
-- Leserecht auf den Eimer waere ein zweiter Weg an dieselben Daten, mit
-- eigener Regel und eigener Gelegenheit, sich zu vertun.
--
-- KEINE TYPGRENZE: geschrieben wird `.jsonl`, und Groesse ist hier kein
-- Schutz, sondern das Gegenteil — ein Betrieb mit Historie soll vollstaendig
-- hineinpassen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ausleitung', 'ausleitung', false, null, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/*
  DEN LAUF FESTHALTEN — aus der Edge Function heraus, mit dem
  Dienstschluessel.

  `system_laeufe` traegt bewusst keine Schreibrichtlinie: eine Ueberwachung,
  die der Ueberwachte beschreiben kann, ueberwacht nichts. Geschrieben wird
  deshalb ueber diese Funktion, und die ist nur dem Dienstschluessel
  zugaenglich.

  DER ERFOLGSZEITSTEMPEL WIRD NUR BEI ERFOLG GESETZT. Ein gescheiterter Lauf
  aktualisiert `zuletzt_versuch` und laesst `zuletzt_erfolg` stehen — sonst
  saehe eine Sicherung, die seit drei Wochen scheitert, taggleich frisch aus.
*/
create or replace function public.lauf_festhalten(
  p_betrieb text,
  p_art text,
  p_erfolg boolean,
  p_meldung text default null,
  p_kennzahl numeric default null,
  p_kennzahl_einheit text default null,
  p_ziel_extern boolean default false
) returns void
  language sql
  security definer
  set search_path = ''
as $$
  insert into public.system_laeufe as l
    (company_id, art, zuletzt_versuch, zuletzt_erfolg, erfolg, meldung,
     kennzahl, kennzahl_einheit, ziel_extern, updated_at)
  values
    (p_betrieb, p_art, now(), case when p_erfolg then now() end, p_erfolg,
     p_meldung, p_kennzahl, p_kennzahl_einheit, p_ziel_extern, now())
  on conflict (company_id, art) do update set
    zuletzt_versuch = now(),
    zuletzt_erfolg  = case when p_erfolg then now() else l.zuletzt_erfolg end,
    erfolg          = p_erfolg,
    meldung         = p_meldung,
    kennzahl        = coalesce(p_kennzahl, l.kennzahl),
    kennzahl_einheit = coalesce(p_kennzahl_einheit, l.kennzahl_einheit),
    ziel_extern     = p_ziel_extern,
    updated_at      = now()
$$;

revoke all on function public.lauf_festhalten(text, text, boolean, text, numeric, text, boolean)
  from public, anon, authenticated;
grant execute on function public.lauf_festhalten(text, text, boolean, text, numeric, text, boolean)
  to service_role;

/*
  DIE TABELLEN, DIE EIN BETRIEB AUSMACHT — fuer die Ausleitung erreichbar.

  Dieselbe Liste wie beim DSGVO-Auszug, und aus demselben Katalog: jede
  Tabelle mit einer Spalte `company_id`. Zwei Listen waeren hier derselbe
  Fehler wie zwei Implementierungen einer Formel — sie laufen auseinander, und
  bemerkt wuerde es an einem Wiederanlauf, bei dem die Haelfte fehlt.
*/
create or replace function public.auszug_tabellen() returns text[]
  language sql stable
  security definer
  set search_path = ''
as $$ select app.auszug_tabellen() $$;

revoke all on function public.auszug_tabellen() from public, anon, authenticated;
grant execute on function public.auszug_tabellen() to service_role;
