export function validateRequired(value, fieldName = "This field") {
  if (value === null || value === undefined || String(value).trim() === "") {
    return `${fieldName} is required.`;
  }
  return "";
}

/** Validate a date of birth in YYYY-MM-DD format and not in future */
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
  if (value > today) return "Date of birth cannot be in the future.";
  return "";
}

/** Validate that an event deadline (unix timestamp) is in the future */
export function validateEventDeadline(eventDeadline) {
  if (!eventDeadline) return "Event deadline is required.";
  const now = Math.floor(Date.now() / 1000);
  if (eventDeadline <= now) return "Event deadline must be in the future.";
  return "";
}

/** Validate registration deadline relative to event deadline */
export function validateRegistrationDeadline(eventDeadline, registrationDeadline) {
  if (!registrationDeadline) return ""; // 0 means no deadline
  const now = Math.floor(Date.now() / 1000);
  if (registrationDeadline <= now) return "Registration deadline must be in the future.";
  if (registrationDeadline > eventDeadline) return "Registration deadline cannot be after the event deadline.";
  return "";
}

/** Validate name length (3‑64 characters) */
export function validateName(name) {
  if (!name) return "Name is required.";
  const len = String(name).length;
  if (len < 3) return "Name must be at least 3 characters.";
  if (len > 64) return "Name cannot exceed 64 characters.";
  return "";
}

/** Validate ID length (3‑64 characters) */
export function validateId(id) {
  if (!id) return "ID is required.";
  const len = String(id).length;
  if (len < 3) return "ID must be at least 3 characters.";
  if (len > 64) return "ID cannot exceed 64 characters.";
  return "";
}

/** Validate image mime type and size (≤5 MiB) */
export function validateImage(mimeType, byteSize) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(mimeType)) return "Unsupported image type. Must be JPEG, PNG or WebP.";
  const maxBytes = 5 * 1024 * 1024;
  if (byteSize > maxBytes) return "Image size exceeds 5 MiB limit.";
  return "";
}
