/*
  DER ANSTOSS SCHICKT DEN SCHLÜSSEL AUCH ALS `apikey`.

  WARUM DAS NÖTIG IST. Supabase löst die alten JWT-Schlüssel (`anon`,
  `service_role`) durch neue ab: `sb_publishable_…` und `sb_secret_…`. Die
  sind KEINE JWT. Das Tor vor den Edge Functions prüft aber genau das, wenn
  der Schlüssel allein im `Authorization`-Kopf steht — und lehnt einen neuen
  Schlüssel dort ab, bevor die Function überhaupt anläuft.

  Nachgemessen am laufenden Stapel, mit einem neuen Geheimschlüssel:

    nur Authorization          → 401 UNAUTHORIZED_INVALID_JWT_FORMAT
    Authorization + apikey     → die Function antwortet

  Und mit dem alten JWT-Schlüssel, zur Gegenprobe:

    nur Authorization          → 200
    Authorization + apikey     → 200

  Der zusätzliche Kopf kostet den alten Weg also nichts und ist für den neuen
  Bedingung. Er kommt hier dazu, damit der Nachtlauf einen Schlüsseltausch im
  Tresor übersteht, ohne dass jemand daran denken muss.

  WARUM EINE NEUE DATEI und keine Änderung an der alten: die alten
  Migrationen liegen bereits im Projekt. Eine Datei, die dort schon
  eingespielt ist, wird nicht noch einmal gelesen — geändert würde sie nur
  bei einem Neuaufbau von null, und dann liefen Projekt und Migrationen
  auseinander.
*/

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
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', schluessel,
      'Authorization', 'Bearer ' || schluessel),
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
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', schluessel,
      'Authorization', 'Bearer ' || schluessel),
    body := p_ereignis,
    timeout_milliseconds := 20000);
exception when others then
  -- Eine Push-Meldung, die nicht hinausgeht, ist aergerlich. Eine
  -- Materialanforderung, die deshalb nicht angelegt wird, ist ein
  -- Betriebsstillstand. Der Anstoss reisst den Schreibvorgang nicht mit.
  raise warning 'Push konnte nicht angestossen werden: %', sqlerrm;
end;
$$;
