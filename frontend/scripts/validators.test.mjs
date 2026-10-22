import assert from "node:assert/strict";
import test from "node:test";
import {
  validateDateOfBirth,
  validateEventDeadline,
  validateIdNumber,
  validateImageFile,
  validateName,
  validateRegistrationDeadline,
} from "../src/utils/validators.js";

test("accepts a valid HTML date value", () => {
  assert.equal(validateDateOfBirth("2009-04-15"), "");
});

test("requires a date of birth", () => {
  assert.equal(validateDateOfBirth(""), "Date of birth is required.");
});

test("rejects malformed and impossible calendar dates", () => {
  assert.equal(validateDateOfBirth("15/04/2009"), "Enter a valid date of birth.");
  assert.equal(validateDateOfBirth("2009-02-30"), "Enter a valid date of birth.");
});

test("rejects a future date", () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowValue = [tomorrow.getFullYear(), tomorrow.getMonth() + 1, tomorrow.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");

  assert.equal(validateDateOfBirth(tomorrowValue), "Date of birth cannot be in the future.");
});

test("validates event deadline must be in the future", () => {
  const now = 1000;
  assert.equal(validateEventDeadline("", now), "Event deadline is required.");
  assert.equal(validateEventDeadline(900, now), "Event deadline must be in the future.");
  assert.equal(validateEventDeadline(1000, now), "Event deadline must be in the future.");
  assert.equal(validateEventDeadline(1100, now), "");
});

test("validates registration deadline is optional and properly bounded", () => {
  const now = 1000;
  assert.equal(validateRegistrationDeadline("", 2000, now), "");
  assert.equal(validateRegistrationDeadline(0, 2000, now), "");
  assert.equal(validateRegistrationDeadline(900, 2000, now), "Registration deadline must be in the future.");
  assert.equal(validateRegistrationDeadline(2500, 2000, now), "Registration deadline cannot be after the event deadline.");
  assert.equal(validateRegistrationDeadline(1500, 2000, now), "");
});

test("validates name length", () => {
  assert.equal(validateName(""), "Name is required.");
  assert.equal(validateName("   "), "Name is required.");
  assert.equal(validateName("A".repeat(101)), "Name must be between 1 and 100 characters.");
  assert.equal(validateName("Alice"), "");
});

test("validates ID number length", () => {
  assert.equal(validateIdNumber(""), "ID number is required.");
  assert.equal(validateIdNumber("12"), "ID number must be between 3 and 64 characters.");
  assert.equal(validateIdNumber("A".repeat(65)), "ID number must be between 3 and 64 characters.");
  assert.equal(validateIdNumber("AB123456C"), "");
});

test("validates image file type and size", () => {
  assert.equal(validateImageFile(null), "File is required.");
  assert.equal(
    validateImageFile({ type: "application/pdf", size: 1000 }),
    "File must be a JPEG, PNG, or WebP image.",
  );
  assert.equal(
    validateImageFile({ type: "image/jpeg", size: 6 * 1024 * 1024 }),
    "File size cannot exceed 5 MB.",
  );
  assert.equal(validateImageFile({ type: "image/png", size: 2 * 1024 * 1024 }), "");
  assert.equal(validateImageFile({ type: "image/webp", size: 500 }), "");
});
