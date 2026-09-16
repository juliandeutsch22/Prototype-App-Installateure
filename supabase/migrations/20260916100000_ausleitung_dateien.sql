-- Die DATEIEN gehen mit — bisher ging nur der Bestand in Zeilen.
--
-- WAS GEFEHLT HAT. Die Ausleitung schreibt jede Tabelle des Betriebs in eine
-- Datei und legt sie ausser Haus. Die Fotos am Handwerksschein liegen aber
-- nicht in einer Tabelle, sondern im Speicher; die Zeile in
-- `work_sheet_photos` nennt nur ihren Pfad. Bei einem Wiederanlauf kaeme also
-- der Schein zurueck und seine Beweisfotos nicht — und genau die sind der
-- Grund, warum es den Schein gibt. Ein Kunde, der eine Leistung bestreitet,
-- laesst sich mit einem Verweis auf eine nicht mehr vorhandene Datei nicht
-- ueberzeugen.
--
-- WARUM NUR AUSSER HAUS. Der Eimer `ausleitung` liegt im SELBEN Projekt wie
-- `scheinfotos`. Die Bilder dorthin zu kopieren verdoppelte den Speicher und
-- schuetzte gegen nichts: faellt das Projekt aus, faellt beides aus. Die
-- Bilder gehen deshalb ausschliesslich an den Speicher ausserhalb — ist
-- keiner eingerichtet, geschieht hier gar nichts, und das ist eine benannte
-- Luecke und kein Fehler.

-- ---------------------------------------------------------------------------
-- Was schon draussen liegt
-- ---------------------------------------------------------------------------

/*
  WARUM DAS BUCHGEFUEHRT WIRD UND NICHT NACHGESEHEN.

  Das Dienstkonto im Zielspeicher darf ANLEGEN und sonst nichts — nicht lesen,
  nicht auflisten, nicht loeschen. Das ist der Sinn der ganzen Uebung: wer
  diesen Schluessel erbeutet, kann die Sicherung nicht vernichten. Der Preis
  dafuer steht hier: die Frage „liegt diese Datei schon draussen?" kann der
  Zielspeicher nicht beantworten. Also fuehrt die Datenbank Buch.

  DIESE TABELLE TRAEGT `company_id` UND GEHT DAMIT SELBST MIT in die
  Ausleitung. Das ist Absicht und nicht Zufall: nach einem Ruecklauf weiss der
  wiederhergestellte Betrieb, welche Dateien bereits draussen liegen, und
  faengt nicht an, sie ein zweites Mal hochzuladen — was der Zielspeicher
  ohnehin abwiese, weil er nicht ueberschreiben laesst.

  KEINE RICHTLINIE, also kein Zugang ausser mit dem Dienstschluessel. Es ist
  eine Liste von Pfaden, kein Geschaeftsdatum; sie gehoert in die Ausleitung,
  nicht in die Oberflaeche.
*/
create table ausleitung_dateien (
  company_id   text not null references companies (id),
  eimer        text not null,
  pfad         text not null,
  /*
    Der Hash der Bytes, die TATSAECHLICH hochgegangen sind — nicht der aus
    `work_sheet_photos`. Stimmten die beiden einmal nicht ueberein, waere das
    der einzige Ort, an dem es noch steht: die Zeile sagt, was der Schein
    zusichert, diese Spalte, was gesichert wurde.
  */
  hash         text not null,
  bytes        bigint not null,
  gesichert_am timestamptz not null default now(),
  primary key (company_id, eimer, pfad)
);

alter table ausleitung_dateien enable row level security;

-- ---------------------------------------------------------------------------
-- Welche Eimer ueberhaupt Betriebsdateien tragen
-- ---------------------------------------------------------------------------

/*
  JEDER EIMER MUSS HIER STEHEN — mit `true` oder mit `false`.

  Ein neuer Eimer, den niemand eintraegt, fiele sonst stillschweigend aus der
  Sicherung heraus, und bemerkt wuerde es am Tag des Wiederanlaufs. Deshalb
  steht hier eine vollstaendige Liste und keine Auswahl, und deshalb prueft
  `tests/supabase/ausleitungDateien.test.ts`, dass sie mit `storage.buckets`
  uebereinstimmt. Wer einen Eimer anlegt, ohne sich zu entscheiden, bekommt
  eine rote Pruefung statt einer lueckenhaften Sicherung.

  `ausleitung` steht mit `false` darin: das ist die Sicherung selbst. Sie
  ausser Haus zu legen ist bereits die Aufgabe der Function; sie ein zweites
  Mal als „Datei" mitzunehmen waere ein Kreis.
*/
create or replace function app.datei_eimer()
  returns table (eimer text, gesichert boolean)
  language sql immutable
  set search_path = ''
as $$
  select * from (values
    ('scheinfotos'::text, true),
    ('ausleitung'::text,  false)
  ) as t(eimer, gesichert)
$$;

/*
  ZU WELCHEM BETRIEB EINE DATEI GEHOERT.

  Ein Speicher kennt nur Namen, keine Spalten — der Mandant steht im Pfad. Fuer
  die Scheinfotos gibt es die Zerlegung schon: `app.foto_betrieb` ist dieselbe
  Funktion, an der auch die Leseregel des Eimers haengt. Sie hier
  wiederzuverwenden statt den Pfad ein zweites Mal zu zerlegen ist der Punkt:
  zwei Zerlegungen liefen auseinander, und dann sicherte die eine, was die
  andere niemandem zeigt.

  DIESE FUNKTION BEANTWORTET NUR EINE FRAGE — WEM gehoert die Datei. OB der
  Eimer in die Sicherung geht, steht in `app.datei_eimer()` und nirgends
  sonst. Deshalb kennt sie auch den Eimer `ausleitung`, obwohl der gerade
  NICHT mitgeht: haette sie hier eine Luecke, waere die Entscheidung
  stillschweigend doppelt getroffen, und eine falsche Aenderung an
  `datei_eimer` fiele niemandem auf, weil die zweite Sperre sie auffinge.
  Eine Sperre, die nie greift, ist keine Sicherung, sondern eine Behauptung.
*/
create or replace function app.datei_betrieb(p_eimer text, p_name text)
  returns text
  language sql stable
  set search_path = ''
as $$
  select case p_eimer
    when 'scheinfotos' then app.foto_betrieb(p_name)
    when 'ausleitung'  then case
      when (storage.foldername(p_name))[1] = 'ausleitung'
        then (storage.foldername(p_name))[2]
    end
  end
$$;

-- ---------------------------------------------------------------------------
-- Was noch hinaus muss
-- ---------------------------------------------------------------------------

/*
  DIE OFFENEN DATEIEN EINES BETRIEBS — aus dem SPEICHER, nicht aus den Zeilen.

  Gefragt wird `storage.objects` und nicht `work_sheet_photos`, und das ist
  eine Entscheidung: ginge die Liste ueber die Zeilen, fiele jede Datei heraus,
  deren Zeile fehlt — und genau die braeuchte man am dringendsten. Der Speicher
  ist hier die Wahrheit; eine Waise wird mitgesichert und kostet ein paar
  Kilobyte.

  UEBERSPRUNGEN WIRD NACH PFAD, nicht nach Hash, und das ist bei diesen Dateien
  sicher: der Dateiname IST der Inhalts-Hash (`fotoPfad(.., '<hash>.jpg')`).
  Derselbe Pfad kann also gar keinen anderen Inhalt tragen. Schriebe doch
  jemand andere Bytes unter denselben Namen, behielte die Sicherung die
  urspruenglichen — was bei einer Sicherung die richtige Seite des Irrtums ist.
*/
create or replace function app.offene_dateien(p_betrieb text)
  returns table (eimer text, pfad text, bytes bigint)
  language sql stable
  set search_path = ''
as $$
  select o.bucket_id::text, o.name::text,
         coalesce((o.metadata->>'size')::bigint, 0)
    from storage.objects o
    join app.datei_eimer() e on e.eimer = o.bucket_id and e.gesichert
   where o.name is not null
     and app.datei_betrieb(o.bucket_id, o.name) = p_betrieb
     and not exists (
       select 1 from public.ausleitung_dateien a
        where a.company_id = p_betrieb
          and a.eimer = o.bucket_id
          and a.pfad = o.name)
$$;

/*
  EINE HANDVOLL JE LAUF, nicht alles auf einmal.

  Eine Edge Function hat eine Wanduhr. Ein Betrieb, der die Sicherung erst
  heute einschaltet, hat womoeglich Jahre an Fotos liegen; der Versuch, sie in
  einem Zug hinauszuschieben, endet in einem Abbruch ohne verwertbare Meldung
  — und morgen wieder. Mit einer Obergrenze arbeitet sich der Rueckstand Nacht
  fuer Nacht ab, und `sicherungs_dateien_offen` sagt, wie weit es noch ist.

  SORTIERT, damit die Reihenfolge ueber die Laeufe hinweg dieselbe bleibt:
  sonst koennte ein Lauf immer wieder dieselben ersten Dateien greifen und der
  Rueckstand naehme nie ab.
*/
create or replace function public.sicherungs_dateien(p_betrieb text, p_grenze integer default 200)
  returns table (eimer text, pfad text, bytes bigint)
  language sql stable
  security definer
  set search_path = ''
as $$
  select d.eimer, d.pfad, d.bytes
    from app.offene_dateien(p_betrieb) d
   order by d.eimer, d.pfad
   limit greatest(coalesce(p_grenze, 0), 0)
$$;

/*
  WIE VIELE NOCH FEHLEN. Ohne diese Zahl saehe ein Lauf mit erreichter
  Obergrenze genauso aus wie einer, der fertig ist — und der Rueckstand bliebe
  unsichtbar, bis jemand ihn braucht.
*/
create or replace function public.sicherungs_dateien_offen(p_betrieb text)
  returns bigint
  language sql stable
  security definer
  set search_path = ''
as $$
  select count(*) from app.offene_dateien(p_betrieb)
$$;

revoke all on function public.sicherungs_dateien(text, integer) from public, anon, authenticated;
grant execute on function public.sicherungs_dateien(text, integer) to service_role;

revoke all on function public.sicherungs_dateien_offen(text) from public, anon, authenticated;
grant execute on function public.sicherungs_dateien_offen(text) to service_role;
