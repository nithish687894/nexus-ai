export function roundTo(value: number, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
