// The web chart uses five adaptive ticks and a zero baseline for traffic counts.
export function webAnalyticsTicks(peak: number) {
  if (peak <= 0) return [0, 1, 2, 3, 4];
  const roughStep = peak / 4;
  const power = Math.floor(Math.log10(roughStep)) + 1;
  const increment = 10 ** power * (power === 1 ? 0.1 : 0.05);
  const step = Math.ceil(roughStep / increment - 1e-10) * increment;
  return Array.from({ length: 5 }, (_, index) => Number((index * step).toPrecision(12)));
}

// Preserve the latest date and omit labels that would overlap their neighbours.
export function webAnalyticsDateTicks(labels: string[], left: number, right: number) {
  const ticks: { index: number; x: number }[] = [];
  let available = right;
  for (let index = labels.length - 1; index >= 0; index -= 1) {
    const halfWidth = labels[index].length * 3.5;
    const coordinate = labels.length === 1 ? (left + right) / 2 : left + (right - left) * index / (labels.length - 1);
    const x = index === labels.length - 1 ? Math.min(coordinate, right - halfWidth) : coordinate;
    if (x - halfWidth >= left && x + halfWidth <= available) {
      ticks.push({ index, x });
      available = x - halfWidth - 20;
    }
  }
  return ticks.reverse();
}

// The dates have even horizontal spacing. Steffen tangents keep a curved line
// between observations within their range, including at turns and plateaus.
export function monotonePath(points: { x: number; y: number }[]) {
  const [first] = points;
  if (!first) return "";
  const start = `M ${first.x} ${first.y}`;
  if (points.length < 3) return points[1] ? `${start} L ${points[1].x} ${points[1].y}` : start;

  const slopes = points.slice(1).map((point, index) => point.y - points[index].y);
  const tangents = slopes.slice(1).map((right, index) => {
    const left = slopes[index];
    return (Math.sign(left) + Math.sign(right)) * Math.min(Math.abs(left), Math.abs(right), Math.abs(left + right) / 4);
  });
  tangents.unshift((3 * slopes[0] - tangents[0]) / 2);
  tangents.push((3 * slopes.at(-1)! - tangents.at(-1)!) / 2);

  return [start, ...points.slice(1).map((point, index) => {
    const previous = points[index];
    const third = (point.x - previous.x) / 3;
    return `C ${previous.x + third} ${previous.y + tangents[index] / 3} ${point.x - third} ${point.y - tangents[index + 1] / 3} ${point.x} ${point.y}`;
  })].join(" ");
}
