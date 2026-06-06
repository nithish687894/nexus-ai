type Subject = {
  name: string;
  attendance_pct?: number;
  next_class_time?: string;
  is_lab?: boolean;
};

type Mark = {
  subject: string;
  current_internal: number;
  max_internal: number;
};

export type StudyContext = {
  subjects?: Subject[];
  marks?: Mark[];
  timetable_today?: Array<{ subject: string; time?: string; type?: string }>;
};

export function generateStudyPlan(context: StudyContext = {}) {
  const subjects = context.subjects ?? [];
  const marks = context.marks ?? [];
  const lowAttendance = subjects
    .filter((subject) => typeof subject.attendance_pct === "number" && subject.attendance_pct < 75)
    .sort((a, b) => (a.attendance_pct ?? 100) - (b.attendance_pct ?? 100))[0];
  if (lowAttendance?.next_class_time) {
    return {
      prioritySubject: lowAttendance.name,
      reason: "Low attendance subject has an upcoming class.",
      plan: ["Attend the next class", "30 min revise notes", "20 min solve PYQs"]
    };
  }

  const lowMarks = marks
    .map((mark) => ({ ...mark, pct: mark.max_internal ? mark.current_internal / mark.max_internal : 1 }))
    .sort((a, b) => a.pct - b.pct)[0];
  if (lowMarks && lowMarks.pct < 0.7) {
    return {
      prioritySubject: lowMarks.subject,
      reason: "Internal marks need the fastest recovery.",
      plan: ["30 min revise weak units", "20 min solve previous questions", "10 min list doubts"]
    };
  }

  const lab = subjects.find((subject) => subject.is_lab);
  if (lab) {
    return {
      prioritySubject: lab.name,
      reason: "Lab/practical work is easier to lose marks in if ignored.",
      plan: ["Review experiment steps", "Prepare observation notes", "Check viva questions"]
    };
  }

  return {
    prioritySubject: context.timetable_today?.[0]?.subject ?? subjects[0]?.name ?? "Today",
    reason: "Balanced fallback plan.",
    plan: ["30 min revise notes", "20 min solve PYQs", "10 min plan tomorrow"]
  };
}
