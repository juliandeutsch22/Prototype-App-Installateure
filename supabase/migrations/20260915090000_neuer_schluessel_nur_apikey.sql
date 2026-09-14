/*
  EIN NEUER SCHLÜSSEL GEHÖRT NUR IN `apikey` — NICHT IN `Authorization`.

  Die Migration davor schickte den Schlüssel in beiden Kopfzeilen. Lokal ging
  das durch, im echten Projekt nicht: das Tor vor den Edge Functions prüft
  ALLES, was in `Authorization` steht, als JWT — und ein neuer Schlüssel
  (`sb_secret_…`) ist keines. Die Antwort war

    401 {"code":"UNAUTHORIZED_INVALID_JWT_FORMAT","message":"Invalid JWT"}

  und zwar BEVOR die Function anlief; dass `apikey` daneben stand, half
  nicht. Die Dokumentation sagt es auch so: publishable und secret keys
  gehören auf `apikey`, nicht auf `Authorization: Bearer`.

  Deshalb entscheidet jetzt die FORM des Schlüssels, wohin er kommt:

    drei durch Punkte getrennte Teile (JWT) → `apikey` und `Authorization`
    alles andere                            → nur `apikey`

  Geprüft wird die Form, nicht die Gültigkeit. Die Entscheidung lautet „in
  welchen Kopf", nicht „ist er echt" — echt oder nicht entscheidet das Tor.

  So übersteht der Nachtlauf den Wechsel in beide Richtungen: der alte
  JWT-Schlüssel läuft weiter wie bisher, der neue kommt an.
*/

create or replace function app.anstoss_kopfzeilen(p_schluessel text) returns jsonb
  language sql
  immutable
  set search_path = ''
as $$
  select case
    when p_schluessel ~ '^[^.]+\.[^.]+\.[^.]+$' then
      jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', p_schluessel,
        'Authorization', 'Bearer ' || p_schluessel)
    else
      jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', p_schluessel)
  end
$$;

create or replace function app.ausleitung_anstossen() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  adresse text;
  schluessel text;
begin
  select decrypted_secret into adresse
    from vault.decrypted_secrets where name = 'ausleitung_url';
  select decrypted_secret into schluessel
    from vault.decrypted_secrets where name = 'ausleitung_schluessel';

  if adresse is null or schluessel is null then
    raise warning 'Ausleitung nicht eingerichtet: ausleitung_url oder ausleitung_schluessel fehlt im Tresor.';
    return;
  end if;

  perform net.http_post(
    url := adresse,
    headers := app.anstoss_kopfzeilen(schluessel),
    body := jsonb_build_object('quelle', 'nachtlauf'),
    -- Ein grosser Betrieb liest seinen ganzen Bestand. Die Vorgabe von fuenf
    -- Sekunden reicht dafuer nicht; `net.http_post` wartet ohnehin nicht auf
    -- die Antwort, aber die Verbindung darf nicht vorher fallen.
    timeout_milliseconds := 300000);
end;
$$;

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
    headers := app.anstoss_kopfzeilen(schluessel),
    body := p_ereignis,
    timeout_milliseconds := 20000);
exception when others then
  -- Eine Push-Meldung, die nicht hinausgeht, ist aergerlich. Eine
  -- Materialanforderung, die deshalb nicht angelegt wird, ist ein
  -- Betriebsstillstand. Der Anstoss reisst den Schreibvorgang nicht mit.
  raise warning 'Push konnte nicht angestossen werden: %', sqlerrm;
end;
$$;
