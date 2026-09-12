#!/usr/bin/env bash
# Den lokalen Supabase-Stack hochfahren — und vorher den Docker-Dienst, falls
# er nicht läuft.
#
# In einer frischen Umgebung (und in dieser Entwicklungssitzung nach jeder
# Pause) ist der Docker-Dienst aus. `supabase start` meldet dann einen
# Verbindungsfehler, der nach einem kaputten Stack aussieht und keiner ist.
# Das hier nimmt die Verwechslung heraus.
#
#   scripts/stack.sh          startet, was nicht läuft
#   scripts/stack.sh neu      hält vorher alles an (wenn der Stack klemmt)
set -u

if ! timeout 5 docker info >/dev/null 2>&1; then
  echo "Docker-Dienst starten…"
  sudo -n dockerd >/tmp/dockerd.log 2>&1 &
  for _ in $(seq 1 60); do
    timeout 5 docker info >/dev/null 2>&1 && break
    sleep 2
  done
  timeout 5 docker info >/dev/null 2>&1 || { echo "Docker startet nicht, siehe /tmp/dockerd.log"; exit 1; }
fi

if [ "${1:-}" = "neu" ]; then
  npx --yes supabase@latest stop --no-backup >/dev/null 2>&1
fi

if ! npx --yes supabase@latest start >/tmp/supabase-start.log 2>&1; then
  echo "Erster Versuch gescheitert, halte an und starte neu…"
  npx --yes supabase@latest stop --no-backup >/dev/null 2>&1
  npx --yes supabase@latest start >>/tmp/supabase-start.log 2>&1 || {
    tail -5 /tmp/supabase-start.log; exit 1; }
fi

# Erst wenn die Datenbank wirklich antwortet, ist der Stack brauchbar.
for _ in $(seq 1 60); do
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c 'select 1' >/dev/null 2>&1 && {
    echo "Stack läuft."; exit 0; }
  sleep 2
done
echo "Datenbank antwortet nicht."; exit 1
