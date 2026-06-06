export function calculateAttendanceRecovery(attendedClasses: number, totalClasses: number, targetPct = 75) {
  if (totalClasses <= 0 || attendedClasses < 0 || attendedClasses > totalClasses) {
    throw new Error("Invalid attendance inputs");
  }
  if (targetPct <= 0 || targetPct >= 100) {
    throw new Error("targetPct must be between 0 and 100");
  }
  let classesNeeded = 0;
  while (((attendedClasses + classesNeeded) / (totalClasses + classesNeeded)) * 100 < targetPct) {
    classesNeeded += 1;
  }
  return {
    classesNeeded,
    targetPct,
    currentPct: (attendedClasses / totalClasses) * 100
  };
}
