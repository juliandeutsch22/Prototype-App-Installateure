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
});
