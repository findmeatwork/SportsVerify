import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ContractFactory, Interface, JsonRpcProvider, Wallet } from "ethers";
import deployment from "../src/config/contract.json" with { type: "json" };

const rpcUrl = process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
const organizerPrivateKey = process.env.LOCAL_ORGANIZER_PRIVATE_KEY;
const participantPrivateKey = process.env.LOCAL_PARTICIPANT_PRIVATE_KEY;

if (!organizerPrivateKey || !participantPrivateKey) {
  console.error("Set LOCAL_ORGANIZER_PRIVATE_KEY and LOCAL_PARTICIPANT_PRIVATE_KEY to Hardhat account #0 and #1 keys.");
  process.exit(1);
}

process.env.VITE_TARGET_CHAIN = "localhost";
const { createEvent, getEventById, getEvents, getOpenEvents, getWriteContract, isOrganizer } = await import(
  "../src/services/blockchain/contractService.js"
);

const artifactPath = new URL("../../contracts/artifacts/contracts/SportsPlayerRegistry.sol/SportsPlayerRegistry.json", import.meta.url);
const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
const registryInterface = new Interface(artifact.abi);
const provider = new JsonRpcProvider(rpcUrl, 31337);
const organizer = new Wallet(organizerPrivateKey, provider);
const participant = new Wallet(participantPrivateKey, provider);

async function printStep(number, title, data) {
  console.log(`STEP ${number} ${title}: ${JSON.stringify(data)}`);
}

async function sendOrganizerTransaction(method, args) {
  const organizerAddress = await organizer.getAddress();
  const nonce = Number(BigInt(await provider.send("eth_getTransactionCount", [organizerAddress, "pending"])));
  const { gasPrice } = await provider.getFeeData();
  const signedTransaction = await organizer.signTransaction({
    to: deployment.address,
    data: registryInterface.encodeFunctionData(method, args),
    nonce,
    chainId: 31337,
    gasLimit: 500000n,
    gasPrice,
  });
  const transaction = await provider.broadcastTransaction(signedTransaction);
  const receipt = await transaction.wait();
  assert.equal(receipt.status, 1, `${method} transaction should succeed.`);
  return receipt;
}

async function getListedEvent(name) {
  const events = await getEvents();
  const event = events.find((candidate) => candidate.name === name);
  assert.ok(event, `Expected event "${name}" to exist on chain.`);
  return event;
}

try {
  const code = await provider.getCode(deployment.address);
  if (code === "0x") {
    const deploymentProvider = new JsonRpcProvider(rpcUrl, 31337);
    const deploymentSigner = new Wallet(organizerPrivateKey, deploymentProvider);
    const registryFactory = new ContractFactory(artifact.abi, artifact.bytecode, deploymentSigner);
    const deployedRegistry = await registryFactory.deploy();
    await deployedRegistry.waitForDeployment();
    assert.equal((await deployedRegistry.getAddress()).toLowerCase(), deployment.address.toLowerCase());
    await deploymentProvider.destroy();
  }
  const deployedCode = await provider.getCode(deployment.address);
  assert.notEqual(deployedCode, "0x", "Configured contract address must contain deployed code.");
  const [organizerAddress, participantAddress] = await Promise.all([
    organizer.getAddress(),
    participant.getAddress(),
  ]);
  assert.equal(await isOrganizer(organizerAddress), true, "Account #0 must have organizer access.");
  assert.equal(await isOrganizer(participantAddress), false, "Account #1 must not have organizer access.");
  await printStep(1, "FRESH LOCAL DEPLOYMENT", {
    rpcUrl,
    address: deployment.address,
    codeBytes: (deployedCode.length - 2) / 2,
    organizer: organizerAddress,
    participant: participantAddress,
    participantIsOrganizer: false,
  });

  const noDeadlineName = `Regression no deadline ${Date.now()}`;
  await sendOrganizerTransaction("createEvent", [noDeadlineName, 0]);
  const noDeadlineEvent = await getListedEvent(noDeadlineName);
  const listWithoutDeadline = await getOpenEvents();
  assert.ok(listWithoutDeadline.some((event) => String(event.id) === String(noDeadlineEvent.id)));
  assert.equal(String(noDeadlineEvent.registrationDeadline), "0");
  await printStep(2, "NO-DEADLINE EVENT VISIBLE", {
    eventId: String(noDeadlineEvent.id),
    name: noDeadlineEvent.name,
    deadline: String(noDeadlineEvent.registrationDeadline),
    openEventIds: listWithoutDeadline.map((event) => String(event.id)),
  });

  const futureDeadline = Math.floor(Date.now() / 1000) + 3600;
  const futureName = `Regression future deadline ${Date.now()}`;
  await sendOrganizerTransaction("createEvent", [futureName, futureDeadline]);
  const futureEvent = await getListedEvent(futureName);
  const listWithFuture = await getOpenEvents();
  assert.ok(listWithFuture.some((event) => String(event.id) === String(futureEvent.id)));
  await printStep(3, "FUTURE-DEADLINE EVENT VISIBLE", {
    eventId: String(futureEvent.id),
    name: futureEvent.name,
    deadline: String(futureEvent.registrationDeadline),
    openEventIds: listWithFuture.map((event) => String(event.id)),
  });

  const timestampBeforeShortEvent = await provider.getBlock("latest");
  const shortDeadline = Number(timestampBeforeShortEvent.timestamp) + 3;
  const pastName = `Regression elapsed deadline ${Date.now()}`;
  await sendOrganizerTransaction("createEvent", [pastName, shortDeadline]);
  const pastEvent = await getListedEvent(pastName);
  await provider.send("evm_increaseTime", [5]);
  await provider.send("evm_mine", []);
  const latestBlock = await provider.send("eth_getBlockByNumber", ["latest", false]);
  const latestTimestamp = Number(BigInt(latestBlock.timestamp));
  const pastEventAfterDeadline = await getEventById(pastEvent.id);
  const listAfterDeadline = await getOpenEvents();
  assert.ok(Number(pastEventAfterDeadline.registrationDeadline) < latestTimestamp);
  assert.ok(!listAfterDeadline.some((event) => String(event.id) === String(pastEvent.id)));
  await printStep(4, "PAST-DEADLINE EVENT EXCLUDED", {
    eventId: String(pastEvent.id),
    name: pastEvent.name,
    deadline: String(pastEventAfterDeadline.registrationDeadline),
    latestTimestamp: String(latestTimestamp),
    openEventIds: listAfterDeadline.map((event) => String(event.id)),
  });

  const closedName = `Regression closed event ${Date.now()}`;
  await sendOrganizerTransaction("createEvent", [closedName, 0]);
  const closedEvent = await getListedEvent(closedName);
  await sendOrganizerTransaction("setRegistrationOpen", [closedEvent.id, false]);
  const closedEventAfterUpdate = await getEventById(closedEvent.id);
  const listAfterClose = await getOpenEvents();
  assert.equal(closedEventAfterUpdate.registrationOpen, false);
  assert.ok(!listAfterClose.some((event) => String(event.id) === String(closedEvent.id)));
  await printStep(5, "CLOSED EVENT EXCLUDED", {
    eventId: String(closedEvent.id),
    name: closedEvent.name,
    registrationOpen: closedEventAfterUpdate.registrationOpen,
    openEventIds: listAfterClose.map((event) => String(event.id)),
  });

  const participantOpenEvents = await getOpenEvents();
  assert.equal(await isOrganizer(participantAddress), false);
  assert.ok(participantOpenEvents.some((event) => String(event.id) === String(noDeadlineEvent.id)));
  await printStep(6, "PUBLIC READ AVAILABLE TO NON-ORGANIZER", {
    reader: participantAddress,
    isOrganizer: false,
    visibleEventIds: participantOpenEvents.map((event) => String(event.id)),
  });

  console.log("ALL OPEN-EVENT REGRESSION STEPS PASS");
  process.exitCode = 0;
} catch (error) {
  console.error("OPEN-EVENT REGRESSION FAIL");
  console.error(error?.stack || error);
  process.exitCode = 1;
} finally {
  await provider.destroy();
}
