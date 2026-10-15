import assert from "node:assert/strict";
import test from "node:test";
import { validateDateOfBirth } from "../src/utils/validators.js";

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