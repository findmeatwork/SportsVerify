export function validateRequired(value, fieldName = "This field") {
  if (value === null || value === undefined || String(value).trim() === "") {
    return `${fieldName} is required.`;
  }
  return "";
}

export function validateDateOfBirth(value) {
  if (!value) return "Date of birth is required.";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return "Enter a valid date of birth.";
  }
  if (date.getTime() > new Date().setHours(0, 0, 0, 0)) {
    return "Date of birth cannot be in the future.";
  }
  return "";
}