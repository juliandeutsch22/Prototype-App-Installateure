/**
 * Die Prüfsumme eines Handwerksscheins.
 *
 * WOZU. Ein qualifizierter Zeitstempel nach eIDAS käme von einem
 * Vertrauensdiensteanbieter und kostet Geld; für einen Rapportzettel ist er
 * nicht nötig. Was den Beleg tatsächlich schützt, ist billiger und wirksamer:
 * ein Hash über den eingefrorenen Inhalt. Legt jemand später ein PDF vor,
 * lässt sich damit belegen, ob es genau das ist, was unterschrieben wurde.
 *
 * DIE KANONISIERUNG IST DER GANZE TRICK. Zwei inhaltlich gleiche Scheine
 * müssen dieselbe Zeichenkette ergeben — sonst hinge die Prüfsumme an der
 * zufälligen Reihenfolge der Felder in einem JSON-Objekt, und ein
 * Neuberechnen ergäbe einen anderen Wert, obwohl sich nichts geändert hat.
 * Deshalb werden die Felder ausdrücklich und in fester Reihenfolge
 * aufgeschrieben, statt das Dokument einfach zu serialisieren.
 *
 * Die Unterschriftsbilder gehen MIT ein: sie sind Teil dessen, was
 * unterschrieben wurde. Ein ausgetauschtes Bild muss die Prüfsumme ändern.
 *
 * DASSELBE GILT FÜR DIE FOTOS, und dort ist es kniffliger: die Bilddateien
 * liegen in Firebase Storage, das diese Rechnung gar nicht sieht. Sie geht
 * deshalb über den INHALTS-HASH jedes Fotos, den der Client beim Hochladen
 * bildet. Wer die Datei im Storage später austauscht, ändert ihren Hash — und
 * der im Schein festgehaltene passt dann nicht mehr. Ohne diesen Umweg wäre
 * der Beleg ausgerechnet an den Bildern löcherig.
 *
 * Ohne Importe, damit die Cloud Functions dieselbe Datei verwenden können —
 * eine zweite, von Hand gepflegte Fassung würde irgendwann abweichen, und
 * dann stimmte keine der beiden Prüfsummen mehr.
 */

export interface HashbarerSchein {
  projectNumber: string;
  customerName: string;
  address?: string;
  datum: string;
  abrechnung: string;
  zeiten: Array<{
    datum: string;
    mitarbeiter: string;
    von?: string;
    bis?: string;
    pauseMin?: number;
    minuten: number;
    taetigkeit?: string;
    helfer?: boolean;
  }>;
  material: Array<{ name: string; menge: number; einheit?: string }>;
  /** Freiwillig — ein Schein ohne Fotos ist vollständig. */
  fotos?: Array<{ pfad: string; hash: string }>;
  notizen?: string;
  unterschriften?: {
    monteur?: { name: string; bild: string; geraetZeit: number };
    kunde?: { name: string; bild: string; geraetZeit: number };
  };
}

/** Ein fehlender Wert und ein leerer String dürfen nicht verschieden hashen. */
function t(v: string | undefined | null): string {
  return (v ?? '').trim();
}

function n(v: number | undefined | null): string {
  return String(v ?? 0);
}

/**
 * Der Inhalt als eine feste, eindeutige Zeichenkette.
 *
 * Zeilenweise mit `` als Feldtrenner — ein Zeichen, das in
 * Freitextfeldern nicht vorkommt. Mit einem Semikolon oder Komma ließe sich
 * die Prüfsumme sonst austricksen: eine Tätigkeit „8;00" wäre von zwei
 * Feldern nicht zu unterscheiden.
 */
export function kanonischerInhalt(s: HashbarerSchein): string {
  const zeilen: string[] = [
    ['SCHEIN', t(s.projectNumber), t(s.customerName), t(s.address), t(s.datum), t(s.abrechnung)].join(''),
  ];

  // Die Reihenfolge der Positionen ist Teil des Inhalts: eine umsortierte
  // Liste ist ein anderer Beleg, auch wenn die Summe gleich bleibt.
  for (const z of s.zeiten) {
    zeilen.push(
      ['ZEIT', t(z.datum), t(z.mitarbeiter), t(z.von), t(z.bis), n(z.pauseMin), n(z.minuten), t(z.taetigkeit), z.helfer ? '1' : '0'].join(''),
    );
  }
  for (const m of s.material) {
    zeilen.push(['MATERIAL', t(m.name), n(m.menge), t(m.einheit)].join(''));
  }
  /*
    Die Fotos in ihrer Reihenfolge — sie ist Teil des Belegs, wie bei den
    Positionen. Ein Schein OHNE Fotos schreibt hier gar nichts: sonst änderte
    allein das Einführen dieses Feldes die Prüfsumme jedes bestehenden
    Scheins, und keiner davon liesse sich mehr nachrechnen.
  */
  for (const f of s.fotos ?? []) {
    zeilen.push(['FOTO', t(f.pfad), t(f.hash)].join(''));
  }
  zeilen.push(['NOTIZ', t(s.notizen)].join(''));

  for (const [rolle, u] of [
    ['MONTEUR', s.unterschriften?.monteur],
    ['KUNDE', s.unterschriften?.kunde],
  ] as const) {
    if (!u) continue;
    zeilen.push([rolle, t(u.name), n(u.geraetZeit), t(u.bild)].join(''));
  }

  return zeilen.join('\n');
}
