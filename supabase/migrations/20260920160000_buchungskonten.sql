/*
  Der Kontenrahmen des Betriebs.

  WARUM DAS IN DIE EINSTELLUNGEN GEHOERT UND NICHT IN DEN CODE. Welches
  Erloeskonto ein Betrieb bebucht, steht in keinem Gesetz — es steht im
  Kontenplan seiner Kanzlei. Der oesterreichische Einheitskontenrahmen ist ein
  VORSCHLAG, kein Zwang: der eine fuehrt 4000 fuer 20 %, der naechste 4020,
  ein dritter trennt nach Sparten. Eine fest eingebaute Zahl waere eine
  Buchhaltungsauskunft, die diese Software nicht geben kann — und sie faellt
  frUehestens beim Jahresabschluss auf.

  Gepflegt wird der Rahmen deshalb vom Betrieb selbst: Administrator,
  Geschaeftsfuehrung und Buchhaltung. Die Buchhaltung ist hier ausdruecklich
  dabei, obwohl sie sonst keine Betriebseinstellungen aendert — sie ist die
  Rolle, die mit der Kanzlei spricht.

  EINE ZEILE JE ZWECK, nicht eine Spalte je Zweck. Die Steuersaetze sind
  nicht abzaehlbar: 20 %, 13 %, 10 %, 0 % heute, und eine Aenderung des
  Steuersatzes ist eine Frage der Politik, nicht des Schemas. Als Spalten
  waere jeder neue Satz eine Wanderung.
*/

create table if not exists buchungskonten (
  id         uuid primary key default gen_random_uuid(),
  company_id text not null references companies (id),
  /*
    Wofuer diese Zeile gilt:
      erloes         — Erloeskonto fuer EINEN Steuersatz
      reverse_charge — Bauleistung mit Uebergang der Steuerschuld
                       (§ 19 Abs 1a UStG); getrennt, weil das ein anderer
                       Umsatz ist als „0 %" und in der UVA anders steht
      anzahlung      — erhaltene Anzahlungen; das ist eine VERBINDLICHKEIT
                       und kein Erloes, solange die Leistung aussteht
      debitoren      — Sammelkonto der Forderungen aus Lieferung und Leistung
  */
  zweck      text not null check (zweck in ('erloes', 'reverse_charge', 'anzahlung', 'debitoren')),
  /* Nur beim Erloeskonto gesetzt: der Steuersatz als Anteil (0.2000 = 20 %). */
  ust_satz   numeric(5,4) check (ust_satz is null or (ust_satz >= 0 and ust_satz < 1)),
  konto      text not null check (btrim(konto) <> ''),
  /*
    Der Steuercode der Kanzlei — bei BMD etwa M20 oder M00. Er sagt der
    Buchhaltung, welche Steuer auf diese Zeile gehoert; ohne ihn muss sie
    beim Import jede Zeile von Hand zuordnen.
  */
  steuercode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Der Steuersatz gehoert zum Erloeskonto und sonst nirgendwohin. Ein
  -- Debitorensammelkonto „fuer 20 %" waere ein Widerspruch in sich.
  constraint buchungskonten_satz_nur_bei_erloes
    check ((zweck = 'erloes') = (ust_satz is not null))
);

-- Je Zweck und Steuersatz genau ein Konto. Zwei Erloeskonten fuer 20 % sind
-- keine Auswahl, sondern eine offene Frage beim naechsten Export.
create unique index if not exists buchungskonten_je_zweck
  on buchungskonten (company_id, zweck, coalesce(ust_satz, -1));

alter table buchungskonten enable row level security;

/*
  LESEN DARF DER GANZE BETRIEB. Ein Kontenrahmen ist keine Margeninformation;
  er steht auf jedem Buchungsbeleg, den die Kanzlei zurueckschickt.
*/
create policy buchungskonten_lesen on buchungskonten
  for select using (app.darf(company_id));
create policy buchungskonten_schreiben on buchungskonten
  for all using (app.darf(company_id) and (app.ist_spitze() or app.hat_rolle(array['Buchhaltung'])))
  with check (app.darf(company_id) and (app.ist_spitze() or app.hat_rolle(array['Buchhaltung'])));

create trigger buchungskonten_updated_at before update on buchungskonten
  for each row execute function app.updated_at_setzen();
create trigger buchungskonten_betrieb_fest before update on buchungskonten
  for each row execute function app.betrieb_unveraenderlich();
