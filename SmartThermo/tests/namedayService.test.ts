import { describe, it, expect } from 'vitest';
import { getNamedays } from '../src/services/namedayService';

describe('namedayService', () => {
  it('powinien zwrócić imieniny dla dzisiejszego dnia', async () => {
    const result = await getNamedays();
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
