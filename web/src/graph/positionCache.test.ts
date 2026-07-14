import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadPositions, savePositions } from './positionCache';

// Minimal in-memory localStorage stub attached to globalThis for the test.
function makeStorageStub() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: vi.fn((k: string) => (store.has(k) ? store.get(k)! : null)),
    setItem: vi.fn((k: string, v: string) => {
      store.set(k, String(v));
    }),
    removeItem: vi.fn((k: string) => {
      store.delete(k);
    }),
    clear: vi.fn(() => store.clear()),
  };
}

describe('positionCache', () => {
  let stub: ReturnType<typeof makeStorageStub>;
  const original = (globalThis as any).localStorage;

  beforeEach(() => {
    stub = makeStorageStub();
    (globalThis as any).localStorage = stub;
  });

  afterEach(() => {
    (globalThis as any).localStorage = original;
    vi.restoreAllMocks();
  });

  it('save 2 nodes then load returns the same map', () => {
    savePositions('projA', [
      { id: 'a', x: 10, y: 20 },
      { id: 'b', x: -5, y: 7.5 },
    ]);
    const loaded = loadPositions('projA');
    expect(loaded).toEqual({
      a: { x: 10, y: 20 },
      b: { x: -5, y: 7.5 },
    });
  });

  it('save writes to the svx.pos.<project> key', () => {
    savePositions('projB', [{ id: 'a', x: 1, y: 2 }]);
    expect(stub.setItem).toHaveBeenCalledWith('svx.pos.projB', expect.any(String));
    expect(stub.store.has('svx.pos.projB')).toBe(true);
  });

  it('loading an unknown project returns null', () => {
    expect(loadPositions('nope')).toBeNull();
  });

  it('a node with undefined x is skipped', () => {
    savePositions('projC', [
      { id: 'a', x: 1, y: 2 },
      { id: 'b', y: 9 }, // x undefined → skipped
      { id: 'c', x: 3, y: undefined }, // y undefined → skipped
    ]);
    const loaded = loadPositions('projC');
    expect(loaded).toEqual({ a: { x: 1, y: 2 } });
  });

  it('non-finite coordinates (NaN/Infinity) are skipped', () => {
    savePositions('projD', [
      { id: 'a', x: NaN, y: 0 },
      { id: 'b', x: 0, y: Infinity },
      { id: 'c', x: 4, y: 5 },
    ]);
    expect(loadPositions('projD')).toEqual({ c: { x: 4, y: 5 } });
  });

  it('corrupt JSON returns null without throwing', () => {
    stub.store.set('svx.pos.broken', '{not valid json');
    expect(() => loadPositions('broken')).not.toThrow();
    expect(loadPositions('broken')).toBeNull();
  });

  it('savePositions no-ops (no throw) when setItem throws (quota)', () => {
    stub.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => savePositions('projE', [{ id: 'a', x: 1, y: 2 }])).not.toThrow();
  });

  it('returns null (no throw) when localStorage is absent', () => {
    (globalThis as any).localStorage = undefined;
    expect(() => loadPositions('projA')).not.toThrow();
    expect(loadPositions('projA')).toBeNull();
    expect(() => savePositions('projA', [{ id: 'a', x: 1, y: 2 }])).not.toThrow();
  });
});
