// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract SportsPlayerRegistry is AccessControl {
    bytes32 public constant ORGANIZER_ROLE = keccak256("ORGANIZER_ROLE");

    enum EventStatus {
        Active,
        Cancelled,
        Finished
    }

    enum RegistrationStatus {
        None,
        Registered,
        Withdrawn,
        Suspended,
        Confirmed,
        Rejected
    }

    struct EventData {
        uint256 id;
        string name;
        address organizer;
        uint256 createdAt;
        uint256 registrationDeadline;
        bool registrationOpen;
        uint256 eventDeadline;
        bool cancelled;
    }

    struct Registration {
        bytes32 participantId;
        bytes32 commitment;
        address registrant;
        uint256 submittedAt;
        RegistrationStatus status;
        bytes32 dobHash;
        bool hasAffiliation;
    }

    error EventNotFound(uint256 eventId);
    error RegistrationIsClosed(uint256 eventId);
    error RegistrationDeadlinePassed(uint256 eventId);
    error ZeroParticipantId();
    error ZeroCommitment();
    error ParticipantAlreadyRegistered(uint256 eventId, bytes32 participantId);
    error NotEventManager(address caller, uint256 eventId);
    error InvalidEventDeadline();
    error InvalidRegistrationDeadline();
    error EventNotActive(uint256 eventId);
    error NotEventOrganizer(address caller, uint256 eventId);
    error EventAlreadyCancelled(uint256 eventId);
    error EventHasEnded(uint256 eventId);
    error ZeroDobHash();

    event EventCreated(
        uint256 indexed id,
        string name,
        address indexed organizer,
        uint256 createdAt,
        uint256 registrationDeadline,
        bool registrationOpen,
        uint256 eventDeadline
    );
    event EventCancelled(
        uint256 indexed eventId,
        address indexed organizer,
        uint256 cancelledAt
    );
    event ParticipantRegistered(
        uint256 indexed eventId,
        bytes32 indexed participantId,
        bytes32 commitment,
        address indexed registrant,
        uint256 submittedAt,
        bool hasAffiliation,
        bytes32 dobHash
    );

    uint256 private _nextEventId = 1;
    mapping(uint256 eventId => EventData eventData) private _events;
    mapping(uint256 eventId => mapping(bytes32 participantId => Registration)) private _registrations;
    mapping(uint256 eventId => bytes32[]) private _eventParticipantIds;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORGANIZER_ROLE, msg.sender);
    }

    function createEvent(string calldata name, uint256 eventDeadline, uint256 registrationDeadline)
        external
        onlyRole(ORGANIZER_ROLE)
        returns (uint256 id)
    {
        if (eventDeadline <= block.timestamp) {
            revert InvalidEventDeadline();
        }
        if (registrationDeadline != 0 && (registrationDeadline <= block.timestamp || registrationDeadline > eventDeadline)) {
            revert InvalidRegistrationDeadline();
        }

        id = _nextEventId++;
        uint256 createdAt = block.timestamp;
        _events[id] = EventData({
            id: id,
            name: name,
            organizer: msg.sender,
            createdAt: createdAt,
            registrationDeadline: registrationDeadline,
            registrationOpen: true,
            eventDeadline: eventDeadline,
            cancelled: false
        });

        emit EventCreated(id, name, msg.sender, createdAt, registrationDeadline, true, eventDeadline);
    }

    function cancelEvent(uint256 eventId) external {
        EventData storage eventData = _events[eventId];
        if (eventData.id == 0) revert EventNotFound(eventId);
        if (msg.sender != eventData.organizer) revert NotEventOrganizer(msg.sender, eventId);
        if (eventData.cancelled) revert EventAlreadyCancelled(eventId);
        if (block.timestamp >= eventData.eventDeadline) revert EventHasEnded(eventId);

        eventData.cancelled = true;

        emit EventCancelled(eventId, msg.sender, block.timestamp);
    }

    function getEventStatus(uint256 eventId) public view returns (EventStatus) {
        EventData storage eventData = _events[eventId];
        if (eventData.id == 0) revert EventNotFound(eventId);
        if (eventData.cancelled) return EventStatus.Cancelled;
        if (block.timestamp >= eventData.eventDeadline) return EventStatus.Finished;
        return EventStatus.Active;
    }

    function hasEventEnded(uint256 eventId) external view returns (bool) {
        EventData storage eventData = _events[eventId];
        if (eventData.id == 0) revert EventNotFound(eventId);
        return block.timestamp >= eventData.eventDeadline;
    }

    function getEventById(uint256 eventId) external view returns (EventData memory) {
        EventData memory eventData = _events[eventId];
        if (eventData.id == 0) revert EventNotFound(eventId);
        return eventData;
    }

    function getEventCount() external view returns (uint256) {
        return _nextEventId - 1;
    }

    function getActiveEvents() external view returns (EventData[] memory activeEvents) {
        uint256 eventCount = _nextEventId - 1;
        uint256 activeCount;

        for (uint256 id = 1; id <= eventCount; id++) {
            if (_isEventActive(_events[id])) activeCount++;
        }

        activeEvents = new EventData[](activeCount);
        uint256 index;
        for (uint256 id = 1; id <= eventCount; id++) {
            if (_isEventActive(_events[id])) activeEvents[index++] = _events[id];
        }
    }

    function setRegistrationOpen(uint256 eventId, bool isOpen) external {
        EventData storage eventData = _events[eventId];
        if (eventData.id == 0) revert EventNotFound(eventId);
        if (msg.sender != eventData.organizer && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert NotEventManager(msg.sender, eventId);
        }

        eventData.registrationOpen = isOpen;
    }

    function registerParticipant(
        uint256 eventId,
        bytes32 participantId,
        bytes32 commitment,
        bytes32 dobHash,
        bool hasAffiliation
    ) external {
        EventData storage eventData = _events[eventId];
        if (eventData.id == 0) revert EventNotFound(eventId);
        if (getEventStatus(eventId) != EventStatus.Active) revert EventNotActive(eventId);
        if (!eventData.registrationOpen) revert RegistrationIsClosed(eventId);
        if (eventData.registrationDeadline != 0 && block.timestamp > eventData.registrationDeadline) {
            revert RegistrationDeadlinePassed(eventId);
        }
        if (participantId == bytes32(0)) revert ZeroParticipantId();
        if (commitment == bytes32(0)) revert ZeroCommitment();
        if (dobHash == bytes32(0)) revert ZeroDobHash();
        if (_registrations[eventId][participantId].status != RegistrationStatus.None) {
            revert ParticipantAlreadyRegistered(eventId, participantId);
        }

        uint256 submittedAt = block.timestamp;
        _registrations[eventId][participantId] = Registration({
            participantId: participantId,
            commitment: commitment,
            registrant: msg.sender,
            submittedAt: submittedAt,
            status: RegistrationStatus.Registered,
            dobHash: dobHash,
            hasAffiliation: hasAffiliation
        });
        _eventParticipantIds[eventId].push(participantId);

        emit ParticipantRegistered(eventId, participantId, commitment, msg.sender, submittedAt, hasAffiliation, dobHash);
    }

    function getParticipant(uint256 eventId, bytes32 participantId)
        external
        view
        returns (Registration memory)
    {
        return _registrations[eventId][participantId];
    }

    function isRegistered(uint256 eventId, bytes32 participantId) external view returns (bool) {
        return _registrations[eventId][participantId].status == RegistrationStatus.Registered;
    }

    function getEventRegistrationCount(uint256 eventId) external view returns (uint256) {
        if (_events[eventId].id == 0) revert EventNotFound(eventId);
        return _eventParticipantIds[eventId].length;
    }

    function getEventParticipantIds(uint256 eventId, uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory participantIds)
    {
        if (_events[eventId].id == 0) revert EventNotFound(eventId);
        bytes32[] storage allParticipantIds = _eventParticipantIds[eventId];
        if (offset >= allParticipantIds.length || limit == 0) return new bytes32[](0);

        uint256 remaining = allParticipantIds.length - offset;
        uint256 resultLength = limit < remaining ? limit : remaining;
        participantIds = new bytes32[](resultLength);
        for (uint256 index; index < resultLength; index++) {
            participantIds[index] = allParticipantIds[offset + index];
        }
    }

    function verifyCommitment(uint256 eventId, bytes32 participantId, bytes32 commitment)
        external
        view
        returns (bool)
    {
        Registration storage registration = _registrations[eventId][participantId];
        return registration.status == RegistrationStatus.Registered && registration.commitment == commitment;
    }

    function _isEventActive(EventData storage eventData) private view returns (bool) {
        return !eventData.cancelled
            && block.timestamp < eventData.eventDeadline
            && eventData.registrationOpen
            && (eventData.registrationDeadline == 0 || block.timestamp <= eventData.registrationDeadline);
    }
}