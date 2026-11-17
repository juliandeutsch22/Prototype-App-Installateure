import { describe, expect, it } from 'vitest';
import Button from '@/components/Button';
import { aktionSymbol } from '@/components/useEinziehen';

/* B9: nur eine Hauptaktion mit einem Zeichen, das für sie stehen kann, zieht sich zusammen. */
describe('aktionSymbol', () => {
  it('„Neu …“ trägt das Plus, andere Aktionen keines', () => {
    expect(aktionSymbol(<Button>Neue Rechnung</Button>)).toBe('plus');
    expect(aktionSymbol(<Button>Neuer Kunde</Button>)).toBe('plus');
    expect(aktionSymbol(<Button><span>Neues</span> Angebot</Button>)).toBe('plus');
    expect(aktionSymbol(<Button>Wareneingang</Button>)).toBeNull();
    // „Neu laden“ ist kein Anlegen.
    expect(aktionSymbol(<Button>Neu laden</Button>)).toBeNull();
    expect(aktionSymbol(undefined)).toBeNull();
  });

  /*
    E95: in der Einsatzplanung zog sich „Einsatz planen“ nicht zusammen —
    das Plus kannte nur „Neu …“. Gegenprobe: mit der Regel davor ist jede
    dieser Zeilen null (rot).
  */
  it('auch „… planen“, „… anlegen“, „… erfassen“ und „Antrag stellen“ legen etwas an', () => {
    expect(aktionSymbol(<Button>Einsatz planen</Button>)).toBe('plus');
    expect(aktionSymbol(<Button>Benutzer anlegen</Button>)).toBe('plus');
    expect(aktionSymbol(<Button>Eintrag erfassen</Button>)).toBe('plus');
    expect(aktionSymbol(<Button>Antrag stellen</Button>)).toBe('plus');
  });

  it('gleich geblieben: was nichts anlegt, zieht sich nicht zusammen', () => {
    expect(aktionSymbol(<Button>Bearbeiten</Button>)).toBeNull();
    expect(aktionSymbol(<Button>Abweichungen buchen</Button>)).toBeNull();
    expect(aktionSymbol(<Button>Abschließen</Button>)).toBeNull();
    expect(aktionSymbol(<Button>planen</Button>)).toBeNull();
  });
});
