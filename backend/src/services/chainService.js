// src/services/chainService.js
import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import { config } from "../config/env.js";

/**
 * Load the contract ABI (the file lives in backend/src/config).
 */
const abiPath = path.resolve(import.meta.dirname, "../config/SportsPlayerRegistry.abi.json");
const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));

/**
 * Load the contract deployment info (address, chainId, etc.) from the JSON file
 * referenced by the CONTRACT_JSON env var. The file lives in the frontend
 * (`frontend/src/config/contract.json`), but the path is supplied via env.
 */
let contractInfo = {};
try {
  const contractJsonPath = path.resolve(import.meta.dirname, "../../", config.CONTRACT_JSON);
  contractInfo = JSON.parse(fs.readFileSync(contractJsonPath, "utf8"));
} catch (e) {
  console.error("❌ Cannot read contract JSON:", e.message);
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Provider & contract validation                                              */
/* -------------------------------------------------------------------------- */
const provider = new ethers.JsonRpcProvider(config.RPC_URL);

/**
 * Verify that the provider is on the expected chain and that the contract JSON
 * matches that chain. Throw a clear error if anything is mismatched.
 */
async function validateProviderAndContract() {
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== config.CHAIN_ID) {
    throw new Error(
      `Provider chainId (${network.chainId}) does not match expected CHAIN_ID (${config.CHAIN_ID})`
    );
  }
  if (Number(contractInfo.chainId) !== config.CHAIN_ID) {
    throw new Error(
      `Contract config chainId (${contractInfo.chainId}) does not match expected CHAIN_ID (${config.CHAIN_ID})`
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Contract instance (read‑only)                                              */
/* -------------------------------------------------------------------------- */
let contract; // will be created after validation

async function init() {
  await validateProviderAndContract();
  contract = new ethers.Contract(contractInfo.address, abi, provider);
}
// Removed automatic initialization on import. Users should call init() before using the service.
export { init };

// If init is not called, the exported functions will throw an error when accessed.


/* -------------------------------------------------------------------------- */
/* Helper utilities (raw data conversion)                                     */
/* -------------------------------------------------------------------------- */
function cleanResult(result) {
  // ethers.js can return BigNumber objects – convert them to strings for JSON safety
  return JSON.parse(
    JSON.stringify(result, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );
}

/* -------------------------------------------------------------------------- */
/* Public read helpers (as described in CHANGES.md)                           */
/* -------------------------------------------------------------------------- */

/**
 * Returns the raw event data for a given eventId, or `null` if not found.
 */
export async function getEvent(eventId) {
  try {
    const ev = await contract.getEvent(eventId);
    return cleanResult(ev);
  } catch {
    return null;
  }
}

/**
 * Returns the event status (as a string) for a given eventId, or `null`.
 */
export async function getEventStatus(eventId) {
  const ev = await getEvent(eventId);
  return ev ? ev.status : null;
}

/**
 * Returns `true` if the event has ended (`status === "ENDED"`), otherwise `false`.
 */
export async function hasEventEnded(eventId) {
  const status = await getEventStatus(eventId);
  return status === "ENDED";
}

/**
 * Returns registration data for a participant in an event, or `null`.
 */
export async function getRegistration(eventId, participantId) {
  try {
    const reg = await contract.getRegistration(eventId, participantId);
    return cleanResult(reg);
  } catch {
    return null;
  }
}

/**
 * Returns an array of verification objects for a participant in an event.
 */
export async function getVerifications(eventId, participantId) {
  try {
    const verifs = await contract.getVerifications(eventId, participantId);
    return cleanResult(verifs);
  } catch {
    return [];
  }
}

/**
 * Returns `true` if the address is a verifier for the event, otherwise `false`.
 */
export async function isVerifier(eventId, address) {
  try {
    return await contract.isVerifier(eventId, address);
  } catch {
    return false;
  }
}

/**
 * Returns `true` if the address holds the organizer role in the contract.
 */
export async function hasOrganizerRole(address) {
  try {
    return await contract.hasOrganizerRole(address);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Log‑query helpers (using `queryFilter`)                                    */
/* -------------------------------------------------------------------------- */

/**
 * Helper to query logs from the deployment block onward.
 */
async function queryFromDeployment(filter) {
  const fromBlock = contractInfo.deploymentBlockNumber || 0;
  const latest = await provider.getBlockNumber();
  return await contract.queryFilter(filter, fromBlock, latest);
}

/**
 * Returns an array of event IDs created by a given organizer address.
 */
export async function getEventsOrganizedBy(address) {
  const filter = contract.filters.EventCreated(null, address); // indexed organizer is the second param
  const logs = await queryFromDeployment(filter);
  return logs.map((log) => log.args.eventId);
}

/**
 * Returns an array of event IDs where the address is a verifier.
 */
export async function getEventsWhereVerifier(address) {
  const filter = contract.filters.VerifierAdded(null, address); // indexed verifier is the second param
  const logs = await queryFromDeployment(filter);
  const candidateIds = logs.map((log) => log.args.eventId);
  // Verify each event really has the address as a verifier (defensive)
  const result = [];
  for (const id of candidateIds) {
    if (await isVerifier(id, address)) {
      result.push(id);
    }
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Transaction verification helpers                                           */
/* -------------------------------------------------------------------------- */
import { AppError } from "../utils/errors.js";

export async function verifyVerifierAddedTx(txHash, { eventId, verifier, addedBy }) {
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    throw new AppError(404, "TX_NOT_FOUND", "Transaction receipt not found");
  }
  if (receipt.status !== 1) {
    throw new AppError(400, "TX_NOT_FOUND", "Transaction failed");
  }

  const iface = new ethers.Interface(abi);
  const matchingLog = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === contractInfo.address.toLowerCase() &&
      iface.getEventName(log.topics[0]) === "VerifierAdded"
  );

  if (!matchingLog) {
    throw new AppError(400, "TX_EVENT_MISMATCH", "No VerifierAdded event in transaction");
  }

  const parsed = iface.parseLog(matchingLog);
  // Validate the expected arguments
  if (
    parsed.args.eventId !== eventId ||
    parsed.args.verifier.toLowerCase() !== verifier.toLowerCase() ||
    parsed.args.addedBy.toLowerCase() !== addedBy.toLowerCase()
  ) {
    throw new AppError(400, "TX_EVENT_MISMATCH", "Event arguments do not match");
  }

  return {
    eventId: parsed.args.eventId,
    verifier: parsed.args.verifier,
    addedBy: parsed.args.addedBy,
  };
}

export async function verifyVerificationVotedTx(txHash, { eventId, participantId, verifier }) {
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    throw new AppError(404, "TX_NOT_FOUND", "Transaction receipt not found");
  }
  if (receipt.status !== 1) {
    throw new AppError(400, "TX_NOT_FOUND", "Transaction failed");
  }

  const iface = new ethers.Interface(abi);
  const matchingLog = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === contractInfo.address.toLowerCase() &&
      iface.getEventName(log.topics[0]) === "VerificationVoted"
  );

  if (!matchingLog) {
    throw new AppError(400, "TX_EVENT_MISMATCH", "No VerificationVoted event in transaction");
  }

  const parsed = iface.parseLog(matchingLog);
  if (
    parsed.args.eventId !== eventId ||
    parsed.args.participantId !== participantId ||
    parsed.args.verifier.toLowerCase() !== verifier.toLowerCase()
  ) {
    throw new AppError(400, "TX_EVENT_MISMATCH", "Event arguments do not match");
  }

  return {
    eventId: parsed.args.eventId,
    participantId: parsed.args.participantId,
    verifier: parsed.args.verifier,
    approved: parsed.args.approved,
    evidenceHash: parsed.args.evidenceHash,
  };
}

/* -------------------------------------------------------------------------- */
/* Export everything as a single object (optional convenience)                */
/* -------------------------------------------------------------------------- */
export default {
  getEvent,
  getEventStatus,
  hasEventEnded,
  getRegistration,
  getVerifications,
  isVerifier,
  hasOrganizerRole,
  getEventsOrganizedBy,
  getEventsWhereVerifier,
  verifyVerifierAddedTx,
  verifyVerificationVotedTx,
};