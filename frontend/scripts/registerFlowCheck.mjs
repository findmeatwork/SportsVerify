import assert from "node:assert/strict";
import { JsonRpcProvider, Wallet } from "ethers";
import { computeCommitment, computeDobHash, generateParticipantId, generateSalt } from "../src/utils/participant.js"; from "../src/utils/participant.js";
import { createEvent, getParticipant, registerParticipant, verifyCommitment } from "../src/services/blockchain/contractService.js";

const rpcUrl = process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
const organizerPrivateKey = process.env.LOCAL_ORGANIZER_PRIVATE_KEY;
const participantPrivateKey = process.env.LOCAL_PARTICIPANT_PRIVATE_KEY;

if (!organizerPrivateKey || !participantPrivateKey) {
  console.error("Set LOCAL_ORGANIZER_PRIVATE_KEY and LOCAL_PARTICIPANT_PRIVATE_KEY to Hardhat account #0 and #1 keys.");
  process.exit(1);
}

const provider = new JsonRpcProvider(rpcUrl, 31337);
const organizer = new Wallet(organizerPrivateKey, provider);
const participant = new Wallet(participantPrivateKey, provider);

try {
  const eventName = `Flow check ${Date.now()}`;
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const created = await createEvent(eventName, deadline, organizer);
  const eventsContract = await import("../src/services/blockchain/contractService.js");
  const eventList = await eventsContract.getEvents();
  const event = eventList.find((candidate) => candidate.name === eventName);
  assert.ok(event, "created event should be retrievable");

    const participantId = generateParticipantId();
  const salt = generateSalt();
  const dob = "1990-01-01"; // example DOB
  const dobHash = computeDobHash(event.id, participantId, dob, salt);
  const commitment = computeCommitment(event.id, participantId, salt);
  const registration = await registerParticipant(event.id, participantId, commitment, dobHash, false, participant);
  const record = await getParticipant(event.id, participantId);
  const verified = await verifyCommitment(event.id, participantId, commitment);

  const salt = generateSalt();
  const commitment = computeCommitment(event.id, participantId, salt);
  const registration = await registerParticipant(event.id, participantId, commitment, participant);
  const record = await getParticipant(event.id, participantId);
  const verified = await verifyCommitment(event.id, participantId, commitment);

  assert.equal(record.participantId.toLowerCase(), participantId.toLowerCase(), "stored participant reference must match");
  assert.equal(record.commitment.toLowerCase(), commitment.toLowerCase(), "stored commitment must match");
  assert.equal(verified, true, "on-chain commitment verification must pass");

  console.log("REGISTER FLOW PASS");
  console.log(JSON.stringify({
    rpcUrl,
    eventId: event.id,
    eventName,
    organizer: await organizer.getAddress(),
    participant: await participant.getAddress(),
    participantId,
    salt,
    commitment,
    createTxHash: created.txHash,
    registerTxHash: registration.txHash,
    blockNumber: registration.blockNumber,
    storedParticipantId: record.participantId,
    storedCommitment: record.commitment,
    verifyCommitment: verified,
  }, null, 2));
} catch (error) {
  console.error("REGISTER FLOW FAIL");
  console.error(error?.stack || error);
  process.exitCode = 1;
} finally {
  await provider.destroy();
}
