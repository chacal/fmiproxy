import * as R from 'ramda'

interface RamdaExt {
  sortBy<T>(fn: (a: T) => R.Ord, list: T[]): T[];
}

export default R as R.Static & RamdaExt
