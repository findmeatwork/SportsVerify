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
      const deadline = BigInt((await time.latest()) + 3600);

      await expect(registry.connect(organizer).createEvent("Regional Cup", deadline))
        .to.emit(registry, "EventCreated")
        .withArgs(1n, "Regional Cup", organizer.address, anyValue, deadline, true);
      await registry.connect(organizer).createEvent("Open Trials", 0);

      expect(await registry.getEventCount()).to.equal(2n);
      expect((await registry.getEventById(1)).id).to.equal(1n);
      expect((await registry.getEventById(2)).id).to.equal(2n);
    });

    it("rejects non-organizers and reports invalid event ids", async function () {
      const { registry, other } = await loadFixture(deployRegistryFixture);

      await expect(registry.connect(other).createEvent("Unauthorized", 0))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(other.address, await registry.ORGANIZER_ROLE());
      await expect(registry.getEventById(99))
        .to.be.revertedWithCustomError(registry, "EventNotFound")
        .withArgs(99n);
    });

    it("grants and revokes the organizer role through the admin", async function () {
      const { registry, admin, other } = await loadFixture(deployRegistryFixture);
      const organizerRole = await registry.ORGANIZER_ROLE();

      await registry.connect(admin).grantRole(organizerRole, other.address);
      await expect(registry.connect(other).createEvent("Granted", 0)).to.emit(registry, "EventCreated");
      await registry.connect(admin).revokeRole(organizerRole, other.address);
      await expect(registry.connect(other).createEvent("Revoked", 0))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("returns only currently active events", async function () {
      const { registry, organizer } = await loadFixture(deployRegistryFixture);
      await registry.connect(organizer).createEvent("Open", 0);
      await registry.connect(organizer).createEvent("Closed", 0);
      await registry.connect(organizer).setRegistrationOpen(2, false);

      const activeEvents = await registry.getActiveEvents();
      expect(activeEvents.map((eventData) => eventData.id)).to.deep.equal([1n]);
    });
  });

  describe("participant registration", function () {
    async function eventFixture() {
      const fixture = await deployRegistryFixture();
      await fixture.registry.connect(fixture.organizer).createEvent("Regional Cup", 0);
      return fixture;
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

    it("rejects missing, closed, and expired events", async function () {
      const { registry, organizer, participant } = await loadFixture(deployRegistryFixture);
      const participantId = ethers.id("player-001");
      const commitment = ethers.id("commitment");

      await expect(registry.connect(participant).registerParticipant(1, participantId, commitment))
        .to.be.revertedWithCustomError(registry, "EventNotFound")
        .withArgs(1n);

      await registry.connect(organizer).createEvent("Closed", 0);
      await registry.connect(organizer).setRegistrationOpen(1, false);
      await expect(registry.connect(participant).registerParticipant(1, participantId, commitment))
        .to.be.revertedWithCustomError(registry, "RegistrationIsClosed")
        .withArgs(1n);

      const pastDeadline = BigInt((await time.latest()) - 1);
      await registry.connect(organizer).createEvent("Expired", pastDeadline);
      await expect(registry.connect(participant).registerParticipant(2, participantId, commitment))
        .to.be.revertedWithCustomError(registry, "RegistrationDeadlinePassed")
        .withArgs(2n);
    });

    it("allows the same participant to register for separate events", async function () {
      const { registry, organizer, participant } = await loadFixture(eventFixture);
      const participantId = ethers.id("player-001");
      await registry.connect(organizer).createEvent("Open Trials", 0);

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