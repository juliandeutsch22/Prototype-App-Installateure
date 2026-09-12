-- Firmeneinstellungen, persoenliche Einstellungen, Nachtlauf-Protokoll.

-- ---------------------------------------------------------------------------
-- Ein Name fuer eine Sache
-- ---------------------------------------------------------------------------

/*
  `ausser_haus` HIESS IN DER APP SCHON IMMER `zielExtern`.

  Die Umrechnung zwischen App und Datenbank ist mechanisch — aus
  `zielExtern` wird `ziel_extern` und zurueck. Eine Spalte, die anders heisst,
  faellt dabei heraus: sie kaeme als `ausserHaus` in der App an, wo niemand
  danach fragt, und `zielExtern` waere still leer.

  Das ist genau die Art Fehler, die keine Meldung erzeugt: die Ansicht zeigt
  dann nichts ueber den Ablageort der Sicherung an, und „nichts behauptet"
  sieht aus wie „in Ordnung". Also bekommt die Spalte den Namen, den die
  Sache schon hat.
*/
alter table system_laeufe rename column ausser_haus to ziel_extern;

-- ---------------------------------------------------------------------------
-- Push-Marken je Geraet
-- ---------------------------------------------------------------------------

/*
  LESEN-AENDERN-SCHREIBEN GEHT HIER NICHT.

  Ein Mensch hat Telefon und Rechner. Meldet er sich auf beiden kurz
  nacheinander an, laesen zwei Aufrufe denselben Stand und schrieben ihre
  jeweils eine Marke zurueck — die zuerst geschriebene waere weg, und genau
  das Geraet bekaeme keine Meldungen mehr. In Firestore hat `arrayUnion` das
  verhindert; hier tut es `array_append` in EINER Anweisung.

  Angelegt wird die Zeile dabei mit, falls es sie noch nicht gibt: die
  Einstellungen entstehen beim ersten Anmelden eines Geraets, nicht vorher.
*/
create or replace function public.push_marke_setzen(
  p_token text,
  p_an boolean
) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if coalesce(p_token, '') = '' then
    raise exception 'Ohne Marke kein Geraet' using errcode = '22023';
  end if;

  insert into public.user_prefs (user_id, company_id, push_tokens)
       values (auth.uid(), betrieb,
               case when p_an then array[p_token] else '{}'::text[] end)
  on conflict (user_id) do update
     set push_tokens = case
           when p_an then
             -- Zweimal dasselbe Geraet ist immer noch ein Geraet.
             case when p_token = any(public.user_prefs.push_tokens)
                  then public.user_prefs.push_tokens
                  else array_append(public.user_prefs.push_tokens, p_token) end
           else array_remove(public.user_prefs.push_tokens, p_token)
         end,
         updated_at = now();
end;
$$;

revoke all on function public.push_marke_setzen(text, boolean) from public;
grant execute on function public.push_marke_setzen(text, boolean) to authenticated;
