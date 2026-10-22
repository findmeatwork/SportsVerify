import { AbiCoder, hexlify, keccak256, randomBytes } from "ethers";

const bytes32Pattern = /^0x[0-9a-fA-F]{64}$/;
const dobPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const abiCoder = AbiCoder.defaultAbiCoder();

export function generateParticipantId() {
  return hexlify(randomBytes(32));
}

export function generateSalt() {
  return hexlify(randomBytes(32));
}

export function isValidBytes32(value) {
  return typeof value === "string" && bytes32Pattern.test(value);
}

export function normalizeDob(dateString) {
  if (typeof dateString !== "string") {
    throw new TypeError("Date of birth must be a string.");
  }

  const match = dobPattern.exec(dateString);
  if (!match) {
    throw new RangeError("Date of birth must be formatted as YYYY-MM-DD.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    throw new RangeError("Invalid calendar date.");
  }

  const now = new Date();
  const todayString = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  if (dateString > todayString) {
    throw new RangeError("Date of birth cannot be in the future.");
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function computeCommitment(eventId, participantId, salt) {
  if (!isValidBytes32(participantId) || !isValidBytes32(salt)) {
    throw new TypeError("Participant ID and salt must be 32-byte hexadecimal values.");
  }
  return keccak256(abiCoder.encode(["uint256", "bytes32", "bytes32"], [eventId, participantId, salt]));
}

export function computeDobHash(eventId, participantId, dob, salt2) {
  if (!isValidBytes32(participantId) || !isValidBytes32(salt2)) {
    throw new TypeError("Participant ID and salt2 must be 32-byte hexadecimal values.");
  }
  const normalizedDob = normalizeDob(dob);
  return keccak256(
    abiCoder.encode(
      ["uint256", "bytes32", "string", "bytes32"],
      [eventId, participantId, normalizedDob, salt2],
    ),
  );
}

export function hashBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("hashBytes requires a Uint8Array.");
  }
  return keccak256(bytes);
}
