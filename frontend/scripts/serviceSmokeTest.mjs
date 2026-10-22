import assert from "node:assert/strict";
import { Contract, JsonRpcProvider } from "ethers";

process.env.VITE_TARGET_CHAIN = "localhost";

const { default: deployment } = await import("../src/config/contract.json", { with: { type: "json" } });
const { default: registryAbi } = await import("../src/config/SportsPlayerRegistry.abi.json", { with: { type: "json" } });
const { rpcUrl } = await import("../src/config/network.js");
const { computeCommitment, computeDobHash, generateParticipantId, generateSalt } = await import("../src/utils/participant.js");
const { mapBlockchainError } = await import("../src/services/blockchain/errorMapper.js");

const provider = new JsonRpcProvider(rpcUrl, 31337);
const organizer = await provider.getSigner(0);
const participant = await provider.getSigner(1);
const nonOrganizer = await provider.getSigner(2);
const contract = new Contract(deployment.address, registryAbi, provider);

const EXPECTED_DUPLICATE_MESSAGE = "This participant is already registered for the event.";
const EXPECTED_UNAUTHORIZED_MESSAGE = "This wallet is not authorized to perform that action.";

function normalizeForJson(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalizeForJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeForJson(nestedValue)])
    );
  }
  return value;
}

function printStep(step, label, data) {
  console.log(`STEP ${step} ${label}: ${JSON.stringify(normalizeForJson(data))}`);
}

async function requireDeployedCode() {
  const code = await provider.getCode(deployment.address);
  if (!code || code === "0x") {
    throw new Error(`No code deployed at ${deployment.address} on ${rpcUrl}`);
  }
}

let currentStep = 0;

try {
  await requireDeployedCode();
  printStep(0, "ROOM_CHECK", {
    rpcUrl,
    address: deployment.address,
    organizer: await organizer.getAddress(),
    participant: await participant.getAddress(),
    nonOrganizer: await nonOrganizer.getAddress(),
  });

  currentStep = 1;
  const eventName = `Smoke ${Date.now()}`;
  const nowUnix = Math.floor(Date.now() / 1000);
  const registrationDeadline = nowUnix + 3600;
  const eventDeadline = nowUnix + 7200;
  const beforeCount = Number(await contract.getEventCount());
  printStep(currentStep, "BEFORE", { organizer: await organizer.getAddress(), eventName, registrationDeadline, eventDeadline, beforeCount });
  const txCreate = await contract.connect(organizer).createEvent(eventName, eventDeadline, registrationDeadline);
  const receiptCreate = await txCreate.wait();
  const afterCount = Number(await contract.getEventCount());
  const eventId = afterCount;
  printStep(currentStep, "AFTER", { txHash: receiptCreate.hash, eventId, afterCount, blockNumber: receiptCreate.blockNumber });

  currentStep = 2;
  const participantId = generateParticipantId();
  const salt = generateSalt();
  const salt2 = generateSalt();
  const commitment = computeCommitment(eventId, participantId, salt);
  const dobHash = computeDobHash(eventId, participantId, "2000-01-01", salt2);
  const hasAffiliation = false;
  printStep(currentStep, "BEFORE", { participant: await participant.getAddress(), eventId, participantId, commitment, salt, dobHash });
  const txRegister = await contract.connect(participant).registerParticipant(eventId, participantId, commitment, dobHash, hasAffiliation);
  const receiptRegister = await txRegister.wait();
  printStep(currentStep, "AFTER", { txHash: receiptRegister.hash, blockNumber: receiptRegister.blockNumber, eventId, participantId, commitment });

  currentStep = 3;
  const participantRecord = await contract.getParticipant(eventId, participantId);
  printStep(currentStep, "RESULT", { participantRecord });

  currentStep = 4;
  const correctVerify = await contract.verifyCommitment(eventId, participantId, commitment);
  printStep(currentStep, "RESULT", { correctVerify, expected: true });
  assert.equal(correctVerify, true, "verifyCommitment should return true for the correct salt");

  currentStep = 5;
  const wrongSalt = `0x${"11".repeat(32)}`;
  const wrongVerify = await contract.verifyCommitment(eventId, participantId, wrongSalt);
  printStep(currentStep, "RESULT", { wrongVerify, expected: false, wrongSalt });
  assert.equal(wrongVerify, false, "verifyCommitment should return false for the wrong salt");

  currentStep = 6;
  const participantLogs = await contract.queryFilter(contract.filters.ParticipantRegistered(eventId, participantId));
  const lastLog = participantLogs[participantLogs.length - 1];
  const foundTx = {
    txHash: lastLog?.transactionHash,
    blockNumber: lastLog?.blockNumber,
    timestamp: Number((await provider.getBlock(lastLog.blockNumber)).timestamp),
  };
  printStep(currentStep, "RESULT", { foundTx, expectedMatchTxHash: receiptRegister.hash, expectedMatchBlock: receiptRegister.blockNumber });
  assert.equal(foundTx.txHash, receiptRegister.hash, "findRegistrationTx should return the registration tx hash");
  assert.equal(foundTx.blockNumber, receiptRegister.blockNumber, "findRegistrationTx should return matching block number");

  currentStep = 7;
  let duplicateFriendly = "";
  try {
    await contract.connect(participant).registerParticipant(eventId, participantId, commitment, dobHash, hasAffiliation);
    throw new Error("duplicate registerParticipant unexpectedly succeeded");
  } catch (error) {
    duplicateFriendly = mapBlockchainError(error);
    printStep(currentStep, "EXPECTED_FAILURE", { message: duplicateFriendly, expected: EXPECTED_DUPLICATE_MESSAGE });
    assert.equal(duplicateFriendly, EXPECTED_DUPLICATE_MESSAGE, `Expected duplicate error to map to: ${EXPECTED_DUPLICATE_MESSAGE}`);
  }

  currentStep = 8;
  let unauthorizedFriendly = "";
  try {
    await contract.connect(nonOrganizer).createEvent(`Unauthorized ${Date.now()}`, eventDeadline, registrationDeadline);
    throw new Error("non-organizer createEvent unexpectedly succeeded");
  } catch (error) {
    unauthorizedFriendly = mapBlockchainError(error);
    printStep(currentStep, "EXPECTED_FAILURE", { message: unauthorizedFriendly, expected: EXPECTED_UNAUTHORIZED_MESSAGE });
    assert.equal(unauthorizedFriendly, EXPECTED_UNAUTHORIZED_MESSAGE, `Expected unauthorized error to map to: ${EXPECTED_UNAUTHORIZED_MESSAGE}`);
  }

  currentStep = 9;
  const onChainCommitment = (await contract.getParticipant(eventId, participantId)).commitment;
  printStep(currentStep, "RESULT", { onChainCommitment, offChainCommitment: commitment, equal: onChainCommitment.toLowerCase() === commitment.toLowerCase() });
  assert.equal(onChainCommitment.toLowerCase(), commitment.toLowerCase(), "Off-chain computeCommitment must equal on-chain stored commitment");

  console.log("ALL 9 STEPS PASS");
  process.exitCode = 0;
} catch (error) {
  console.error(`STEP ${currentStep} FAILED: ${error?.message || String(error)}`);
  console.error(error?.stack || error);
  process.exitCode = 1;
}
