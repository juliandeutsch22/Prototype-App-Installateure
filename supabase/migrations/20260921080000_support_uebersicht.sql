-- DAS PROTOKOLL WIRD GEZÄHLT, NICHT AUFGEZÄHLT.
--
-- GEMELDET AUS DEM ERSTEN ECHTEN BLICK AUF DIE ANSICHT: eine Supportsitzung
-- von zwei Minuten hinterliess vierzehn Zeilen — „Baustellen 20:58",
-- „Rechnungen 20:58", „Baustellen 20:58" … Jeder Klick eine Zeile. Nach
-- einem halben Jahr Support steht dort eine Liste, die niemand mehr liest,
-- und eine Liste, die niemand liest, ist keine Kontrolle, sondern Zierrat.
--
-- WEG KANN SIE TROTZDEM NICHT. Sie ist das Einzige, woran ein Betrieb im
-- Nachhinein feststellen kann, was tatsächlich angesehen wurde — die Zusage
-- „jeder geöffnete Bereich steht in Ihrem Protokoll" ist ohne sie leer. Die
-- Zeilen bleiben also stehen; was sich ändert, ist die Frage, die an sie
-- gestellt wird.
--
-- STATT „WELCHE KLICKS" JETZT „WAS WURDE IN DIESEM ZUGANG ANGESEHEN": je
-- Freigabe und Bereich eine Zahl und der letzte Zeitpunkt. Aus vierzehn
-- Zeilen werden vier, und sie sagen mehr: „Rechnungen 3× · zuletzt 20:58"
-- beantwortet die Frage des Betriebs, „Rechnungen 20:58" dreimal
-- untereinander beantwortet sie nicht.
--
-- WARUM IN DER DATENBANK UND NICHT IM BROWSER. Im Browser hiesse zählen:
-- erst alle Zeilen holen. Das ist genau die Liste, die nach einem Jahr zu
-- lang ist — und sie würde still bei der Lesegrenze abschneiden, womit die
-- Zahlen falsch wären, ohne dass es jemand sieht. Die Datenbank zählt alle.
--
-- `security invoker`: die Funktion sieht genau so viel wie der Aufrufer. Der
-- Zeilenschutz auf `support_zugriffe` bleibt in Kraft — ein Betrieb bekommt
-- die Zahlen seines eigenen Zugangs und keine fremden. Eine
-- `security definer`-Funktion müsste den Betrieb selbst prüfen und wäre eine
-- zweite Wahrheit über dieselbe Frage.
create or replace function public.support_bereiche(p_company text)
returns table (
  freigabe_id uuid,
  bereich     text,
  anzahl      integer,
  zuletzt     timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select z.freigabe_id, z.bereich, count(*)::integer, max(z.wann)
  from public.support_zugriffe z
  where z.company_id = p_company
  group by z.freigabe_id, z.bereich
  order by max(z.wann) desc
$$;

comment on function public.support_bereiche(text) is
  'Je Freigabe und Bereich: wie oft geöffnet und wann zuletzt. Ersetzt die Aufzählung einzelner Zugriffe in der Ansicht; die Zeilen selbst bleiben unverändert stehen.';
