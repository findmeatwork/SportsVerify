export function validateRequired(value, fieldName = "This field") {
  if (value === null || value === undefined || String(value).trim() === "") {
    return `${fieldName} is required.`;
  }
  return "";
}

export function validateDateOfBirth(value) {
  if (!value) return "Date of birth is required.";

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "Enter a valid date of birth.";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    return "Enter a valid date of birth.";
  }

  const now = new Date();
  const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
  if (value > today) {
    return "Date of birth cannot be in the future.";
  }
  return "";
}