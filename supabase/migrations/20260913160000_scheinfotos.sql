-- Der Speicher fuer die Scheinfotos — Stufe 6.
--
-- Es ist die einzige Stelle, an der diese App Dateien vom Geraet annimmt.
-- Alles andere passt in Zeilen; ein Handyfoto tut das nicht.
--
-- DER PFAD BLEIBT, ZEICHEN FUER ZEICHEN: `scheine/{betrieb}/{schein}/{datei}`.
-- Er steht im Schein und geht in dessen Pruefsumme ein (`kanonischerInhalt`,
-- Zeile `FOTO`). Wuerde der Umzug die Pfade umschreiben — etwa das fuehrende
-- `scheine/` weglassen, weil der Eimer schon so heisst —, liesse sich kein
-- einziger unterschriebener Schein mehr nachrechnen. Der erste Abschnitt ist
-- also bewusst doppelt gemoppelt; das ist der Preis dafuer, dass die alten
-- Belege gueltig bleiben.

/*
  DER EIMER IST NICHT OEFFENTLICH.

  Unter Firebase kam die Adresse aus `getDownloadURL` — eine Kennung, die
  dauerhaft gilt, solange sie niemand zurueckzieht. Hier wird stattdessen bei
  jedem Ansehen eine befristete Adresse ausgestellt. Der Unterschied faellt
  auf, wenn jemand eine solche Adresse weitergibt: die alte galt fuer immer,
  die neue eine Stunde.

  GROESSE UND TYP STEHEN AM EIMER, nicht in einer Richtlinie. Zwei Megabyte:
  der Browser verkleinert auf 1600 Bildpunkte und JPEG, das landet bei zwei-
  bis vierhundert Kilobyte. Die Grenze faengt also nicht den Normalfall ab,
  sondern den Fehler — eine Fassung, die das Verkleinern ueberspringt, und
  jeden Versuch, den Eimer als Ablage zu benutzen.
*/
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scheinfotos', 'scheinfotos', false, 2 * 1024 * 1024,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/*
  DER MANDANT KOMMT AUS DEM PFAD, GEPRUEFT WIRD ER GEGEN DAS TOKEN.

  `storage.foldername` zerlegt den Objektnamen in seine Verzeichnisabschnitte
  — fuer `scheine/perl/s1/abc.jpg` ergibt das `{scheine, perl, s1}`, der
  Betrieb steht also an zweiter Stelle. Das ist die einzige Stelle in diesem
  Projekt, an der eine Regel eine Zeichenkette zerlegt; anders geht es bei
  einem Dateispeicher nicht, der nur Namen kennt.
*/
create or replace function app.foto_betrieb(objektname text) returns text
  language sql immutable
  set search_path = ''
as $$
  select case
    when (storage.foldername(objektname))[1] = 'scheine'
      then (storage.foldername(objektname))[2]
  end
$$;

/*
  LESEN darf der ganze Betrieb: der Monteur hat die Bilder gemacht, das Buero
  braucht sie bei einer Rueckfrage des Kunden, die Buchhaltung sieht sie an
  der Rechnung. Wer den Schein sehen darf, darf auch seine Fotos sehen.

  UEBERSCHREIBEN IST NICHT AUSGESCHLOSSEN, und das ist Absicht: ein
  abgebrochener Upload muss sich wiederholen lassen. Der Schutz gegen das
  nachtraegliche Austauschen sitzt woanders — im Inhalts-Hash, den der
  eingefrorene Schein festhaelt. Eine Regel, die das Ueberschreiben verboete,
  machte das Wiederholen unmoeglich und den Beleg kein bisschen sicherer.

  LOESCHEN gehoert zum Entwurf: ein versehentlich aufgenommenes Bild muss weg,
  bevor unterschrieben wird. Danach schuetzt es der Schein — sein Hash zeigt
  eine fehlende Datei genauso an wie eine ausgetauschte.
*/
drop policy if exists scheinfotos_lesen on storage.objects;
create policy scheinfotos_lesen on storage.objects for select to authenticated
  using (bucket_id = 'scheinfotos' and app.darf(app.foto_betrieb(name)));

drop policy if exists scheinfotos_anlegen on storage.objects;
create policy scheinfotos_anlegen on storage.objects for insert to authenticated
  with check (bucket_id = 'scheinfotos' and app.darf(app.foto_betrieb(name)));

drop policy if exists scheinfotos_ersetzen on storage.objects;
create policy scheinfotos_ersetzen on storage.objects for update to authenticated
  using (bucket_id = 'scheinfotos' and app.darf(app.foto_betrieb(name)))
  with check (bucket_id = 'scheinfotos' and app.darf(app.foto_betrieb(name)));

/*
  DIE MANDANTENPRUEFUNG AM LOESCHEN IST HEUTE UNERREICHBAR — und bleibt.

  Eine Mutation hat es gezeigt: nimmt man sie heraus, wird keine Pruefung rot.
  Der Grund liegt nicht daran, dass sie egal waere, sondern daran, dass der
  Speicherdienst vor dem Loeschen das Objekt SUCHT — und daran scheitert ein
  fremder Betrieb schon an der Leseregel. Die Loeschregel kommt nie an die
  Reihe.

  Sie zu streichen hiesse, sich darauf zu verlassen, dass das so bleibt: dass
  `remove` auch morgen erst liest, und dass die Leseregel nie weiter wird.
  Zwei Annahmen ueber fremden Code als einziges Schloss an einem Beleg, den
  ein Kunde unterschrieben hat. Sie steht hier als das, was sie ist — ein
  zweites Schloss, das heute niemand aufsperren kann.
*/
drop policy if exists scheinfotos_loeschen on storage.objects;
create policy scheinfotos_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'scheinfotos' and app.darf(app.foto_betrieb(name)));
