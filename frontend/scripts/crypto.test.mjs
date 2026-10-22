import assert from "node:assert/strict";
import test from "node:test";
import {
  computeCommitment,
  computeDobHash,
  generateParticipantId,
  generateSalt,
  hashBytes,
  normalizeDob,
} from "../src/utils/participant.js";

test("normalizeDob normalizes valid dates and rejects invalid or future dates", () => {
  assert.equal(normalizeDob("2000-01-01"), "2000-01-01");
  assert.equal(normalizeDob("1995-12-31"), "1995-12-31");

  assert.throws(() => normalizeDob("not-a-date"), RangeError);
  assert.throws(() => normalizeDob("2000/01/01"), RangeError);
  assert.throws(() => normalizeDob("2001-02-29"), RangeError);
  assert.throws(() => normalizeDob(12345), TypeError);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = [
    tomorrow.getFullYear(),
    String(tomorrow.getMonth() + 1).padStart(2, "0"),
    String(tomorrow.getDate()).padStart(2, "0"),
  ].join("-");
  assert.throws(() => normalizeDob(tomorrowStr), RangeError);
});

test("computeDobHash is deterministic and changes when inputs vary", () => {
  const eventId = 1;
  const participantId = generateParticipantId();
  const salt2 = generateSalt();
  const dob = "2000-05-15";

  const hash1 = computeDobHash(eventId, participantId, dob, salt2);
  const hash2 = computeDobHash(eventId, participantId, dob, salt2);
  assert.equal(hash1, hash2);
  assert.match(hash1, /^0x[0-9a-fA-F]{64}$/);

  const differentSaltHash = computeDobHash(eventId, participantId, dob, generateSalt());
  assert.notEqual(hash1, differentSaltHash);

  const differentDobHash = computeDobHash(eventId, participantId, "2000-05-16", salt2);
  assert.notEqual(hash1, differentDobHash);
});

test("hashBytes is deterministic for byte buffers", () => {
  const sampleBytes = new TextEncoder().encode("sportsverify-evidence-payload");
  const hash1 = hashBytes(sampleBytes);
  const hash2 = hashBytes(sampleBytes);

  assert.equal(hash1, hash2);
  assert.match(hash1, /^0x[0-9a-fA-F]{64}$/);

  const differentBytes = new TextEncoder().encode("different-payload");
  assert.notEqual(hash1, hashBytes(differentBytes));
});

test("computeCommitment is deterministic", () => {
  const eventId = 1;
  const participantId = generateParticipantId();
  const salt = generateSalt();

  const c1 = computeCommitment(eventId, participantId, salt);
  const c2 = computeCommitment(eventId, participantId, salt);
  assert.equal(c1, c2);
  assert.match(c1, /^0x[0-9a-fA-F]{64}$/);
});

