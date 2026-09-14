-- Die Push-Meldungen rund um Materialanforderungen — der Ausloeser.
--
-- WAS HIER STEHT UND WAS NICHT. Der Trigger erkennt das EREIGNIS und sonst
-- nichts: eine neue Anforderung, oder eine, die gerade auf „Abholbereit"
-- gesprungen ist. WER etwas bekommt und WAS darin steht, entscheidet
-- `shared/notifyLogic.ts` — dieselbe Datei, die es unter Firestore entschied,
-- und die einzeln geprueft ist.
--
-- WARUM NICHT ALLES IN SQL. Die Empfaengerregeln noch einmal in plpgsql zu
-- schreiben waere eine zweite Fassung derselben Entscheidungen. Sie ergaeben
-- dieselben Meldungen, bis sie es eines Tages nicht mehr taeten — und
-- bemerkt wuerde es daran, dass jemand eine Meldung NICHT bekommt. Genau der
-- Fehler, den niemand sieht.
--
-- FCM BLEIBT BEI FIREBASE. Das haengt an keiner Datenbank und funktioniert;
-- ein Umzug dorthin waere Arbeit ohne Gegenwert. Umgezogen ist nur, was den
-- Versand ANSTOESST.

/*
  DER ANSTOSS SELBST — und warum er nicht direkt im Trigger steht.

  `net.http_post` wartet nicht auf die Antwort, aber es braucht die Adresse
  und einen Schluessel, und beide gehoeren in den Tresor und nicht in eine
  Migration im Git. Fehlen sie, tut der Anstoss NICHTS und sagt es in der
  Serverlogdatei — statt bei jeder Anforderung in einen Fehler zu laufen, der
  die Anforderung selbst mitreissen wuerde.

  DAS IST DIE WICHTIGSTE EIGENSCHAFT DIESER FUNKTION: eine Push-Meldung, die
  nicht hinausgeht, ist aergerlich. Eine Materialanforderung, die deshalb
  nicht angelegt wird, ist ein Betriebsstillstand. Der Anstoss darf den
  Schreibvorgang unter keinen Umstaenden scheitern lassen.
*/
create or replace function app.push_anstossen(p_ereignis jsonb) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  adresse text;
  schluessel text;
begin
  select decrypted_secret into adresse
    from vault.decrypted_secrets where name = 'push_url';
  select decrypted_secret into schluessel
    from vault.decrypted_secrets where name = 'push_schluessel';

  if adresse is null or schluessel is null then
    raise warning 'Push nicht eingerichtet: push_url oder push_schluessel fehlt im Tresor.';
    return;
  end if;

  perform net.http_post(
    url := adresse,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || schluessel),
    body := p_ereignis,
    timeout_milliseconds := 20000);
exception when others then
  -- Siehe oben: der Anstoss reisst den Schreibvorgang nicht mit.
  raise warning 'Push konnte nicht angestossen werden: %', sqlerrm;
end;
$$;

/*
  DER TRIGGER LAEUFT NACH DEM SCHREIBEN (`after`), nicht davor.

  Vorher hiesse: die Meldung geht hinaus, und danach scheitert die Zeile an
  einer Regel. Jemand bekaeme eine Benachrichtigung ueber eine Anforderung,
  die es nicht gibt — und fuehre womoeglich los.

  ZWEI EREIGNISSE, EIN TRIGGER. Was ein „Uebergang auf Abholbereit" ist,
  entscheidet die Edge Function; hier wird nur festgestellt, DASS sich der
  Status geaendert hat. Alles Weitere waere die zweite Fassung der Regeln.
*/
create or replace function app.push_bei_anforderung() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.push_anstossen(jsonb_build_object(
      'art', 'neu',
      'nachher', to_jsonb(new)));
  elsif new.status is distinct from old.status then
    perform app.push_anstossen(jsonb_build_object(
      'art', 'geaendert',
      'vorher', to_jsonb(old),
      'nachher', to_jsonb(new)));
  end if;
  return null;
end;
$$;

drop trigger if exists material_orders_push on public.material_orders;
create trigger material_orders_push
  after insert or update on public.material_orders
  for each row execute function app.push_bei_anforderung();

/*
  WEN DIE EDGE FUNCTION FRAGEN DARF.

  Sie laeuft mit dem Dienstschluessel und koennte alles lesen. Damit sie es
  nicht muss, gibt es diese eine Funktion: zu einer Anforderung die Kennungen,
  die etwas bekommen sollen — Rollenempfaenger und Projektleitung, getrennt.
  Die AUSWAHL daraus trifft `notifyLogic.ts`; hier steht nur, welche Zeilen
  ueberhaupt in Frage kommen.
*/
create or replace function public.push_empfaenger(
  p_betrieb text,
  p_baustelle text
) returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select jsonb_build_object(
    'belegschaft', coalesce((
      select jsonb_agg(jsonb_build_object('uid', u.id, 'role', u.role, 'active', u.active))
        from public.users u where u.company_id = p_betrieb), '[]'::jsonb),
    'projektleitung', coalesce((
      select to_jsonb(p.project_managers)
        from public.projects p
       where p.company_id = p_betrieb and p.project_number = p_baustelle
       limit 1), '[]'::jsonb))
$$;

revoke all on function public.push_empfaenger(text, text) from public, anon, authenticated;
grant execute on function public.push_empfaenger(text, text) to service_role;

/*
  EIN TOTES GERAET AUS DER LISTE NEHMEN.

  Ohne das waechst die Tokenliste mit jedem Geraetewechsel, und jeder Versand
  laeuft in dieselben Fehler. Welche Tokens als endgueltig tot gelten,
  entscheidet `notifyLogic.toteTokens` — auch das gehoert nicht zweimal
  geschrieben.
*/
create or replace function public.push_token_entfernen(p_token text) returns void
  language sql
  security definer
  set search_path = ''
as $$
  update public.user_prefs
     set push_tokens = array_remove(push_tokens, p_token)
   where p_token = any(push_tokens)
$$;

revoke all on function public.push_token_entfernen(text) from public, anon, authenticated;
grant execute on function public.push_token_entfernen(text) to service_role;
