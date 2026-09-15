-- Wie ein Betrieb mit nicht verbrauchtem Urlaub zum Jahreswechsel umgeht.
--
-- WAS OHNE DIESE EINSTELLUNG PASSIERTE. Der Resturlaub sprang am 1. Jänner
-- auf den vollen Jahresanspruch zurück; was übrig war, verschwand. In
-- Österreich verfällt nicht verbrauchter Urlaub aber nicht am Jahresende — er
-- verjährt erst zwei Jahre nach dem Jahr, in dem er entstanden ist
-- (§ 4 Abs 5 UrlG). Ein Betrieb, der der App glaubte, verkürzte seinen Leuten
-- den Anspruch, und zwar jedes Jahr aufs Neue.
--
-- WARUM ES EINE EINSTELLUNG IST UND KEINE FESTE REGEL. Viele Betriebe
-- vereinbaren einen Stichtag, bis zu dem der Vorjahresurlaub verbraucht sein
-- soll. Ob dieser Stichtag im Einzelfall trägt, entscheidet nicht die
-- Software — aber sie muss zeigen können, womit der Betrieb rechnet. Die
-- Alternative wäre, eine der beiden Lesarten allen aufzuzwingen.
--
-- DIE VORGABE IST DAS GESETZ, NICHT DAS BISHERIGE VERHALTEN. `verjaehrung`
-- gilt für jeden Betrieb, der nichts einstellt. Hätte die Vorgabe „kein
-- Übertrag" geheissen, wäre der Fehler als Einstellung konserviert worden —
-- und niemand hätte je gemerkt, dass er eine ist.
alter table companies
  add column if not exists urlaub_uebertrag text not null default 'verjaehrung',
  add column if not exists urlaub_stichtag text;

-- Nur die zwei Lesarten, die es gibt. Ein Tippfehler in der Oberfläche würde
-- sonst still zu „keine der beiden" und damit zu einer dritten Rechnung
-- führen, die niemand entworfen hat.
alter table companies drop constraint if exists companies_urlaub_uebertrag_check;
alter table companies add constraint companies_urlaub_uebertrag_check
  check (urlaub_uebertrag in ('verjaehrung', 'stichtag'));

/*
  DER STICHTAG IST 'MM-DD' UND KEIN DATUM.

  Er wiederholt sich jedes Jahr; ein `date` müsste ein Jahr mittragen, das
  nichts bedeutet, und beim Jahreswechsel würde jemand vergessen, es
  weiterzudrehen.

  ZWEI DINGE, DIE ICH BEIM AUSPROBIEREN GEGEN DIE ERSTE FASSUNG GEFUNDEN HABE:

  1. `case` STATT `a and b or c and d`. Die erste Fassung liess `stichtag`
     OHNE Datum durch. Der Grund ist die dreiwertige Logik von SQL: bei
     `urlaub_stichtag is null` ergibt `null ~ '...'` nicht `false`, sondern
     `null` — und eine Prüfbedingung, die `null` ergibt, GILT ALS ERFÜLLT.
     Eine Regel ohne Zeitpunkt wäre stillschweigend zu „verfällt nie"
     geworden. `is not null` liefert immer wahr oder falsch, nie `null`.

  2. TAGE JE MONAT, nicht 01–31 für alle. `'02-31'` ging durch und wäre ein
     Stichtag, der nie eintritt — derselbe stille Ausfall. Der 29. Februar
     steht bewusst nicht drin: er gibt es nur jedes vierte Jahr, und ein
     Verfallstag, der in drei von vier Jahren fehlt, ist keine Regel.
*/
alter table companies drop constraint if exists companies_urlaub_stichtag_check;
alter table companies add constraint companies_urlaub_stichtag_check
  check (
    case urlaub_uebertrag
      when 'stichtag' then
        urlaub_stichtag is not null
        and (
          urlaub_stichtag ~ '^(0[13578]|1[02])-(0[1-9]|[12][0-9]|3[01])$'  -- 31 Tage
          or urlaub_stichtag ~ '^(0[469]|11)-(0[1-9]|[12][0-9]|30)$'       -- 30 Tage
          or urlaub_stichtag ~ '^02-(0[1-9]|1[0-9]|2[0-8])$'               -- Februar
        )
      else urlaub_stichtag is null
    end
  );

comment on column companies.urlaub_uebertrag is
  'verjaehrung = § 4 Abs 5 UrlG (zwei Jahre), stichtag = vereinbarter Verfallstag.';
comment on column companies.urlaub_stichtag is
  'MM-DD, nur bei urlaub_uebertrag = ''stichtag''.';
