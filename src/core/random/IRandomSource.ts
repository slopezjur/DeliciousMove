/**
 * Abstraction over randomness so the core engine stays deterministic and testable (DIP).
 * No core class may call Math.random() directly.
 */
export interface IRandomSource {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). Returns 0 when maxExclusive <= 0. */
  nextInt(maxExclusive: number): number;
  /** Uniform element of a non-empty collection. */
  pick<T>(items: readonly T[]): T;
}

abstract class RandomSourceBase implements IRandomSource {
  public abstract next(): number;

  public nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  public pick<T>(items: readonly T[]): T {
    return items[this.nextInt(items.length)];
  }
}

/** Production source backed by the platform PRNG. */
export class MathRandomSource extends RandomSourceBase {
  public next(): number {
    return Math.random();
  }
}

/**
 * Deterministic mulberry32 generator. Identical seeds always replay identical games,
 * which is what makes the headless engine test suite reproducible.
 */
export class SeededRandomSource extends RandomSourceBase {
  private state: number;

  constructor(seed: number = 1) {
    super();
    this.state = seed >>> 0;
  }

  public next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public reset(seed: number): void {
    this.state = seed >>> 0;
  }
}
