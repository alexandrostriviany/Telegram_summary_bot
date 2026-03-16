/**
 * Unit Tests for Request Coalescer
 *
 * @module cache/request-coalescer.test
 */

import { createRequestCoalescer, RequestCoalescer } from './request-coalescer';

describe('RequestCoalescer', () => {
  let coalescer: RequestCoalescer;

  beforeEach(() => {
    jest.useFakeTimers();
    coalescer = createRequestCoalescer();
  });

  afterEach(() => {
    coalescer.clear();
    jest.useRealTimers();
  });

  it('should call factory once for concurrent requests with the same key', async () => {
    const factory = jest.fn().mockResolvedValue('summary result');

    const p1 = coalescer.getOrExecute('chat:1', factory);
    const p2 = coalescer.getOrExecute('chat:1', factory);
    const p3 = coalescer.getOrExecute('chat:1', factory);

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(r1).toBe('summary result');
    expect(r2).toBe('summary result');
    expect(r3).toBe('summary result');
  });

  it('should call factory separately for different keys', async () => {
    const factory1 = jest.fn().mockResolvedValue('result 1');
    const factory2 = jest.fn().mockResolvedValue('result 2');

    const [r1, r2] = await Promise.all([
      coalescer.getOrExecute('chat:1', factory1),
      coalescer.getOrExecute('chat:2', factory2),
    ]);

    expect(factory1).toHaveBeenCalledTimes(1);
    expect(factory2).toHaveBeenCalledTimes(1);
    expect(r1).toBe('result 1');
    expect(r2).toBe('result 2');
  });

  it('should serve cached result within grace period', async () => {
    const factory = jest.fn().mockResolvedValue('cached');

    const r1 = await coalescer.getOrExecute('key', factory);

    // Advance time but stay within grace period
    jest.advanceTimersByTime(30_000);

    const factory2 = jest.fn().mockResolvedValue('new');
    const r2 = await coalescer.getOrExecute('key', factory2);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory2).not.toHaveBeenCalled();
    expect(r1).toBe('cached');
    expect(r2).toBe('cached');
  });

  it('should call factory again after grace period expires', async () => {
    const factory1 = jest.fn().mockResolvedValue('first');
    await coalescer.getOrExecute('key', factory1);

    // Advance past grace period
    jest.advanceTimersByTime(61_000);

    const factory2 = jest.fn().mockResolvedValue('second');
    const result = await coalescer.getOrExecute('key', factory2);

    expect(factory2).toHaveBeenCalledTimes(1);
    expect(result).toBe('second');
  });

  it('should not cache rejected promises', async () => {
    const factory1 = jest.fn().mockRejectedValue(new Error('fail'));

    await expect(coalescer.getOrExecute('key', factory1)).rejects.toThrow('fail');
    expect(coalescer.size()).toBe(0);

    const factory2 = jest.fn().mockResolvedValue('recovered');
    const result = await coalescer.getOrExecute('key', factory2);

    expect(factory2).toHaveBeenCalledTimes(1);
    expect(result).toBe('recovered');
  });

  it('should report correct size', async () => {
    expect(coalescer.size()).toBe(0);

    const p1 = coalescer.getOrExecute('a', () => Promise.resolve('1'));
    const p2 = coalescer.getOrExecute('b', () => Promise.resolve('2'));

    expect(coalescer.size()).toBe(2);

    await Promise.all([p1, p2]);
    expect(coalescer.size()).toBe(2); // still present during grace period

    jest.advanceTimersByTime(61_000);
    expect(coalescer.size()).toBe(0);
  });

  it('should clear all entries', async () => {
    await coalescer.getOrExecute('a', () => Promise.resolve('1'));
    await coalescer.getOrExecute('b', () => Promise.resolve('2'));

    expect(coalescer.size()).toBe(2);
    coalescer.clear();
    expect(coalescer.size()).toBe(0);
  });

  it('should log coalesced request message', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const factory = jest.fn().mockResolvedValue('result');
    coalescer.getOrExecute('chat:123', factory);
    coalescer.getOrExecute('chat:123', factory);

    await Promise.all([
      coalescer.getOrExecute('chat:123', factory),
    ]);

    expect(consoleSpy).toHaveBeenCalledWith('Coalesced request for key: chat:123');
    consoleSpy.mockRestore();
  });
});
