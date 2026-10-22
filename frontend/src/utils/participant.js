import { AbiCoder, hexlify, keccak256, randomBytes } from "ethers";

const bytes32Pattern = /^0x[0-9a-fA-F]{64}$/;
const abiCoder = AbiCoder.defaultAbiCoder();

export function generateParticipantId() {
  return hexlify(randomBytes(32));
}

export function generateSalt() {
  return hexlify(randomBytes(32));
}

export function computeCommitment(eventId, participantId, salt) {
  if (!isValidBytes32(participantId) || !isValidBytes32(salt)) {
    throw new TypeError("Participant ID and salt must be 32-byte hexadecimal values.");
  }
  return keccak256(abiCoder.encode(["uint256", "bytes32", "bytes32"], [eventId, participantId, salt]));
}

export function isValidBytes32(value) {
  return typeof value === "string" && bytes32Pattern.test(value);
}