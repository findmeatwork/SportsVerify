# SportsPlayerRegistry

`SportsPlayerRegistry` stores public sports-event metadata and pseudonymous participant registrations. The contract uses OpenZeppelin `AccessControl`: the deployer receives both `DEFAULT_ADMIN_ROLE` and `ORGANIZER_ROLE`, and the admin can grant or revoke organizer access. Only organizers can create events. An event's organizer or an admin can open or close its registration.

Event IDs increase from 1. A registration deadline of `0` means there is no deadline. Registration is rejected once the event is closed or its nonzero deadline has passed. Participant IDs are unique only within one event, so the same ID can register for another event. A registration cannot be overwritten.

Use `getEventById(eventId)` to read an event's ID, name, organizer, creation time, registration deadline, and open/closed status. It reverts with `EventNotFound` when the ID does not exist.

## Commitments

Calculate each commitment off-chain as:

```text
keccak256(abi.encode(eventId, participantId, salt))
```

The ABI types are `uint256`, `bytes32`, and `bytes32`, respectively. For example, with ethers v6:

```js
const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
  ["uint256", "bytes32", "bytes32"],
  [eventId, participantId, salt]
);
const commitment = ethers.keccak256(encoded);
```

`verifyCommitment` checks whether a supplied commitment exactly matches the value stored for that event and participant ID. It does not accept or validate the salt; recompute the hash off-chain when opening a commitment. Use a fresh, unpredictable salt for each registration and keep it private until disclosure is intended. A low-entropy secret may be guessed by trying candidate values against public chain data.

## Privacy and limitations

- Do not put names, dates of birth, gender, identity numbers, images, or other personal data in event names, participant IDs, transaction data, or commitments. Blockchain data and emitted event fields are public and generally permanent.
- Hashing does not make an identifying value anonymous. Participant IDs, wallet addresses, transaction timing, and repeated usage may be linkable. Prefer random, event-scoped pseudonymous IDs generated off-chain.
- A successful registration proves only that a wallet submitted a nonzero participant ID and commitment while registration was allowed. It does not prove that the participant is a real person, is eligible, or has been verified by an organizer.
- This is a prototype. It has not been audited and does not provide identity verification, recovery, revocation of registrations, privacy guarantees, or production key management. Role administrators and organizer wallets can affect event availability; protect their keys appropriately.