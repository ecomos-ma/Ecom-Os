type Position = [number, number];

const pointKey = ([lng, lat]: Position) => `${lng},${lat}`;
const edgeKey = (a: Position, b: Position) => [pointKey(a), pointKey(b)].sort().join("|");

/** Dissolve a shared boundary between two adjacent, single-ring GeoJSON polygons. */
export function mergeAdjacentGeoPolygons(first: Position[], second: Position[]): Position[] | null {
  const edges = new Map<string, [Position, Position]>();
  for (const ring of [first, second]) {
    for (let index = 0; index < ring.length - 1; index += 1) {
      const start = ring[index];
      const end = ring[index + 1];
      const key = edgeKey(start, end);
      if (edges.has(key)) edges.delete(key);
      else edges.set(key, [start, end]);
    }
  }

  const adjacent = new Map<string, Position[]>();
  for (const [start, end] of edges.values()) {
    adjacent.set(pointKey(start), [...(adjacent.get(pointKey(start)) ?? []), end]);
    adjacent.set(pointKey(end), [...(adjacent.get(pointKey(end)) ?? []), start]);
  }
  if (!adjacent.size || [...adjacent.values()].some((neighbors) => neighbors.length !== 2)) return null;

  const start = edges.values().next().value?.[0] as Position | undefined;
  if (!start) return null;
  const outline = [start];
  let previous = "";
  let current = start;
  while (outline.length <= edges.size + 1) {
    const neighbors = adjacent.get(pointKey(current)) ?? [];
    const next = neighbors.find((point) => pointKey(point) !== previous);
    if (!next) return null;
    if (pointKey(next) === pointKey(start)) {
      outline.push(start);
      return outline.length === edges.size + 1 ? outline : null;
    }
    previous = pointKey(current);
    current = next;
    outline.push(next);
  }
  return null;
}
