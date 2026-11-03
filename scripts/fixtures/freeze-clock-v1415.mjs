// WAWIS 14.15 — zamrożony zegar dla testów: każde new Date()/Date.now() zwraca tę samą milisekundę.
// Odtwarza warunki szybkiego CI, w którym wiele wpisów diagnostyki powstaje w tej samej milisekundzie.
const RealDate = Date;
const FIXED = new RealDate('2026-11-03T10:00:00.000Z').getTime();
class FrozenDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [FIXED])); }
  static now() { return FIXED; }
}
globalThis.Date = FrozenDate;
