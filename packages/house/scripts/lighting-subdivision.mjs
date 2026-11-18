// Allocate by sample spacing before surface area. A tall, narrow wall needs
// interior samples just as much as a broad wall: its original corner values
// otherwise spread floor/ceiling occlusion over the entire face.
export function allocateLightingSubdivision(candidates, budget, ambientSpacing) {
  const architectural = candidates.filter(candidate => candidate.priority > 0);
  let spacing = ambientSpacing;
  const levelAt = (candidate, target) => Math.min(candidate.level,
    Math.max(0, Math.ceil(Math.log2(candidate.maxEdge / target))));
  const costAt = target => architectural.reduce((sum, candidate) => sum + 4 ** levelAt(candidate, target) - 1, 0);
  // If the house changes, relax spacing for every architectural face together
  // instead of leaving small faces unrefined after large ones consume the cap.
  while (costAt(spacing) > budget) spacing *= 1.05;
  let remaining = budget;
  for (const candidate of architectural) {
    const level = levelAt(candidate, spacing);
    candidate.levels[candidate.triangleIndex] = level;
    remaining -= 4 ** level - 1;
  }
  // Spend the remainder on broad fixture-lit furnishings/floors. Do not give
  // arbitrary architectural panels a different spacing from their neighbors.
  const furnishings = candidates.filter(candidate => candidate.priority === 0).sort((a, b) => b.area - a.area);
  for (const candidate of furnishings) {
    const cost = 4 ** candidate.level - 1;
    if (remaining < cost) continue;
    candidate.levels[candidate.triangleIndex] = candidate.level;
    remaining -= cost;
  }
  return { spacing, addedTriangles: budget - remaining };
}
