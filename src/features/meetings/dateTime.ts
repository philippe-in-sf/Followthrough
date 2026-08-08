function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function toApiDateTime(value: string) {
  const [datePart, timePart = "00:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, second).toISOString();
}

export function toApiMeetingDateTime(value: string, precision: "date" | "datetime") {
  if (precision === "date") {
    const datePart = value.split("T")[0];
    return `${datePart}T12:00:00.000Z`;
  }
  return toApiDateTime(value);
}

export function toDateTimeInputValue(value: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const dateValue = [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
  const timeValue = [padDatePart(date.getHours()), padDatePart(date.getMinutes())].join(":");
  return `${dateValue}T${timeValue}`;
}

export function toMeetingInputValue(value: string, precision: "date" | "datetime") {
  return precision === "date" ? value.slice(0, 10) : toDateTimeInputValue(value);
}
