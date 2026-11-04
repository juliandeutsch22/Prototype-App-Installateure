import type { ReactNode } from 'react';
import {
  textZerlegen, type Betreiber, type Block, type Stueck, type TextInhalt, type Verarbeiter,
} from './rechtstext';

/**
 * Ein Rechtstext, gesetzt — für die öffentliche Seite und die Vorschau im
 * Editor gleich. Alles, was der Betreiber getippt hat, kommt als Text in die
 * Seite (`rechtstext.ts` zerlegt es); kein `dangerouslySetInnerHTML`.
 */
export default function RechtInhalt({ inhalt, betreiber }: { inhalt: TextInhalt; betreiber: Betreiber }) {
  return (
    <>
      {inhalt.abschnitte.map((a, i) => (
        <section key={i} className="space-y-2">
          <h2 className="titel-karte">{a.titel}</h2>
          {textZerlegen(a.text, betreiber).map((b, j) => (
            <BlockSetzen key={j} block={b} verarbeiter={inhalt.verarbeiter ?? []} />
          ))}
        </section>
      ))}
    </>
  );
}

function BlockSetzen({ block, verarbeiter }: { block: Block; verarbeiter: Verarbeiter[] }) {
  if (block.art === 'verarbeiter') {
    return (
      <ul className="recht-liste">
        {verarbeiter.map((v) => (
          <li key={v.wer}>
            <p className="recht-liste-name">{v.wer}</p>
            <p className="text-sm">{v.wofuer}</p>
            <p className="text-sm text-ink-muted">{v.wo}</p>
          </li>
        ))}
      </ul>
    );
  }
  if (block.art === 'liste') {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {block.punkte.map((p, i) => (
          <li key={i}>{stueckeSetzen(p)}</li>
        ))}
      </ul>
    );
  }
  return <p>{stueckeSetzen(block.teile)}</p>;
}

function stueckeSetzen(teile: Stueck[]): ReactNode[] {
  return teile.map((t, i) => {
    switch (t.art) {
      case 'text':
        return t.text;
      case 'angabe':
        return t.text;
      case 'umbruch':
        return <br key={i} />;
      case 'fett':
        return <strong key={i}>{stueckeSetzen(t.teile)}</strong>;
      case 'verweis':
        return t.ziel.startsWith('https://') ? (
          <a key={i} href={t.ziel} className="link" rel="noreferrer" target="_blank">{t.text}</a>
        ) : (
          <a key={i} href={t.ziel} className="link">{t.text}</a>
        );
    }
  });
}
