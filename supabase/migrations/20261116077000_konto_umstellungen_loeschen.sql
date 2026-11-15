-- K9 (Paket 8, 16.11.2026; Durchsicht N5): Kontoumstellungen gehen mit der Löschung einer Person.

/*
  WAS FEHLTE. `konto_umstellungen` (wer wann ein Konto zwischen E-Mail und
  Benutzername umgestellt hat, mit Grund) stand in der Datenauskunft — bei
  der Person unter `kontoumstellungen`, bei der Leitung als Anzahl
  `konten_umgestellt` —, wurde von `person_loeschen` aber weder gelöscht
  noch im Bericht genannt. Der Bericht war damit unvollständig, und die
  Zeilen blieben ohne Grund stehen.

  JETZT, wie beim Zurücksetzen des zweiten Faktors (K7):
    - die Umstellungen DES Kontos gehen sofort (sie sind kein Beleg und keine
      Arbeitszeitaufzeichnung);
    - wo die Person ein anderes Konto umgestellt hat, bleibt die Zeile über
      den anderen, aber ohne Namen und Kennung der gelöschten Person.
  Dafür darf `durch` leer sein (bisher Pflicht). Das ist mit der alten App
  verträglich: sie liest die Spalte nicht und schreibt sie nie selbst
  (geschrieben wird nur in `konto_umstellen_festhalten`, immer mit Wert).

  `auszug_ausgenommen` bleibt unverändert: die Tabelle enthält keine Adresse
  und kein Geheimnis, im Auszug des Betriebs steht sie wie bisher.
*/

alter table public.konto_umstellungen alter column durch drop not null;

do $migration$
declare
  quelle text;
  marke text;
  zahl integer;
begin
  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('konto_umstellungen' in quelle) = 0 then
    marke := $m$      'geburtsdatum', (select count(*) from public.geburtsdaten g$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenlöschung: Einfügestelle (Zählung) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, ltrim($neu$
      'kontoumstellungen', (select count(*) from public.konto_umstellungen k
                             where k.company_id = betrieb and (k.user_id = p_id or k.durch = p_id)),
$neu$, E'\n') || marke);

    marke := $m$      delete from public.geburtsdaten g where g.company_id = betrieb and g.user_id = p_id;$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenlöschung: Einfügestelle (Löschen) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, marke || $neu$
      delete from public.konto_umstellungen k where k.company_id = betrieb and k.user_id = p_id;
      update public.konto_umstellungen k set durch = null, durch_name = null
       where k.company_id = betrieb and k.durch = p_id;$neu$);
    execute quelle;
  end if;
end;
$migration$;
