export function generateNotification(subject: string, time: string) {
  return {
    category: "class_reminder",
    subject,
    time,
    message: `${subject} reminder set for ${time}.`
  };
}
