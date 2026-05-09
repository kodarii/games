import { type Result, err, ok } from '../shared/result';

export type ReleaseYearRangeError =
  | { kind: 'inverted' }
  | { kind: 'out_of_bounds_low'; min: number }
  | { kind: 'out_of_bounds_high'; max: number }
  | { kind: 'not_integer' };

const MIN_YEAR = 1958;
const MAX_YEAR = 2100;

export class ReleaseYearRange {
  private constructor(
    readonly from: number,
    readonly to: number,
  ) {}

  static create(from: number, to: number): Result<ReleaseYearRange, ReleaseYearRangeError> {
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      return err({ kind: 'not_integer' });
    }
    if (from < MIN_YEAR) return err({ kind: 'out_of_bounds_low', min: MIN_YEAR });
    if (to > MAX_YEAR) return err({ kind: 'out_of_bounds_high', max: MAX_YEAR });
    if (from > to) return err({ kind: 'inverted' });
    return ok(new ReleaseYearRange(from, to));
  }
}
