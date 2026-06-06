export function calculateMarksTarget(
  currentMarks: number,
  maxCurrentMarks: number,
  targetTotal: number,
  remainingMaxMarks: number
) {
  if ([currentMarks, maxCurrentMarks, targetTotal, remainingMaxMarks].some((value) => value < 0)) {
    throw new Error("Marks inputs must be non-negative");
  }
  if (currentMarks > maxCurrentMarks) {
    throw new Error("currentMarks cannot exceed maxCurrentMarks");
  }
  const requiredMarks = Math.max(0, targetTotal - currentMarks);
  const impossible = requiredMarks > remainingMaxMarks;
  return {
    requiredMarks,
    remainingMaxMarks,
    impossible,
    message: impossible
      ? `Need ${requiredMarks}, but only ${remainingMaxMarks} marks are remaining.`
      : `Need ${requiredMarks} out of the remaining ${remainingMaxMarks}.`
  };
}
