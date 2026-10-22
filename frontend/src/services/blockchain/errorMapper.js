import { Interface } from "ethers";
import registryAbi from "../../config/SportsPlayerRegistry.abi.json" with { type: "json" };

const contractInterface = new Interface(registryAbi);

const contractErrorMessages = {
  AccessControlBadConfirmation: "Wallet confirmation did not match the connected account.",
  AccessControlUnauthorizedAccount: "This wallet is not authorized to perform that action.",
  EventNotFound: "That event does not exist.",
  NotEventManager: "Only the event organizer or an admin can manage this event.",
  ParticipantAlreadyRegistered: "This participant is already registered for the event.",
  RegistrationDeadlinePassed: "The registration deadline has passed.",
  RegistrationIsClosed: "Registration for this event is closed.",
  ZeroCommitment: "The registration commitment cannot be empty.",
  ZeroParticipantId: "The participant identifier cannot be empty.",
  InvalidEventDeadline: "The event deadline must be in the future.",
  InvalidRegistrationDeadline: "The registration deadline must be in the future and cannot be after the event deadline.",
  EventNotActive: "This event is no longer active.",
  EventAlreadyCancelled: "This event has already been cancelled.",
  EventHasEnded: "This event has already ended.",
  NotEventOrganizer: "Only the recorded organizer of this event can perform this action.",
  ZeroDobHash: "The date-of-birth hash cannot be empty.",
  ZeroAddressVerifier: "The verifier address cannot be the zero address.",
  OrganizerCannotBeVerifier: "The event organizer cannot be added as a verifier.",
  VerifierAlreadyAdded: "This wallet is already an authorized verifier for this event.",
  NotEventVerifier: "You are not an authorized verifier for this event.",
  ParticipantNotRegistered: "No registration was found for this participant.",
  ZeroEvidenceHash: "Verification evidence hash cannot be empty.",
  VerifierAlreadyVoted: "You have already submitted a verification vote for this participant.",
};

function collectErrorData(error, seen = new Set()) {
  if (!error || typeof error !== "object" || seen.has(error)) return [];
  seen.add(error);

  const values = [];
  for (const [key, value] of Object.entries(error)) {
    if (typeof value === "string" && /^0x[0-9a-fA-F]{8,}$/.test(value)) values.push(value);
    else if (value && typeof value === "object") values.push(...collectErrorData(value, seen));
    if (key === "message" && typeof value === "string") {
      for (const match of value.matchAll(/0x[0-9a-fA-F]{8,}/g)) values.push(match[0]);
    }
  }
  return values;
}

function parseContractError(error) {
  for (const data of collectErrorData(error)) {
    try {
      const parsed = contractInterface.parseError(data);
      if (parsed) return parsed;
    } catch {
    }
  }
  return null;
}

export function mapBlockchainError(error) {
  if (!error) return "An unexpected blockchain error occurred.";

  const code = error.code;
  const message = String(error.shortMessage || error.message || error);
  const lowerMessage = message.toLowerCase();

  if (code === 4001 || code === "ACTION_REJECTED" || error.name === "UserRejectedRequestError") {
    return "The wallet request was rejected.";
  }
  if (code === "METAMASK_MISSING" || lowerMessage.includes("metamask is not installed")) {
    return "MetaMask is not installed or available in this browser.";
  }
  if (code === "WRONG_NETWORK" || lowerMessage.includes("wrong network")) {
    return `Switch your wallet to the configured network (${error.expectedNetwork || "target network"}).`;
  }
  if (code === "INSUFFICIENT_FUNDS" || lowerMessage.includes("insufficient funds")) {
    return "The connected wallet does not have enough funds to cover this transaction and gas.";
  }
  if (["NETWORK_ERROR", "SERVER_ERROR", "ECONNREFUSED", "ETIMEDOUT", "FETCH_FAILED"].includes(code)
      || /failed to fetch|network error|could not detect network|connection refused|timeout/.test(lowerMessage)) {
    return "The blockchain network could not be reached. Check the RPC connection and try again.";
  }

  const parsedError = parseContractError(error);
  if (parsedError) {
    if (parsedError.name === "VerificationFinalized") {
      const status = Number(parsedError.args?.status ?? parsedError.args?.[2]);
      if (status === 4) {
        return "Verification has already been finalized: this participant is confirmed.";
      }
      if (status === 5) {
        return "Verification has already been finalized: this participant is rejected.";
      }
      return "Verification has already been finalized for this participant.";
    }

    return contractErrorMessages[parsedError.name]
      || `The contract rejected the request (${parsedError.name}).`;
  }

  if (error.reason) return String(error.reason);
  if (error.shortMessage) return String(error.shortMessage);
  return message;
}
