/*
  „WARTUNG ERLEDIGT“ OHNE BAUSTELLE HAT KEINE BAUSTELLE
  (Durchsicht 15.11.2026, A13 / Befund B14).

  WAS DIE DURCHSICHT FAND. „Erledigt“ ohne Baustelle schrieb die Baustelle
  der VORIGEN Wartung als Bezug der neuen Ausführung: die App ließ
  `letzte_baustelle` beim leeren Feld einfach weg, die Spalte behielt den
  alten Wert, und `app.wartung_ausfuehrung_festhalten` übernahm ihn in die
  neue Ausführung. Folge: die Wartung von 2026 stand im Verlauf auf der
  Baustelle von 2025, und `app.wartung_durchgaenge` zählte dort einen
  zweiten Durchgang — eine zweite Wartungsrechnung auf der alten (oft
  abgeschlossenen) Baustelle ging durch. Dasselbe beim Ändern von
  „zuletzt gewartet“ im Formular ohne „berichtigen“.

  WAS JETZT GILT.
  1. `public.wartung_erledigt_eintragen` trägt die Ausführung mit genau der
     angegebenen Baustelle ein — leer heißt ohne Baustelle. Auch dieselbe
     Baustelle wie im Vorjahr geht (eine Baustelle, auf der jedes Jahr
     gewartet wird, M01e): dort ist sie ausdrücklich angegeben.
  2. Für jeden anderen Weg (die alte App, das Formular): ein neuer Tag ohne
     neue Baustelle hat keine Baustelle (`wartungen_bezug_mit_tag`). Eine
     Ausnahme: derselbe Schreibvorgang leert die eingeplante Baustelle und
     sie ist die bisherige — das ist „Erledigt“ der alten App auf der
     eingeplanten Baustelle, der Bezug stimmt.
  3. `wartung_tag_berichtigen` ersetzt den Tag derselben Ausführung — deren
     Baustelle bleibt (Merker `app.wartung_bezug`, wie `app.annahme_zurueck`).

  ALTDATEN. Schon geschriebene Ausführungen bleiben, wie sie sind: ob eine
  davon ihre Baustelle nur geerbt hat, sieht man ihr nicht an.
*/

create or replace function app.wartung_bezug_mit_tag() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_dienst() or coalesce(current_setting('app.wartung_bezug', true), '') = 'ja' then
    return new;
  end if;
  if new.zuletzt_am is distinct from old.zuletzt_am
     and new.letzte_baustelle is not distinct from old.letzte_baustelle
     and not (old.offene_baustelle is not null and new.offene_baustelle is null
              and nullif(app.baustelle_wie_js(old.offene_baustelle), '') = app.baustelle_wie_js(old.letzte_baustelle)) then
    new.letzte_baustelle := null;
  end if;
  return new;
end;
$$;

revoke all on function app.wartung_bezug_mit_tag() from public, anon, authenticated;

drop trigger if exists wartungen_bezug_mit_tag on public.wartungen;
create trigger wartungen_bezug_mit_tag
  before update on public.wartungen
  for each row execute function app.wartung_bezug_mit_tag();

create or replace function public.wartung_erledigt_eintragen(
  p_wartung uuid, p_am date, p_faellig date, p_intervall integer, p_baustelle text
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  w public.wartungen;
begin
  if p_am is null or p_faellig is null then
    raise exception 'Bitte den Tag der Wartung angeben' using errcode = '22023';
  end if;
  if p_intervall is null or p_intervall < 1 then
    raise exception 'Das Intervall muss mindestens einen Monat betragen' using errcode = '22023';
  end if;
  select * into w from public.wartungen x
   where x.id = p_wartung
     and (x.company_id = (select app.lesebetrieb()) or x.company_id = (select app.supportbetrieb()))
   for update;
  if w.id is null then
    raise exception 'Diese Wartung gibt es nicht' using errcode = 'P0002';
  end if;
  if not app.ist_fuehrung() then
    raise exception 'Wartungen ändern nur Projektleitung, Geschäftsführung und Administration' using errcode = '42501';
  end if;
  perform set_config('app.wartung_bezug', 'ja', true);
  -- Die eingeplante Baustelle ist mit dem Eintrag gewesen: sie wird im selben Schritt geleert.
  update public.wartungen
     set zuletzt_am = p_am,
         faellig_am = p_faellig,
         intervall_monate = p_intervall,
         letzte_baustelle = nullif(btrim(coalesce(p_baustelle, '')), ''),
         offene_baustelle = null
   where id = w.id;
  perform set_config('app.wartung_bezug', '', true);
end;
$$;

revoke all on function public.wartung_erledigt_eintragen(uuid, date, date, integer, text) from public, anon;
grant execute on function public.wartung_erledigt_eintragen(uuid, date, date, integer, text) to authenticated;

-- Unverändert bis auf den Merker: berichtigt wird derselbe Durchgang, seine Baustelle bleibt.
create or replace function public.wartung_tag_berichtigen(p_wartung uuid, p_am date)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  w public.wartungen;
  baustelle_alt text;
begin
  if p_am is null then
    raise exception 'Bitte den richtigen Tag angeben' using errcode = '22023';
  end if;
  select * into w from public.wartungen x
   where x.id = p_wartung
     and (x.company_id = (select app.lesebetrieb()) or x.company_id = (select app.supportbetrieb()))
   for update;
  if w.id is null then
    raise exception 'Diese Wartung gibt es nicht' using errcode = 'P0002';
  end if;
  if not app.ist_fuehrung() then
    raise exception 'Wartungen ändern nur Projektleitung, Geschäftsführung und Administration' using errcode = '42501';
  end if;
  perform set_config('app.wartung_bezug', 'ja', true);
  if w.zuletzt_am is null or w.zuletzt_am = p_am then
    -- Nichts zu berichtigen: ein Tag ohne Vorgänger ist ein neuer Eintrag.
    update public.wartungen set zuletzt_am = p_am where id = w.id;
    perform set_config('app.wartung_bezug', '', true);
    return;
  end if;

  delete from public.wartung_ausfuehrungen a
   where a.wartung_id = w.id and a.am = w.zuletzt_am
  returning a.baustelle into baustelle_alt;

  update public.wartungen set zuletzt_am = p_am where id = w.id;
  perform set_config('app.wartung_bezug', '', true);

  if baustelle_alt is not null then
    update public.wartung_ausfuehrungen a set baustelle = coalesce(a.baustelle, baustelle_alt)
     where a.wartung_id = w.id and a.am = p_am;
  end if;
end;
$$;

revoke all on function public.wartung_tag_berichtigen(uuid, date) from public, anon;
grant execute on function public.wartung_tag_berichtigen(uuid, date) to authenticated;
