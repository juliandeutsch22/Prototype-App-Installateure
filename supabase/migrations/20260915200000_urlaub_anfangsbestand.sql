-- Der Anfangsbestand an Urlaubstagen — was jemand mitbringt, wenn die App
-- in Betrieb geht.
--
-- WAS OHNE DIESE SPALTE PASSIERT. Der Resturlaub wird gerechnet als
-- „Jahresanspruch minus Urlaubstage, die IN DER APP stehen". Vor dem
-- Startdatum gibt es dort keine. Geht ein Betrieb im September in Betrieb und
-- Petra hat von ihren 25 Tagen schon 18 genommen, zeigt die App ihr
-- 25 Tage Resturlaub — und dieselbe Zahl sieht der Genehmigende, und dieselbe
-- Zahl steht in der Lohn-CSV der Buchhaltung.
--
-- Das ist keine fehlende Bequemlichkeit, sondern eine falsche Auskunft an
-- drei Stellen gleichzeitig. Beim Überstundensaldo war dieselbe Frage von
-- Anfang an beantwortet (`initial_overtime`); beim Urlaub wurde sie
-- übersehen.
--
-- WAS DER WERT BEDEUTET: wie viele Urlaubstage die Person AM Startdatum noch
-- zur Verfügung hat. Das ist die Zahl, die im Büro ohnehin auf der Liste
-- steht — niemand muss dafür rechnen.
--
-- WARUM NULL ERLAUBT BLEIBT und nicht auf den Jahresanspruch vorbelegt wird:
-- `null` heisst „nicht angegeben", und dann rechnet die App wie bisher. Ein
-- Vorbelegen hätte für jede bestehende Zeile eine Aussage erfunden, die
-- niemand getroffen hat — und für den Betrieb, der schon läuft, wäre es
-- zufällig richtig oder zufällig falsch. Die Ansicht sagt den Unterschied.
--
-- WARUM KEIN CHECK AUF >= 0. Ein negativer Wert ist fachlich möglich: wer im
-- Vorgriff mehr Urlaub genommen hat als ihm zusteht, bringt einen negativen
-- Bestand mit. Dieselbe Überlegung wie bei `initial_overtime`, das ebenfalls
-- negativ sein darf.
alter table users add column if not exists initial_vacation_days integer;

comment on column users.initial_vacation_days is
  'Resturlaub am app_start_date. NULL = nicht angegeben, dann gilt der volle Jahresanspruch.';
