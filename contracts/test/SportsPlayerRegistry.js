const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SportsPlayerRegistry", function () {
  async function deployRegistryFixture() {
    const [admin, organizer, participant, other] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("SportsPlayerRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    await registry.grantRole(await registry.ORGANIZER_ROLE(), organizer.address);
    return { registry, admin, organizer, participant, other };
  }

  describe("events", function () {
    it("lets an organizer create an event and assigns unique ids", async function () {
      const { registry, organizer } = await loadFixture(deployRegistryFixture);
      const currentTime = await time.latest();
      const eventDeadline = BigInt(currentTime + 7200);
      const registrationDeadline = BigInt(currentTime + 3600);

      await expect(
        registry.connect(organizer).createEvent("Regional Cup", eventDeadline, registrationDeadline)
      )
        .to.emit(registry, "EventCreated")
        .withArgs(1n, "Regional Cup", organizer.address, anyValue, registrationDeadline, true, eventDeadline);

      await registry.connect(organizer).createEvent("Open Trials", eventDeadline, 0);

      expect(await registry.getEventCount()).to.equal(2n);
      expect((await registry.getEventById(1)).id).to.equal(1n);
      expect((await registry.getEventById(1)).eventDeadline).to.equal(eventDeadline);
      expect((await registry.getEventById(2)).id).to.equal(2n);
    });

    it("rejects non-organizers and reports invalid event ids", async function () {
      const { registry, other } = await loadFixture(deployRegistryFixture);
      const eventDeadline = BigInt((await time.latest()) + 3600);

      await expect(registry.connect(other).createEvent("Unauthorized", eventDeadline, 0))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(other.address, await registry.ORGANIZER_ROLE());
      await expect(registry.getEventById(99))
        .to.be.revertedWithCustomError(registry, "EventNotFound")
        .withArgs(99n);
    });

    it("rejects invalid event deadline and invalid registration deadline", async function () {
      const { registry, organizer } = await loadFixture(deployRegistryFixture);
      const currentTime = await time.latest();

      await expect(
        registry.connect(organizer).createEvent("Past Event", BigInt(currentTime - 1), 0)
      ).to.be.revertedWithCustomError(registry, "InvalidEventDeadline");

      await expect(
        registry.connect(organizer).createEvent("Now Event", BigInt(currentTime), 0)
      ).to.be.revertedWithCustomError(registry, "InvalidEventDeadline");

      const eventDeadline = BigInt(currentTime + 3600);
      await expect(
        registry.connect(organizer).createEvent("Bad Reg", eventDeadline, BigInt(currentTime - 10))
      ).to.be.revertedWithCustomError(registry, "InvalidRegistrationDeadline");

      await expect(
        registry.connect(organizer).createEvent("Bad Reg After", eventDeadline, BigInt(currentTime + 7200))
      ).to.be.revertedWithCustomError(registry, "InvalidRegistrationDeadline");
    });

    it("grants and revokes the organizer role through the admin", async function () {
      const { registry, admin, other } = await loadFixture(deployRegistryFixture);
      const organizerRole = await registry.ORGANIZER_ROLE();
      const eventDeadline = BigInt((await time.latest()) + 3600);

      await registry.connect(admin).grantRole(organizerRole, other.address);
      await expect(
        registry.connect(other).createEvent("Granted", eventDeadline, 0)
      ).to.emit(registry, "EventCreated");
      await registry.connect(admin).revokeRole(organizerRole, other.address);
      await expect(
        registry.connect(other).createEvent("Revoked", eventDeadline, 0)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("computes live event status and hasEventEnded correctly", async function () {
      const { registry, organizer } = await loadFixture(deployRegistryFixture);
      const currentTime = await time.latest();
      const eventDeadline = BigInt(currentTime + 1000);

      await registry.connect(organizer).createEvent("Track Meet", eventDeadline, 0);

      expect(await registry.getEventStatus(1)).to.equal(0n);
      expect(await registry.hasEventEnded(1)).to.equal(false);

      await expect(registry.getEventStatus(99))
        .to.be.revertedWithCustomError(registry, "EventNotFound")
        .withArgs(99n);
      await expect(registry.hasEventEnded(99))
        .to.be.revertedWithCustomError(registry, "EventNotFound")
        .withArgs(99n);

      await time.increaseTo(eventDeadline);

      expect(await registry.getEventStatus(1)).to.equal(2n);
      expect(await registry.hasEventEnded(1)).to.equal(true);
    });

    it("returns only currently active events and excludes finished events", async function () {
      const { registry, organizer } = await loadFixture(deployRegistryFixture);
      const currentTime = await time.latest();
      const shortDeadline = BigInt(currentTime + 100);
      const longDeadline = BigInt(currentTime + 5000);

      await registry.connect(organizer).createEvent("Open", longDeadline, 0);
      await registry.connect(organizer).createEvent("Closed", longDeadline, 0);
      await registry.connect(organizer).setRegistrationOpen(2, false);
      await registry.connect(organizer).createEvent("WillFinish", shortDeadline, 0);

      let activeEvents = await registry.getActiveEvents();
      expect(activeEvents.map((eventData) => eventData.id)).to.deep.equal([1n, 3n]);

      await time.increaseTo(shortDeadline);

      activeEvents = await registry.getActiveEvents();
      expect(activeEvents.map((eventData) => eventData.id)).to.deep.equal([1n]);
    });

    it("allows only the recorded event organizer to cancel before the deadline", async function () {
      const { registry, admin, organizer, other } = await loadFixture(deployRegistryFixture);
      const currentTime = await time.latest();
      const eventDeadline = BigInt(currentTime + 1000);

      await registry.connect(organizer).createEvent("Summer League", eventDeadline, 0);

      await expect(registry.connect(other).cancelEvent(1))
        .to.be.revertedWithCustomError(registry, "NotEventOrganizer")
        .withArgs(other.address, 1n);

      await expect(registry.connect(admin).cancelEvent(1))
        .to.be.revertedWithCustomError(registry, "NotEventOrganizer")
        .withArgs(admin.address, 1n);

      await expect(registry.connect(organizer).cancelEvent(1))
        .to.emit(registry, "EventCancelled")
        .withArgs(1n, organizer.address, anyValue);

      expect(await registry.getEventStatus(1)).to.equal(1n);

      await expect(registry.connect(organizer).cancelEvent(1))
        .to.be.revertedWithCustomError(registry, "EventAlreadyCancelled")
        .withArgs(1n);

      await time.increaseTo(eventDeadline + 10n);
      expect(await registry.getEventStatus(1)).to.equal(1n);

      const newDeadline = BigInt((await time.latest()) + 500);
      await registry.connect(organizer).createEvent("Late League", newDeadline, 0);
      await time.increaseTo(newDeadline);
      await expect(registry.connect(organizer).cancelEvent(2))
        .to.be.revertedWithCustomError(registry, "EventHasEnded")
        .withArgs(2n);
    });
  });

  describe("participant registration", function () {
    async function eventFixture() {
      const fixture = await deployRegistryFixture();
      const eventDeadline = BigInt((await time.latest()) + 7200);
      await fixture.registry.connect(fixture.organizer).createEvent("Regional Cup", eventDeadline, 0);
      return { ...fixture, eventDeadline };
    }

    it("registers a participant and emits registration details", async function () {
      const { registry, participant } = await loadFixture(eventFixture);
      const participantId = ethers.id("player-001");
      const commitment = ethers.id("registration-commitment");
      const transaction = await registry.connect(participant).registerParticipant(1, participantId, commitment);
      const receipt = await transaction.wait();

      await expect(transaction)
        .to.emit(registry, "ParticipantRegistered")
        .withArgs(1n, participantId, commitment, participant.address, anyValue);

      const registration = await registry.getParticipant(1, participantId);
      expect(registration.participantId).to.equal(participantId);
      expect(registration.commitment).to.equal(commitment);
      expect(registration.registrant).to.equal(participant.address);
      expect(registration.submittedAt).to.be.greaterThan(0n);
      expect(registration.status).to.equal(1n);
      expect(receipt.status).to.equal(1);
      expect(await registry.isRegistered(1, participantId)).to.equal(true);
    });

    it("rejects duplicates without overwriting the original registration", async function () {
      const { registry, participant, other } = await loadFixture(eventFixture);
      const participantId = ethers.id("player-001");
      const originalCommitment = ethers.id("original");
      await registry.connect(participant).registerParticipant(1, participantId, originalCommitment);

      await expect(registry.connect(other).registerParticipant(1, participantId, ethers.id("replacement")))
        .to.be.revertedWithCustomError(registry, "ParticipantAlreadyRegistered")
        .withArgs(1n, participantId);

      const registration = await registry.getParticipant(1, participantId);
      expect(registration.commitment).to.equal(originalCommitment);
      expect(registration.registrant).to.equal(participant.address);
      expect(await registry.getEventRegistrationCount(1)).to.equal(1n);
    });

    it("rejects missing, closed, expired, and finished events", async function () {
      const { registry, organizer, participant } = await loadFixture(deployRegistryFixture);
      const participantId = ethers.id("player-001");
      const commitment = ethers.id("commitment");

      await expect(registry.connect(participant).registerParticipant(1, participantId, commitment))
        .to.be.revertedWithCustomError(registry, "EventNotFound")
        .withArgs(1n);

      const currentTime = await time.latest();
      const longDeadline = BigInt(currentTime + 10000);
      const regDeadline = BigInt(currentTime + 200);

      await registry.connect(organizer).createEvent("Closed", longDeadline, 0);
      await registry.connect(organizer).setRegistrationOpen(1, false);
      await expect(registry.connect(participant).registerParticipant(1, participantId, commitment))
        .to.be.revertedWithCustomError(registry, "RegistrationIsClosed")
        .withArgs(1n);

      await registry.connect(organizer).createEvent("RegExpiring", longDeadline, regDeadline);
      await time.increaseTo(regDeadline + 1n);
      await expect(registry.connect(participant).registerParticipant(2, participantId, commitment))
        .to.be.revertedWithCustomError(registry, "RegistrationDeadlinePassed")
        .withArgs(2n);

      const shortEventDeadline = BigInt((await time.latest()) + 100);
      await registry.connect(organizer).createEvent("Finishing", shortEventDeadline, 0);
      await time.increaseTo(shortEventDeadline);
      await expect(registry.connect(participant).registerParticipant(3, participantId, commitment))
        .to.be.revertedWithCustomError(registry, "EventNotActive")
        .withArgs(3n);

      await registry.connect(organizer).createEvent("CancelledEvent", longDeadline, 0);
      await registry.connect(organizer).cancelEvent(4);
      await expect(registry.connect(participant).registerParticipant(4, participantId, commitment))
        .to.be.revertedWithCustomError(registry, "EventNotActive")
        .withArgs(4n);
    });

    it("allows the same participant to register for separate events", async function () {
      const { registry, organizer, participant } = await loadFixture(eventFixture);
      const participantId = ethers.id("player-001");
      const eventDeadline = BigInt((await time.latest()) + 3600);
      await registry.connect(organizer).createEvent("Open Trials", eventDeadline, 0);

      await registry.connect(participant).registerParticipant(1, participantId, ethers.id("event-one"));
      await registry.connect(participant).registerParticipant(2, participantId, ethers.id("event-two"));

      expect(await registry.isRegistered(1, participantId)).to.equal(true);
      expect(await registry.isRegistered(2, participantId)).to.equal(true);
    });

    it("rejects zero participant ids and commitments", async function () {
      const { registry, participant } = await loadFixture(eventFixture);
      const commitment = ethers.id("commitment");

      await expect(registry.connect(participant).registerParticipant(1, ethers.ZeroHash, commitment))
        .to.be.revertedWithCustomError(registry, "ZeroParticipantId");
      await expect(registry.connect(participant).registerParticipant(1, ethers.id("player-001"), ethers.ZeroHash))
        .to.be.revertedWithCustomError(registry, "ZeroCommitment");
    });

    it("restricts registration settings to the event organizer or admin", async function () {
      const { registry, admin, organizer, other } = await loadFixture(eventFixture);

      await expect(registry.connect(other).setRegistrationOpen(1, false))
        .to.be.revertedWithCustomError(registry, "NotEventManager")
        .withArgs(other.address, 1n);
      await registry.connect(admin).setRegistrationOpen(1, false);
      expect((await registry.getEventById(1)).registrationOpen).to.equal(false);
      await registry.connect(organizer).setRegistrationOpen(1, true);
      expect((await registry.getEventById(1)).registrationOpen).to.equal(true);
    });

    it("supports participant lookup, counts, pagination, and commitment checks", async function () {
      const { registry, participant } = await loadFixture(eventFixture);
      const firstId = ethers.id("player-001");
      const secondId = ethers.id("player-002");
      const firstCommitment = ethers.id("commitment-one");
      const secondCommitment = ethers.id("commitment-two");
      await registry.connect(participant).registerParticipant(1, firstId, firstCommitment);
      await registry.connect(participant).registerParticipant(1, secondId, secondCommitment);

      expect(await registry.getEventRegistrationCount(1)).to.equal(2n);
      expect(await registry.getEventParticipantIds(1, 0, 1)).to.deep.equal([firstId]);
      expect(await registry.getEventParticipantIds(1, 1, 5)).to.deep.equal([secondId]);
      expect(await registry.getEventParticipantIds(1, 3, 2)).to.deep.equal([]);
      expect(await registry.verifyCommitment(1, firstId, firstCommitment)).to.equal(true);
      expect(await registry.verifyCommitment(1, firstId, secondCommitment)).to.equal(false);
      expect(await registry.verifyCommitment(1, ethers.id("unknown"), firstCommitment)).to.equal(false);
      expect((await registry.getParticipant(1, firstId)).commitment).to.equal(firstCommitment);
    });
  });
});
