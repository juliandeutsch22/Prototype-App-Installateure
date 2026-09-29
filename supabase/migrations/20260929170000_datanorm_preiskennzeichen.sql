/*
  DAS PREISKENNZEICHEN NACH DER NORM (offene Punkte A3, Prüflauf P2-17).

  Der Leser nahm „0" als Listenpreis und „1" als Nettopreis. Die Norm sagt
  1 = Bruttopreis (Listenpreis), 2 = Nettopreis — und „1" ist der Normalfall
  einer Grosshändlerdatei. Ein solcher Katalog kam also als NETTO herein, und
  die Übernahme schrieb den Listenpreis als Einkaufspreis in den Stamm. Die
  Nachkalkulation rechnete danach jede Baustelle zu teuer.

  Der Leser ist korrigiert (`src/features/materials/datanorm.ts`). Diese
  Migration räumt auf, was er bis dahin hinterlassen hat:

  1. DIE PREISGESCHICHTE (`material_prices`). Die Zeilen eines Laufs löscht
     die Übernahme; was bleibt, ist der Preiseintrag je Artikel und
     Grosshändler. Ein „netto"-Eintrag — also in der Datei eine 1 — trägt
     einen Einkaufspreis und keinen Listenpreis. Nur solche Einträge aus
     übernommenen Katalogläufen werden angefasst: der Preis wird Listenpreis,
     der Einkauf so gerechnet, wie es die Übernahme mit einem Listenpreis tut
     — abzüglich des Rabattsatzes der Gruppe; ohne Satz bleibt er leer.

  2. DER EINKAUFSPREIS AM ARTIKEL, wenn er genau aus einem solchen Eintrag
     stammt: der jüngste Preiseintrag des Artikels ist einer davon, und der
     Einkaufspreis steht noch unverändert da. Eine leere Zahl meldet die
     Nachkalkulation als Lücke — ein Listenpreis als Einkauf sähe aus wie
     eine Auskunft und wäre falsch. Wer ihn seither von Hand geändert hat,
     behält ihn.

  3. DIE ZEILEN NOCH OFFENER PROBELÄUFE bekommen ihre richtige Art: „netto"
     war eine 1, also Liste; „liste" war eine 0, die die Norm nicht kennt,
     also unbekannt. Übernommen wird dann, was der korrigierte Leser gelesen
     hätte.

  Nicht angefasst: Einkaufspreise aus einer „0". Sie wurden als Listenpreis
  mit Rabatt gerechnet; was die Datei damit meinte, weiss niemand.
*/

create temp table datanorm_kennzeichen_alt on commit drop as
select mp.id, mp.material_id, mp.einkaufspreis as preis, r.prozent,
       case when r.prozent is null then null
            else round(mp.einkaufspreis * (1 - r.prozent / 100), 4) end as einkauf
  from public.material_prices mp
  left join public.rabattsaetze r
    on r.supplier_id = mp.supplier_id and r.gruppe = coalesce(mp.rabattgruppe, '')
 where mp.listenpreis is null
   and mp.einkaufspreis is not null
   and exists (
     select 1 from public.datanorm_laeufe l
      where l.supplier_id = mp.supplier_id
        and l.status = 'uebernommen'
        and mp.gueltig_ab between l.created_at::date and l.abgeschlossen_am::date
   );

update public.material_einkaufspreise e
   set einkaufspreis = a.einkauf
  from datanorm_kennzeichen_alt a
 where e.material_id = a.material_id
   and e.einkaufspreis = a.preis
   and a.id = (select mp.id from public.material_prices mp
                where mp.material_id = a.material_id
                order by mp.gueltig_ab desc, mp.updated_at desc
                limit 1);

update public.material_prices mp
   set listenpreis = a.preis,
       rabatt_prozent = a.prozent,
       einkaufspreis = a.einkauf
  from datanorm_kennzeichen_alt a
 where mp.id = a.id;

update public.datanorm_zeilen
   set preis_art = case preis_art when 'netto' then 'liste' else 'unbekannt' end
 where preis_art in ('netto', 'liste');
