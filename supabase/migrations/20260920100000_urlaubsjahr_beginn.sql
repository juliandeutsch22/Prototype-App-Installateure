-- ---------------------------------------------------------------------------
-- Wann das Urlaubsjahr beginnt
-- ---------------------------------------------------------------------------
--
-- WAS OHNE DIESE EINSTELLUNG PASSIERTE, und es war ein stiller Fehler: der
-- neue Urlaubsanspruch entstand FEST am 1. Jänner. Nicht einstellbar, nirgends
-- erwähnt. Führt ein Betrieb sein Urlaubsjahr anders — etwa vom 1. Juli bis
-- zum 30. Juni —, kam der Anspruch damit ein halbes Jahr zu früh, und der
-- Übertrag wurde im falschen Moment gemessen. Auf dem Bildschirm stand eine
-- Zahl, die richtig aussah.
--
-- DIE VORGABE IST DAS KALENDERJAHR, weil es der häufigste Fall ist: der
-- Kollektivvertrag stellt das Urlaubsjahr in vielen Branchen darauf um. Für
-- jeden Betrieb, der nichts einstellt, ändert sich damit an keiner einzigen
-- Zahl und an keiner einzigen Beschriftung etwas.
--
-- WAS DIESE EINSTELLUNG NICHT KANN: das ARBEITSJAHR je Mitarbeiter, also den
-- Jahrestag des Eintritts (§ 2 Abs 2 UrlG, der gesetzliche Normalfall ohne
-- Umstellung durch Kollektivvertrag oder Betriebsvereinbarung). Dort hätte
-- jede Person ihren eigenen Stichtag, „das Jahr" bedeutete für jede etwas
-- anderes, und die Jahresauswertung der Buchhaltung verlöre ihren Sinn. Das
-- ist eine benannte Grenze und keine halbe Umsetzung: ein Betrieb, der so
-- fährt, kann diese Software für den Urlaub nicht verwenden.
alter table companies
  add column if not exists urlaub_jahresbeginn text not null default '01-01';

/*
  'MM-DD' UND KEIN DATUM — dieselbe Überlegung wie beim Verfallstag: der Tag
  wiederholt sich jedes Jahr, ein `date` müsste ein Jahr mittragen, das nichts
  bedeutet.

  Und dieselben zwei Fallen: Tage je Monat statt 01–31 für alle (sonst wäre
  '02-31' ein Jahresbeginn, der nie eintritt — und damit ein Urlaubsjahr, das
  nie anfängt), und der 29. Februar fehlt bewusst, weil es ihn nur jedes
  vierte Jahr gibt.

  `not null` mit Vorgabe: anders als beim Verfallstag gibt es hier keinen
  Zustand „nicht eingestellt". Jedes Urlaubsjahr beginnt irgendwann, und wer
  nichts sagt, meint den 1. Jänner.
*/
alter table companies drop constraint if exists companies_urlaub_jahresbeginn_check;
alter table companies add constraint companies_urlaub_jahresbeginn_check
  check (
    urlaub_jahresbeginn ~ '^(0[13578]|1[02])-(0[1-9]|[12][0-9]|3[01])$'  -- 31 Tage
    or urlaub_jahresbeginn ~ '^(0[469]|11)-(0[1-9]|[12][0-9]|30)$'       -- 30 Tage
    or urlaub_jahresbeginn ~ '^02-(0[1-9]|1[0-9]|2[0-8])$'               -- Februar
  );

comment on column companies.urlaub_jahresbeginn is
  'MM-DD. Tag, an dem das Urlaubsjahr beginnt und der neue Anspruch entsteht. '
  'Vorgabe 01-01 (Kalenderjahr). Das Arbeitsjahr je Mitarbeiter bildet die App nicht ab.';
