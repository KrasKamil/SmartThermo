import { describe, it, expect, vi } from 'vitest';
import axios from 'axios';
import { getDailyJoke } from '../src/services/jokeService';

vi.mock('axios');

describe('jokeService', () => {
  it('powinien poprawnie zwrócić żart typu single', async () => {
    (axios.get as any).mockResolvedValueOnce({
      data: {
        error: false,
        type: 'single',
        joke: 'Testowy suchar programistyczny',
        category: 'Programming'
      }
    });

    const res = await getDailyJoke();
    expect(res.joke).toBe('Testowy suchar programistyczny');
    expect(res.category).toBe('Programming');
  });

  it('powinien poprawnie sformatować żart typu twopart', async () => {
    (axios.get as any).mockResolvedValueOnce({
      data: {
        error: false,
        type: 'twopart',
        setup: 'Dlaczego programista płacze?',
        delivery: 'Bo zjadł za dużo ciasteczek.',
        category: 'Pun'
      }
    });

    const res = await getDailyJoke();
    expect(res.joke).toContain('Dlaczego programista płacze?');
    expect(res.joke).toContain('Bo zjadł za dużo ciasteczek.');
    expect(res.category).toBe('Pun');
  });

  it('powinien zwrócić fallback w razie błędu API', async () => {
    (axios.get as any).mockRejectedValueOnce(new Error('Network error'));

    const res = await getDailyJoke();
    expect(res.category).toBe('Classic');
    expect(res.joke).toContain('Halloween');
  });
});
