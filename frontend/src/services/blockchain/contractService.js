import {
  BrowserProvider,
  Contract,
  getAddress,
  isAddress,
  JsonRpcProvider,
} from "ethers";
import deployment from "../../config/contract.json" with { type: "json" };
import registryAbi from "../../config/SportsPlayerRegistry.abi.json" with { type: "json" };
import { chainId, rpcUrl } from "../../config/network.js";
import { mapBlockchainError } from "./errorMapper.js";

let readProvider;

function asPlainInteger(value) {
  const integer = typeof value === "bigint" ? value : BigInt(value);
  const maxSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);
  return integer <= maxSafeInteger && integer >= -maxSafeInteger
    ? Number(integer)
    : integer.toString();
}

function normalizeStruct(struct, fields) {
  return Object.fromEntries(fields.map((field, index) => {
    const value = struct[field] ?? struct[index];
    return [field, typeof value === "bigint" ? asPlainInteger(value) : value];
  }));
}

function normalizeEvent(event) {
  return normalizeStruct(event, [
    "id", "name", "organizer", "createdAt", "registrationDeadline", "registrationOpen",
  ]);
}

function normalizeParticipant(participant) {
  return normalizeStruct(participant, [
    "participantId", "commitment", "registrant", "submittedAt", "status",
  ]);
}

function getContractAddress() {
  if (!deployment.address || !isAddress(deployment.address)) {
    throw new Error("No valid SportsPlayerRegistry deployment address is configured.");
  }
  if (Number(deployment.chainId) !== chainId) {
    throw new Error(`The configured contract deployment is for chain ${deployment.chainId}, not target chain ${chainId}.`);
  }
  return getAddress(deployment.address);
}

function getReadProvider() {
  if (readProvider) return readProvider;
  const localRpcOverride = globalThis.process?.env?.LOCAL_RPC_URL;
  if (localRpcOverride) {
    readProvider = new JsonRpcProvider(localRpcOverride, chainId);
    return readProvider;
  }
  if (rpcUrl) {
    readProvider = new JsonRpcProvider(rpcUrl, chainId);
    return readProvider;
  }
  if (typeof window !== "undefined" && window.ethereum) {
    readProvider = new BrowserProvider(window.ethereum);
    return readProvider;
  }
  const error = new Error("No read-only RPC is configured and no browser wallet provider is available.");
  error.code = "NETWORK_ERROR";
  throw error;
}

function getReadContract() {
  return new Contract(getContractAddress(), registryAbi, getReadProvider());
}

async function getWriteContract(signerOverride) {
  const address = getContractAddress();
  let signer = signerOverride;

  if (!signer) {
    if (typeof window === "undefined" || !window.ethereum) {
      const error = new Error("MetaMask is not installed or available in this browser.");
      error.code = "METAMASK_MISSING";
      throw error;
    }
    const browserProvider = new BrowserProvider(window.ethereum);
    signer = await browserProvider.getSigner();
  }

  const signerProvider = signer.provider;
  if (!signerProvider) throw new Error("The wallet signer is not connected to a blockchain provider.");
  const activeNetwork = await signerProvider.getNetwork();
  if (Number(activeNetwork.chainId) !== chainId) {
    const error = new Error("Wrong network selected in wallet.");
    error.code = "WRONG_NETWORK";
    error.expectedNetwork = deployment.networkName || `chain ${chainId}`;
    throw error;
  }

  return new Contract(address, registryAbi, signer);
}

async function runWrite(method, args, signerOverride) {
  try {
    const contract = await getWriteContract(signerOverride);
    const transaction = await contract[method](...args);
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) throw new Error("The transaction was not confirmed successfully.");
    return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
  } catch (error) {
    throw new Error(mapBlockchainError(error));
  }
}

export { getReadContract, getWriteContract };

export async function getEvents(organizerAddress) {
  try {
    const contract = getReadContract();
    const count = Number(await contract.getEventCount());
    const events = await Promise.all(
      Array.from({ length: count }, (_, index) => contract.getEventById(index + 1)),
    );
    const normalized = events.map(normalizeEvent);
    if (!organizerAddress) return normalized;
    const organizer = getAddress(organizerAddress).toLowerCase();
    return normalized.filter((event) => event.organizer.toLowerCase() === organizer);
  } catch (error) {
    throw new Error(mapBlockchainError(error));
  }
}

export async function getOpenEvents() {
  try {
    const events = await getReadContract().getActiveEvents();
    return events.map(normalizeEvent);
  } catch (error) {
    throw new Error(mapBlockchainError(error), { cause: error });
  }
}

export async function getEventById(eventId) {
  try {
    return normalizeEvent(await getReadContract().getEventById(eventId));
  } catch (error) {
    throw new Error(mapBlockchainError(error));
  }
}

export async function getEventRegistrationCount(eventId) {
  try {
    return asPlainInteger(await getReadContract().getEventRegistrationCount(eventId));
  } catch (error) {
    throw new Error(mapBlockchainError(error));
  }
}

export async function getParticipant(eventId, participantId) {
  try {
    return normalizeParticipant(await getReadContract().getParticipant(eventId, participantId));
  } catch (error) {
    throw new Error(mapBlockchainError(error));
  }
}

export async function isRegistered(eventId, participantId) {
  try {
    return await getReadContract().isRegistered(eventId, participantId);
  } catch (error) {
    throw new Error(mapBlockchainError(error));
  }
}

export async function verifyCommitment(eventId, participantId, commitment) {
  try {
    return await getReadContract().verifyCommitment(eventId, participantId, commitment);
  } catch (error) {
    throw new Error(mapBlockchainError(error));
  }
}

export async function isOrganizer(address) {
  try {
    const contract = getReadContract();
    const role = await contract.ORGANIZER_ROLE();
    return await contract.hasRole(role, address);
  } catch (error) {
    throw new Error(mapBlockchainError(error));
  }
}

export async function createEvent(name, registrationDeadline, signerOverride) {
  return runWrite("createEvent", [name, registrationDeadline], signerOverride);
}

export async function registerParticipant(eventId, participantId, commitment, signerOverride) {
  return runWrite("registerParticipant", [eventId, participantId, commitment], signerOverride);
}

export async function findRegistrationTx(eventId, participantId) {
  try {
    const contract = getReadContract();
    const filter = contract.filters.ParticipantRegistered(eventId, participantId);
    const logs = await contract.queryFilter(filter);
    if (logs.length === 0) return null;

    const log = logs[logs.length - 1];
    const block = await log.getBlock();
    return {
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      blockTimestamp: asPlainInteger(block.timestamp),
    };
  } catch (error) {
    throw new Error(mapBlockchainError(error));
  }
}