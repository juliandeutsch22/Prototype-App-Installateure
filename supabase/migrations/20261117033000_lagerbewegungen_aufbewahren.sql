/*
  DAS BEWEGUNGSPROTOKOLL DES LAGERS IN DER LÖSCHUNG EINER PERSON
  (Durchsicht 15.11.2026, Befund aus F14).

  NACHGESTELLT. `lagerbewegungen` trägt Kennung und Namen dessen, der eine
  Bewegung erfasst hat (`erfasst_von`, `erfasst_von_name`). Die Löschung
  einer Person (`person_loeschen`) lässt beides stehen — zu Recht: das
  Protokoll ist Buchhaltungsunterlage wie die Materialanforderungen, die sie
  schon unter „aufbewahren“ nennt. Gesagt hat sie es aber nicht: der
  Löschbericht verschwieg, dass ihr Name auf diesen Zeilen bleibt und bis
  wann. Die Datenauskunft zählt die Zeilen schon (`als_bearbeiter.
  lagerbewegungen_erfasst`) — dort ändert sich nichts.

  JETZT steht unter „aufbewahren“, wie viele Bewegungen die Person erfasst
  hat, bis wann sie aufbewahrt werden und warum: dieselbe Frist und derselbe
  Grund wie bei den Materialanforderungen (§ 132 BAO, sieben Jahre ab Ende
  des Kalenderjahrs). Gezielter Textersatz — die Funktion ändern auch
  andere Migrationen; fehlt die Stelle, bricht die Migration ab.
*/
do $migration$
declare
  quelle text;
  marke text;
  zahl integer;
begin
  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('Bewegungsprotokoll des Lagers' in quelle) = 0 then
    marke := $m$        -- M10/B09: Meldungen bleiben bei der Führung, bis sie sie als erledigt löscht.
$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenlöschung: Einfügestelle (Aufbewahren) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, $neu$        -- Ihr Name an den Bewegungen des Lagers — Buchhaltungsunterlage wie die Anforderungen.
        select jsonb_build_object('was', 'Bewegungsprotokoll des Lagers', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis((l.created_at at time zone 'Europe/Vienna')::date)),
                                  'grund', rechtsgrund)
          from public.lagerbewegungen l where l.company_id = betrieb and l.erfasst_von = p_id
        union all
$neu$ || marke);
    execute quelle;
  end if;
end;
$migration$;
