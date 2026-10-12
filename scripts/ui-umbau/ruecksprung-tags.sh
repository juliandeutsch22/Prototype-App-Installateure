#!/usr/bin/env bash
# Setzt die Rücksprungpunkte der Designlinie „Lot“ (Stand 18, K7) und schiebt
# sie zu GitHub. Gedacht für den Betreiber: die Arbeitssitzung darf per Git nur
# ihren eigenen Zweig schreiben, Tags lehnt der Zugang ab (403).
#
# Die Schritte E1–E9 kamen als je ein Merge auf den Arbeitszweig von #256 und
# wurden als EIN Commit nach main übernommen. Ihre Stände leben heute nur noch
# unter refs/pull/256/head; die Tags halten sie zusätzlich fest.
#
# Aufruf im Repository:  bash scripts/ui-umbau/ruecksprung-tags.sh
set -euo pipefail

git fetch origin main refs/pull/256/head refs/pull/257/head

setzen() {
  local name="$1" commit="$2" text="$3"
  if git rev-parse -q --verify "refs/tags/$name" >/dev/null; then
    echo "vorhanden: $name"
  else
    git tag -a "$name" "$commit" -m "$text"
    echo "gesetzt:   $name -> ${commit:0:7}"
  fi
}

setzen vor-ui-lot              4abb9ca6179b03b7e0bfa50cd5726b4ced22518f "Stand von main unmittelbar vor der Designlinie Lot (#256)."
setzen ui-lot-grundlage        f30424d3b5ac1a2a89ae896a9ff01a50099ba3e4 "Lot: Grundwerte, Bausteine, Musterseite, Hülle und Navigation, Leitfaden (Arbeitszweig #256)."
setzen ui-lot-E1-start         21d6aa90b2d0a530b02c5277ed429998a4114753 "Lot, Paket start (E1, dazu Mitarbeiterübersicht und Nachkalkulation) — Arbeitszweig #256."
setzen ui-lot-E6-scheine       1b673275d6c48fea5b52de4e72c49b805d8dc9d4 "Lot, Paket scheine (E6/E8) — Arbeitszweig #256."
setzen ui-lot-E2-planung       24c57707e6c7499432ad830913acc2e432c85797 "Lot, Paket planung (E2) — Arbeitszweig #256."
setzen ui-lot-E3-E5-material   b81132c15e75099266bfa3d8e7625a8e8f6d8473 "Lot, Paket material (E3–E5) — Arbeitszweig #256."
setzen ui-lot-E8-zeit          7ebaea540c4e898245526472bfe4184666e86f75 "Lot, Paket zeit (E8) — Arbeitszweig #256."
setzen ui-lot-E6-E7-auftraege  aec99a8a06d6e021c17bf43a9b3339c35b166d60 "Lot, Paket auftraege (E6/E7) — Arbeitszweig #256."
setzen ui-lot-E9-verwaltung    c87ef1cd01069201888ce721fdc63dc8a9fc59be "Lot, Paket verwaltung (E9) — Arbeitszweig #256."
setzen ui-lot-E6-E8-angebote   c4f91d48caaf272251d7d3f5ea37c83030c9f89a "Lot, Paket angebote (E6–E8) — Arbeitszweig #256."
setzen ui-lot-E6-E8-rechnungen a3177e31734f97464e12a34c133102fbe06d2cfc "Lot, Paket rechnungen (E6/E8) — Arbeitszweig #256."
setzen ui-lot                  21e4d94bfdcc604f09f405be3015028f46938a69 "Designlinie Lot auf main (#256, als ein Commit)."
setzen ui-lot-r4               078429f33f63e29ea1df2a84fb55458fc1956cab "Runde 4 auf main (#257)."

git push origin vor-ui-lot ui-lot-grundlage ui-lot-E1-start ui-lot-E6-scheine ui-lot-E2-planung \
  ui-lot-E3-E5-material ui-lot-E8-zeit ui-lot-E6-E7-auftraege ui-lot-E9-verwaltung \
  ui-lot-E6-E8-angebote ui-lot-E6-E8-rechnungen ui-lot ui-lot-r4
