/*
  EIN BETRIEBSURLAUB WIRD NICHT FÜR EINE PERSON ZURÜCKGENOMMEN
  (Rückmeldung vom 29.09.2026).

  `betriebsurlaub_anlegen` schreibt jeder betroffenen Person einen
  genehmigten Urlaub mit `betriebsurlaub_id`. Unter „Meine Anträge" stand er
  wie jeder genehmigte Antrag — mit „Zurücknehmen". `urlaub_entscheiden`
  nahm ihn auch zurück: die Tage verschwanden aus dem Zeitkonto, der
  Betriebsurlaub selbst blieb stehen. Der Wochenplan zeigte die Person
  weiter als „Betriebsurlaub", und beim Wiedereintritt würde er nicht
  nachgebucht, weil der stornierte Urlaub noch an ihm hängt. Zwei Stellen,
  zwei Wahrheiten.

  Wer während des Betriebsurlaubs arbeitet, wird beim Anlegen ausgenommen;
  wer es erst später weiss, löscht den Betriebsurlaub im Reiter
  „Betriebsurlaub" und legt ihn mit der Ausnahme neu an. Das Löschen
  (`betriebsurlaub_loeschen`) entfernt die Urlaube, statt ihren Stand zu
  ändern — es bleibt davon unberührt.

  EIN WÄCHTER AN DER TABELLE, nicht nur eine Zeile in `urlaub_entscheiden`:
  so gilt es für jeden Weg, der den Stand ändert. Andere Änderungen (etwa
  der Name nach einer Umbenennung) bleiben erlaubt.
*/

create or replace function app.betriebsurlaub_nicht_einzeln() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if old.betriebsurlaub_id is not null and new.status is distinct from old.status then
    raise exception 'Dieser Urlaub gehört zum Betriebsurlaub — geändert wird er im Reiter „Betriebsurlaub" (löschen und mit Ausnahme neu anlegen)'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists vacations_betriebsurlaub_nicht_einzeln on public.vacations;
create trigger vacations_betriebsurlaub_nicht_einzeln
  before update on public.vacations
  for each row execute function app.betriebsurlaub_nicht_einzeln();
