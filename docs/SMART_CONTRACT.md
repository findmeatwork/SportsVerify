# SportsPlayerRegistry

`SportsPlayerRegistry` stores public event metadata and pseudonymous participant registrations. It is Solidity `0.8.24` and inherits OpenZeppelin `AccessControl`.

## Roles

- The deployer receives `DEFAULT_ADMIN_ROLE` and `ORGANIZER_ROLE` in the constructor.
- `DEFAULT_ADMIN_ROLE` is the admin for roles and can grant or revoke `ORGANIZER_ROLE` using inherited AccessControl functions.
- Only an `ORGANIZER_ROLE` account can create an event.
- An event's recorded organizer or a default admin can open or close that event's registration.
- Registration itself is public when the event is open and its deadline permits registration.

## Structs and Enum

`EventData` contains `id` (`uint256`), `name` (`string`), `organizer` (`address`), `createdAt` (`uint256`), `registrationDeadline` (`uint256`), and `registrationOpen` (`bool`).

`Registration` contains `participantId` (`bytes32`), `commitment` (`bytes32`), `registrant` (`address`), `submittedAt` (`uint256`), and `status` (`RegistrationStatus`). The enum values are `None` (0), `Registered` (1), `Withdrawn` (2), and `Suspended` (3). Current contract methods create the `Registered` state; there are no withdrawal or suspension methods in this version.

## Public Interface

| Method | Behavior |
| --- | --- |
| `ORGANIZER_ROLE()` | Returns the organizer role identifier. |
| `createEvent(string name, uint256 registrationDeadline)` | Organizer-only. Creates an event with the next ID, current block timestamp, and registration open. A deadline of `0` means no deadline. |
| `getEventById(uint256 eventId)` | Returns one event; reverts with `EventNotFound` for a nonexistent ID. |
| `getEventCount()` | Returns the number of IDs allocated so far. IDs begin at 1. |
| `getActiveEvents()` | Returns events whose registration is open and whose deadline is zero or not yet passed. This is a public view. |
| `setRegistrationOpen(uint256 eventId, bool isOpen)` | Event organizer or default admin only. Changes the registration-open flag. |
| `registerParticipant(uint256 eventId, bytes32 participantId, bytes32 commitment)` | Public registration. Requires an existing open event, an unexpired nonzero deadline, nonzero reference/commitment, and no existing registration for that event/reference pair. |
| `getParticipant(uint256 eventId, bytes32 participantId)` | Returns the registration struct; an unset entry has status `None`. |
| `isRegistered(uint256 eventId, bytes32 participantId)` | Returns whether the registration status is `Registered`. |
| `getEventRegistrationCount(uint256 eventId)` | Returns the number of participant references appended for an existing event. |
| `getEventParticipantIds(uint256 eventId, uint256 offset, uint256 limit)` | Returns a page of participant references for an existing event. |
| `verifyCommitment(uint256 eventId, bytes32 participantId, bytes32 commitment)` | Returns true only if the entry is `Registered` and the supplied commitment equals the stored value. |

The inherited AccessControl interface includes the public `DEFAULT_ADMIN_ROLE()` getter, role queries (`hasRole`, `getRoleAdmin`), role administration (`grantRole`, `revokeRole`, and `renounceRole`), and ERC-165 interface support (`supportsInterface`), subject to AccessControl authorization rules.

## Events

- `EventCreated(uint256 indexed id, string name, address indexed organizer, uint256 createdAt, uint256 registrationDeadline, bool registrationOpen)` is emitted on event creation.
- `ParticipantRegistered(uint256 indexed eventId, bytes32 indexed participantId, bytes32 commitment, address indexed registrant, uint256 submittedAt)` is emitted on successful registration.
- OpenZeppelin AccessControl also emits its role-administration events (`RoleAdminChanged`, `RoleGranted`, and `RoleRevoked`).
- `setRegistrationOpen` does not emit a dedicated registration-state-change event in this contract.

## Custom Errors

Errors declared by this contract:

- `EventNotFound(uint256 eventId)`
- `RegistrationIsClosed(uint256 eventId)`
- `RegistrationDeadlinePassed(uint256 eventId)`
- `ZeroParticipantId()`
- `ZeroCommitment()`
- `ParticipantAlreadyRegistered(uint256 eventId, bytes32 participantId)`
- `NotEventManager(address caller, uint256 eventId)`

The inherited AccessControl implementation can also revert with `AccessControlUnauthorizedAccount(address account, bytes32 neededRole)` and `AccessControlBadConfirmation()`.

## Commitment Encoding

The registration flow supports a generated or entered `bytes32` participant reference and creates a random salt, then calculates:

```text
keccak256(abi.encode(uint256 eventId, bytes32 participantId, bytes32 salt))
```

In the frontend utility, this is standard ABI encoding through ethers v6 `AbiCoder.defaultAbiCoder().encode(["uint256", "bytes32", "bytes32"], [eventId, participantId, salt])`, followed by `keccak256`. This is not packed encoding. The contract stores the resulting `bytes32` commitment; it never receives the salt. `verifyCommitment` compares a supplied commitment but does not compute a hash or take a salt.

## Limitations and Security

- Event IDs are sequential and enumerable. `getActiveEvents()` loops over all IDs, and the frontend's organizer-wide `getEvents()` reads the count and fetches each ID individually. Enumeration and large result sets can become costly.
- Participant IDs are unique only within one event. The same value can be used for another event. A registration cannot be overwritten.
- The contract stores no participant name, date of birth, gender, affiliation, or image, and it has no identity-document verification function.
- A registration proves only that a wallet submitted a nonzero reference and commitment while contract checks allowed it. A matching commitment establishes a value match for the chosen event, reference, and salt; neither result proves truthfulness, eligibility, or real-world identity.
- Hashes are public and do not encrypt inputs. Low-entropy participant data or salts may be guessed by comparing candidate hashes. Use random references and high-entropy salts; do not hash personal details as a substitute for privacy.
- There is no participant registration withdrawal, suspension, document recovery, or on-chain registration-state mutation beyond initial registration in this version. Closing an event blocks future registrations but does not change existing records.
- This prototype has not been audited and has no production key-management or private-data-storage design. Protect admin and organizer keys.