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

export function validateEventDeadline(eventDeadline, nowUnix = Math.floor(Date.now() / 1000)) {
  if (eventDeadline === null || eventDeadline === undefined || eventDeadline === "") {
    return "Event deadline is required.";
  }
  const numericDeadline = Number(eventDeadline);
  if (!Number.isFinite(numericDeadline) || numericDeadline <= nowUnix) {
    return "Event deadline must be in the future.";
  }
  return "";
}

export function validateRegistrationDeadline(
  registrationDeadline,
  eventDeadline,
  nowUnix = Math.floor(Date.now() / 1000),
) {
  if (
    registrationDeadline === null
    || registrationDeadline === undefined
    || registrationDeadline === ""
    || Number(registrationDeadline) === 0
  ) {
    return "";
  }

  const numericRegDeadline = Number(registrationDeadline);
  if (!Number.isFinite(numericRegDeadline) || numericRegDeadline <= nowUnix) {
    return "Registration deadline must be in the future.";
  }

  if (eventDeadline) {
    const numericEventDeadline = Number(eventDeadline);
    if (Number.isFinite(numericEventDeadline) && numericRegDeadline > numericEventDeadline) {
      return "Registration deadline cannot be after the event deadline.";
    }
  }

  return "";
}

export function validateName(name, minLength = 1, maxLength = 100) {
  if (name === null || name === undefined || String(name).trim() === "") {
    return "Name is required.";
  }
  const trimmedLength = String(name).trim().length;
  if (trimmedLength < minLength || trimmedLength > maxLength) {
    return `Name must be between ${minLength} and ${maxLength} characters.`;
  }
  return "";
}

export function validateIdNumber(idNumber, minLength = 3, maxLength = 64) {
  if (idNumber === null || idNumber === undefined || String(idNumber).trim() === "") {
    return "ID number is required.";
  }
  const trimmedLength = String(idNumber).trim().length;
  if (trimmedLength < minLength || trimmedLength > maxLength) {
    return `ID number must be between ${minLength} and ${maxLength} characters.`;
  }
  return "";
}

export function validateImageFile(file, maxBytes = 5 * 1024 * 1024) {
  if (!file) {
    return "File is required.";
  }
  const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (file.type && !allowedMimeTypes.includes(file.type.toLowerCase())) {
    return "File must be a JPEG, PNG, or WebP image.";
  }
  if (file.size && file.size > maxBytes) {
    return "File size cannot exceed 5 MB.";
  }
  return "";
}
