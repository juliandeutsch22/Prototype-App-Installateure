/*
  OFFENE POSTEN — WAS IM MENUE EIN ABZEICHEN BEKOMMT.

  Die Navigation sagte bisher, WO etwas liegt, aber nie, DASS dort etwas
  liegt. Wer entscheidet, ob ein Urlaubsantrag wartet, musste den Reiter
  oeffnen; wer es nicht tat, erfuhr es nicht. Genau daran bleibt in kleinen
  Betrieben liegen, was keinen Ort hat, an dem es sich meldet.

  DREI ZAHLEN UND NICHT MEHR. Aufgenommen ist nur, was drei Bedingungen
  zugleich erfuellt:

    1. Es ist normalerweise NULL. Eine Zahl, die immer leuchtet, ist keine
       Meldung mehr, sondern Tapete — und nimmt den anderen die Wirkung mit.
    2. Jeder Eintrag ist eine ENTSCHEIDUNG, nicht ein Zustand. „Nicht
       eingetragene Zeiten" steht deshalb nicht hier: die stehen am
       Monatsende immer offen, und niemand kann sie „erledigen".
    3. Sie hat einen klaren BESITZER. Wer sie nicht entscheiden darf, bekommt
       sie gar nicht erst gezaehlt — sonst zeigte das Menue dem Monteur eine
       Zahl, an der er nichts tun kann.

  EINE ABFRAGE UND NICHT DREI. Die Zahlen werden bei jedem Seitenwechsel
  geholt; als drei Abfragen waeren das drei Umlaeufe je Klick, auf dem
  Baustellen-Telefon ueber Mobilfunk. Als eine Zeile ist es einer.

  DIE ROLLENGRENZE STEHT ZWEIMAL, und das ist Absicht: hier als `case`, und
  darunter im Zeilenschutz der Tabellen. Faellt eine der beiden aus, haelt die
  andere — und die Zahl ist genau das, was sie behauptet.
*/

-- ---------------------------------------------------------------------------
-- Wer entscheidet, muss auch lesen duerfen
-- ---------------------------------------------------------------------------

/*
  DIE LUECKE, DIE ERST DAS ABZEICHEN SICHTBAR GEMACHT HAT.

  Seit dem 13.09. legt der Betrieb selbst fest, wer Urlaub genehmigt — in dem
  einen ist das die Buchhaltung, im anderen ein Vorarbeiter, im dritten eine
  Buerokraft. `app.darf_urlaub_entscheiden` bildet das ab und laesst genau
  diese Menschen entscheiden.

  GELESEN werden durften die Antraege dabei weiter nur von Leitung und
  Buchhaltung. Ein eingetragener Vorarbeiter bekam also das Recht zu
  entscheiden und eine LEERE Liste dazu — die Ansicht zeigte ihm den
  Abschnitt „Wartet auf Entscheidung" und darin nichts. Das faellt ohne
  Abzeichen nicht auf, weil eine leere Liste auch heisst „gerade nichts da".
  Mit Abzeichen waere es eine Luege: null, wo drei warten.

  Deshalb liest jetzt, wer entscheidet. Das ist keine Ausweitung, sondern das
  Nachziehen der Lesegrenze an eine Entscheidungsgrenze, die seit drei Tagen
  weiter ist. Ein Urlaubsantrag ist im Unterschied zum Krankenstand kein
  Gesundheitsdatum — die engere Grenze bei den Zeiteintraegen bleibt, wie sie
  ist.
*/
drop policy vacations_lesen on vacations;

create policy vacations_lesen on vacations
  for select using (app.darf(company_id)
    and (user_id = auth.uid() or app.ist_fuehrung() or app.ist_buch_oder_spitze()
         or app.darf_urlaub_entscheiden(company_id)));

-- ---------------------------------------------------------------------------
-- Wann eine Mahnung faellig ist
-- ---------------------------------------------------------------------------

/*
  DIESELBE REGEL WIE IN `features/invoices/mahnung.ts:darfMahnen`, und sie
  MUSS dieselbe sein: das Abzeichen zaehlt, was der Mahnlauf auflistet. Zaehlt
  es anderes, steht im Menue eine Drei und in der Liste stehen zwei Zeilen —
  und dann glaubt niemand mehr der Zahl.

  DIE LAUFENDE FRIST ZAEHLT MIT, und das ist eine Korrektur. Bisher pruefte
  nur das urspruengliche Zahlungsziel. Wer gestern eine Zahlungserinnerung mit
  einer Frist von einer Woche verschickt hat, bekam die Rechnung heute wieder
  im Mahnlauf angeboten — fuer Stufe 2, sechs Tage vor Ablauf der Frist, die
  er selbst gesetzt hat. Am Bildschirm sah das aus wie Arbeit; in Wirklichkeit
  war es eine Aufforderung, dem Kunden die zugesagte Frist zu nehmen.

  Ohne diese Korrektur waere das Abzeichen dauerhaft an: JEDE unbezahlte
  ueberfaellige Rechnung stuende bis zur dritten Mahnung jeden Tag darin. Genau
  das ist die Tapete, gegen die oben Punkt 1 steht.

  DER RUECKFALL, wenn weder Frist noch Mahndatum hinterlegt sind — ein
  Altbestand oder ein halb geschriebener Datensatz: dann gilt wieder das
  urspruengliche Zahlungsziel, die Rechnung ist also faellig. Die andere Wahl
  waere „nicht faellig", und die versteckte eine offene Forderung fuer immer.
  Die sieben Tage sind `FRIST_TAGE` aus `features/invoices/mahnung.ts`;
  `tests/unit/mahnfrist.test.ts` haelt beide Zahlen aneinander.
*/
create or replace function app.mahnung_faellig(
  p_status text, p_faellig date, p_stufe integer,
  p_gemahnt date, p_frist date, p_heute date
) returns boolean
  language sql immutable
  set search_path = ''
as $$
  select p_status is distinct from 'Bezahlt'
     and p_status is distinct from 'Storniert'
     and p_faellig is not null
     and p_faellig < p_heute
     and coalesce(p_stufe, 0) < 3
     and (coalesce(p_stufe, 0) = 0
          or coalesce(p_frist, p_gemahnt + 7, p_faellig) < p_heute)
$$;

-- ---------------------------------------------------------------------------
-- Die drei Zahlen
-- ---------------------------------------------------------------------------

/*
  `p_heute` KOMMT VOM BROWSER und nicht aus `current_date`.

  Die Datenbank rechnet in UTC, gearbeitet wird in Oesterreich — im Sommer
  zwei Stunden davor. Zwischen 22:00 und 24:00 waere `current_date` ein
  anderer Tag als der im Kalender des Monteurs, und eine Rechnung waere im
  Menue schon faellig und in der Liste noch nicht. Der Mahnlauf nimmt aus
  demselben Grund `todayStr()` als Uebergabewert; beide bekommen damit
  denselben Tag, statt zufaellig denselben zu treffen.
*/
create or replace function public.offene_posten(p_heute date default current_date)
  returns table (urlaub bigint, anforderungen bigint, mahnungen bigint)
  language sql stable
  set search_path = ''
as $$
  select
    case when app.darf_urlaub_entscheiden(app.betrieb())
      then (select count(*) from public.vacations v
             where v.company_id = app.betrieb()
               and v.status = 'Beantragt')
      else 0::bigint end,

    -- Wer Anforderungen abarbeitet: das Buero und die Leitung. Wortgleich zu
    -- `permissions.ts:canProcessOrders` und zur Rollenliste des Reiters.
    case when app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()
      then (select count(*) from public.material_orders m
             where m.company_id = app.betrieb()
               and m.status = 'Offen')
      else 0::bigint end,

    case when app.ist_buch_oder_spitze()
      then (select count(*) from public.invoices i
             where i.company_id = app.betrieb()
               -- Redundant zur Pruefung darunter (die Spalte laesst nur vier
               -- Werte zu), aber NICHT ueberfluessig: nur so greift der
               -- Teilindex `invoices_offen`, und aus einem Durchgang durch
               -- alle Rechnungen des Betriebs wird ein Indexzugriff.
               and i.payment_status in ('Offen', 'Überfällig')
               and app.mahnung_faellig(i.payment_status, i.due_date, i.mahnstufe,
                                       i.gemahnt_am, i.mahnfrist, p_heute))
      else 0::bigint end
$$;

/*
  KEIN `security definer`. Die Funktion laeuft mit den Rechten des Aufrufers,
  der Zeilenschutz der drei Tabellen greift also mit. Als `definer` haette sie
  ihn umgangen und die `case`-Zweige oben waeren die EINZIGE Grenze — ein
  Tippfehler darin haette dann fremde Zahlen ausgegeben.
*/
revoke all on function public.offene_posten(date) from public, anon;
grant execute on function public.offene_posten(date) to authenticated, service_role;
