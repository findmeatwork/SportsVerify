# SportsVerify Phase 2 — Commit-by-Commit Implementation Plan (for Antigravity)

This document is the single source of truth for extending the existing SportsVerify repository (contracts/, frontend/, docs/) with a backend/ folder, wallet-signature authentication, an event-scoped verifier role, 2-of-2 identity verification, and encrypted off-chain storage of participant data.

---

## 0. RULES FOR THE IMPLEMENTER (READ FIRST, OBEY ALWAYS)

1. Execute ONE commit at a time, in the exact order listed in the Commit Index. Do not start the next commit until the current commit's "Done when" checks pass.
2. Implement EXACTLY what is described. Do not invent features, rename concepts, add libraries that are not listed, or "improve" the design. If something seems missing, follow the closest instruction in this document; the "Resolved Ambiguities" section (Section 2) already settles the known gray areas.
3. Do NOT write comments in any code you produce (no `//`, no `/* */`, no docstrings, no `#`). Code must be self-explanatory through naming.
4. Before the first commit, perform Step 0 (Orientation) below. Mirror the existing repo's conventions (file naming, folder layout, error style, Solidity style, React style, test style). Where this document proposes a path and the repo already has an equivalent convention, follow the repo's convention and keep the same responsibilities.
5. Existing architectural rule that must be preserved: in the frontend, `ethers` is used only inside the service layer and utils (contractService, walletService, errorMapper, utils/participant.js, and new service files). Pages and components never import ethers directly; they call hooks and services.
6. Never put personal data (name, DOB, ID number, images, affiliation details) on-chain in readable form. Never log decrypted personal data to the console.
7. After every commit: run the relevant tests/build (contracts: `npx hardhat test`; frontend: existing build + existing script tests; backend: `npm test`), fix failures, then commit with the exact commit title given.
8. Commit titles use the format `<ID>: <name>` exactly as shown in each heading.

### Step 0 — Orientation (no commit)

Read, in this order: `README.md`, everything in `docs/`, `contracts/contracts/SportsPlayerRegistry.sol`, the contract tests, the deploy script (note exactly how it writes `contract.json` and the ABI into `frontend/src/config/`), `frontend/src/` (pages, components, hooks, config, the blockchain service layer: contractService, walletService, errorMapper, utils/participant.js, WalletProvider/useWallet, validators), and the four Node scripts in `frontend/scripts/`. Note the Node version, module system (ESM vs CJS), and lint/format settings in use. The backend must use plain JavaScript with ES modules (`"type": "module"`), no TypeScript.

---

## 1. FINAL DESIGN SUMMARY (what we are building)

### 1.1 Purpose
Participants register for sports events using a pseudonymous on-chain reference plus a cryptographic commitment. Real identity is verified in person by event-scoped verifiers. The blockchain's job is to witness the verification process: which wallet verified which participant, when, with which evidence hash, and what the outcome was. Personal data lives only in an encrypted backend database and encrypted file storage.

### 1.2 Roles (all roles are event-scoped except the global organizer permission)
- **Participant**: any wallet. Registers for an event with an event ID. Keeps a synthetic participant ID and a salt, and brings them (plus a physical ID) on verification day.
- **Organizer**: a wallet holding the global `ORGANIZER_ROLE` on the contract may create events. The wallet that creates an event becomes that event's organizer (recorded on-chain as the event's `organizer`). The organizer can see all data of their own events but can NOT verify identities.
- **Verifier**: a wallet added by an event's organizer for that specific event. Verifiers can see participant data only after supplying a valid synthetic ID + salt, and can cast one vote (confirm or reject) per participant.
- The same wallet can be organizer of event A, verifier of event B and participant in event C. Authorization is always checked per event.
- The organizer of an event can never be a verifier of that same event.

### 1.3 Where each piece of data lives
| Data | Location |
|---|---|
| Event ID, name, organizer wallet, created time, event deadline, registration deadline, registration-open flag, cancelled flag | On-chain |
| Event status Active / Cancelled / Finished | Computed live on-chain from `cancelled` and `eventDeadline`; never stored |
| Participant: synthetic ID (bytes32), commitment, registrant wallet, submitted time, status, DOB hash, hasAffiliation flag | On-chain |
| Participant status Registered(Unconfirmed) / Confirmed / Rejected | On-chain |
| Verification votes: verifier wallet, approve/reject, evidence hash, timestamp (max 2 per participant) | On-chain |
| Verifier allow-list per event | On-chain |
| Participant name, DOB, ID number, affiliation organization name, salt, salt2 | Backend DB (AES-256-GCM encrypted fields) |
| Face photo, affiliation proof photo | Backend encrypted file storage |
| Verification evidence photos (one per verifier vote) | Backend encrypted file storage; hash on-chain |
| Organizer / verifier real-world profile (name, email, organization) | Backend DB |
| Organizer-to-verifier assignment (wallet + real name of the staff member + who added them) | Backend DB |
| Login nonces | Backend DB (TTL collection) |
| Access logs for personal-data views | Backend DB |

The ID number is NEVER on-chain, not even hashed. The DOB is on-chain only as a salted hash using an independent random salt (`salt2`) that is stored only in the backend DB.

### 1.4 Commitments
- Participant commitment: `keccak256(abi.encode(uint256 eventId, bytes32 participantId, bytes32 salt))` (unchanged from the current project; standard ABI encoding, not packed).
- DOB hash: `keccak256(abi.encode(uint256 eventId, bytes32 participantId, string dob, bytes32 salt2))` where `dob` is the normalized string `YYYY-MM-DD`. `salt2` is a separate random 32-byte value, never equal to `salt`.

### 1.5 Verification state machine (on-chain, exactly 2 verifiers, final)
Statuses: `None(0)`, `Registered(1)` (shown as "Unconfirmed"), `Withdrawn(2)`, `Suspended(3)`, `Confirmed(4)`, `Rejected(5)`. `Withdrawn` and `Suspended` stay unused.
- No votes yet + verifier confirms: record the vote, status stays `Registered`.
- No votes yet + verifier rejects: status becomes `Rejected` immediately and permanently.
- One confirm recorded + a DIFFERENT verifier confirms: status becomes `Confirmed` permanently.
- One confirm recorded + a different verifier rejects: status becomes `Rejected` permanently (one rejection always wins).
- Same wallet votes twice on the same participant: revert.
- Any vote when status is `Confirmed` or `Rejected`: revert with a custom error carrying the current status (frontend shows "already confirmed" / "already rejected").
- Votes are only accepted while the event is Active (not cancelled, event deadline not reached).

### 1.6 Deadlines
- Event deadline (mandatory): after it, no registration, no verification, and the app blocks organizer access to participant data for that event.
- Registration deadline (optional, 0 = none): after it, no registration.
- Cancelled: organizer may cancel only before the event deadline; cancelled events accept no registrations and no verification.

### 1.7 Authentication
Sign-in with wallet. Backend issues a one-time nonce and a message, MetaMask signs it with `personal_sign` (no gas, no transaction), backend recovers the address, checks it matches, issues a JWT session. Roles are NOT stored in the JWT; they are checked on-chain on each request (organizer role global, organizer-of-event, verifier-of-event).

---

## 2. RESOLVED AMBIGUITIES (decisions taken; implement as stated)

1. Who may create events: wallets holding global `ORGANIZER_ROLE` (deployer has it by default; others are granted via a small admin script). The creator becomes the event's organizer (event-scoped).
2. "Enter wallet address" in login screens means: click Connect, MetaMask provides the address, user signs the nonce message. Typing an address is NOT an authentication method anywhere.
3. After login, organizers and verifiers pick an event from a list of events their wallet has access to (instead of typing an event name). Every API call and every contract call still carries the event ID and is authorized per event.
4. The contract stores `dobHash` and `hasAffiliation` per registration; the ID number is never on-chain.
5. Verification votes are stored on-chain as an array of at most two records per participant (verifier, approved, evidenceHash, timestamp). This replaces a separate `hasVoted` mapping and gives the same behavior.
6. After the event deadline the app blocks organizer access to participant data, images and evidence (as specified). The data remains in the DB; only API access is closed.
7. A verifier, after a valid lookup, sees: DOB, ID number, face photo, and if the participant has an affiliation: affiliation organization name and affiliation proof photo. The verifier does NOT see the participant's name.
8. Evidence is a live webcam snapshot taken in the browser at verification time (no file upload allowed), as a JPEG. The evidence hash is `keccak256` of the JPEG bytes.
9. Participants also sign in with their wallet before submitting personal data, so the backend can verify the submitter owns the on-chain registration.
10. Registration deadline stays optional; event deadline is mandatory.
11. The admin (`DEFAULT_ADMIN_ROLE`) keeps the existing right to open/close registration of any event; only the recorded organizer can cancel an event or add verifiers.
12. Duplicate real-identity detection (same ID number twice in one event) is implemented as a small optional commit near the end (E1).

---

## 3. GLOBAL CONVENTIONS

### 3.1 Folder layout to create
```
backend/
  package.json
  .env.example
  .gitignore
  src/
    server.js
    app.js
    config/        (env.js, contract.json, SportsPlayerRegistry.abi.json)
    db/            (connect.js)
    models/        (AuthNonce, Profile, VerifierAssignment, Participant, VerificationEvidence, AccessLog)
    services/      (chainService, cryptoService, fileStorageService, accessLogService, authService)
    middleware/    (requireAuth, requireOrganizerRole, requireEventOrganizer, requireEventVerifier, upload, errorHandler)
    routes/        (index, auth, participant, organizer, verifier)
    utils/         (errors, validators)
    tests/
  scripts/         (e2e-smoke.js)
  storage/         (gitignored, encrypted files)
```

### 3.2 Backend stack
Node (existing version), Express 5.x, Mongoose 8.x, dotenv, cors, multer (memory storage), jsonwebtoken, ethers v6 (same major version as the frontend). Tests with the built-in `node:test` runner (no extra test library). Encryption with Node's built-in `crypto`. No other dependencies.

### 3.3 Backend environment variables (`backend/.env.example`)
`PORT` (default 4000), `MONGO_URI` (mongodb://localhost:27017/sportsverify), `JWT_SECRET`, `PII_ENCRYPTION_KEY` (64 hex chars = 32 bytes), `DUP_CHECK_KEY` (64 hex chars, used only in commit E1), `RPC_URL` (http://127.0.0.1:8545 for local), `CHAIN_ID` (31337 local or 11155111 Sepolia), `CORS_ORIGIN` (http://localhost:5173), `STORAGE_DIR` (./storage), `NONCE_TTL_SECONDS` (default 300), `SESSION_TTL_HOURS` (default 8), `LOOKUP_TOKEN_TTL_SECONDS` (default 600), `MAX_UPLOAD_MB` (default 5). The server must refuse to start with a clear error if a required variable is missing or if the encryption keys are not exactly 64 hex characters.

### 3.4 Frontend environment variable
`VITE_API_BASE_URL` (default http://localhost:4000/api).

### 3.5 API conventions
- Base path `/api`. JSON bodies except multipart endpoints. Wallet addresses are lowercased before storing or comparing.
- Auth: header `Authorization: Bearer <jwt>`.
- Every error response has the shape `{ "error": { "code": "<CODE>", "message": "<human readable>" } }` with an appropriate HTTP status.
- Error codes used: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_ORGANIZER_ROLE`, `NOT_EVENT_ORGANIZER`, `NOT_EVENT_VERIFIER`, `NOT_A_VERIFIER`, `PROFILE_REQUIRED`, `EVENT_NOT_FOUND`, `EVENT_NOT_ACTIVE`, `EVENT_ENDED_ACCESS_CLOSED`, `VALIDATION_ERROR`, `NOT_ON_CHAIN`, `COMMITMENT_MISMATCH`, `DOB_HASH_MISMATCH`, `AFFILIATION_MISMATCH`, `ALREADY_SUBMITTED`, `PARTICIPANT_NOT_FOUND`, `INVALID_SALT`, `ALREADY_CONFIRMED`, `ALREADY_REJECTED`, `YOU_ALREADY_VOTED`, `TX_NOT_FOUND`, `TX_EVENT_MISMATCH`, `EVIDENCE_HASH_MISMATCH`, `DUPLICATE_IDENTITY`.
- Event status strings in API responses: `ACTIVE`, `CANCELLED`, `FINISHED`. Participant verification status strings: `UNCONFIRMED` (chain Registered), `CONFIRMED`, `REJECTED`.

### 3.6 Run order for local development (document this in README/DEPLOYMENT in E3)
1. `sudo service mongod start` (WSL). 2. `npx hardhat node` in `contracts/`. 3. Deploy script in `contracts/` (writes config into frontend and backend). 4. `npm run dev` in `backend/`. 5. `npm run dev` in `frontend/`.

---

## 4. COMMIT INDEX

Phase A — Smart contract (`contracts/`)
- A1: Event deadline and live event status
- A2: Organizer-only event cancellation
- A3: Registration extension (DOB hash, affiliation flag) and stricter guards
- A4: Event-scoped verifier management
- A5: Two-verifier verification state machine
- A6: Deploy script writes backend config, plus grant-organizer script

Phase B — Frontend chain layer
- B1: Refresh ABI and extend contractService for the new contract
- B2: Participant utilities, error mapping and script updates

Phase C — Backend
- C1: Scaffold backend project, env validation and health route
- C2: MongoDB connection and AuthNonce model
- C3: Chain service (read-only contract access and transaction verification helpers)
- C4: Crypto service (field encryption, file encryption, commitment recomputation)
- C5: Wallet-signature authentication and JWT middleware
- C6: Encrypted file storage and upload middleware
- C7: Access log model and service
- C8: Profile model and organizer onboarding endpoints
- C9: Verifier onboarding and events endpoints
- C10: Participant intake endpoint with on-chain cross-checks
- C11: Organizer participant list, image and access-window endpoints
- C12: Verifier assignment endpoints
- C13: Verifier lookup endpoint with commitment gate and lookup token
- C14: Verification evidence upload and organizer evidence endpoints

Phase D — Frontend application
- D1: API client and wallet-signature session
- D2: Routing restructure and three-way landing page
- D3: Participant step 1, event ID validation
- D4: Participant step 2, details form
- D5: Participant submission orchestration and receipt page
- D6: Organizer login, onboarding and dashboard home
- D7: Organizer create event page
- D8: Organizer My Events list with cancellation
- D9: Organizer event detail and participant list
- D10: Organizer verifier management
- D11: Organizer on-demand verification evidence viewer
- D12: Verifier login, onboarding and event list
- D13: Verifier participant lookup
- D14: Verifier review page and evidence capture and vote

Phase E — Finishing
- E1: Duplicate real-identity check
- E2: End-to-end smoke script
- E3: Documentation update
- E4: Final consistency pass

---

# PHASE A — SMART CONTRACT

All Phase A work is in `contracts/contracts/SportsPlayerRegistry.sol` and the Hardhat tests. Solidity version stays 0.8.24, OpenZeppelin `AccessControl` stays. Use custom errors (never require-strings), matching the existing style. Keep existing function names and behaviors unless a commit says otherwise. Update the contract tests in the same commit as every contract change. For time-dependent tests use the Hardhat network helpers `time.increase` / `time.increaseTo` (available through the Hardhat toolbox's network-helpers package; if not installed, use `evm_setNextBlockTimestamp` + `evm_mine`).

## A1: Event deadline and live event status

**Goal:** Add the mandatory event deadline and the live-computed Active/Cancelled/Finished status.

**Files:** `SportsPlayerRegistry.sol`, contract test file(s).

**Instructions:**
1. Add a new enum `EventStatus { Active, Cancelled, Finished }`.
2. Extend the `EventData` struct by APPENDING two fields at the end: `eventDeadline` (uint256) and `cancelled` (bool). Do not reorder existing fields.
3. Change `createEvent` to `createEvent(string name, uint256 eventDeadline, uint256 registrationDeadline)`. It stays restricted to `ORGANIZER_ROLE`. Rules: `eventDeadline` is mandatory and must be strictly greater than `block.timestamp`, otherwise revert with new error `InvalidEventDeadline()`. `registrationDeadline` of 0 still means no registration deadline; if non-zero it must be greater than `block.timestamp` and less than or equal to `eventDeadline`, otherwise revert with new error `InvalidRegistrationDeadline()`. New events start with `registrationOpen = true` and `cancelled = false`. The creator is stored as `organizer` exactly as today.
4. Append `eventDeadline` as an additional (non-indexed) parameter at the END of the `EventCreated` event. Keep `id` and `organizer` indexed.
5. Add view `getEventStatus(uint256 eventId) returns (EventStatus)`: reverts `EventNotFound` for unknown IDs; returns `Cancelled` if `cancelled` is true; otherwise returns `Finished` if `block.timestamp >= eventDeadline`; otherwise `Active`. The status is never stored; it is computed on every call.
6. Add view `hasEventEnded(uint256 eventId) returns (bool)`: reverts `EventNotFound` for unknown IDs; returns `block.timestamp >= eventDeadline`.
7. Update `getActiveEvents()` so that an event is included only if its status is `Active`, `registrationOpen` is true, and (`registrationDeadline == 0` or `block.timestamp <= registrationDeadline`). Return type stays the same as today.
8. Do NOT touch `registerParticipant` yet except: it must now also revert if the event is not `Active` (use a new error `EventNotActive(uint256 eventId)`). The full guard set is finished in A3.

**Tests to add/update:** creating an event with missing/past deadline reverts; registration deadline after event deadline reverts; valid creation emits `EventCreated` with the new field; `getEventStatus` returns Active, then Finished after time passes; `hasEventEnded` flips at the deadline; `getActiveEvents` excludes finished events. Update every existing test that called the old `createEvent` signature.

**Done when:** `npx hardhat test` passes.

## A2: Organizer-only event cancellation

**Goal:** Let the event's recorded organizer cancel an Active event before its deadline.

**Files:** `SportsPlayerRegistry.sol`, tests.

**Instructions:**
1. Add `cancelEvent(uint256 eventId)`. Reverts: `EventNotFound` if unknown; new error `NotEventOrganizer(address caller, uint256 eventId)` if `msg.sender` is not the event's recorded organizer (the default admin does NOT get this right); new error `EventAlreadyCancelled(uint256 eventId)` if already cancelled; new error `EventHasEnded(uint256 eventId)` if `block.timestamp >= eventDeadline`.
2. On success set `cancelled = true`. Do not modify `registrationOpen`; the status function already reports `Cancelled`.
3. Add event `EventCancelled(uint256 indexed eventId, address indexed organizer, uint256 cancelledAt)` and emit it.

**Tests:** organizer can cancel; non-organizer and admin cannot; cannot cancel twice; cannot cancel after the deadline; status becomes Cancelled and stays Cancelled even after the deadline passes; registration into a cancelled event reverts with `EventNotActive`.

**Done when:** tests pass.

## A3: Registration extension (DOB hash, affiliation flag) and stricter guards

**Goal:** Extend the stored registration and finalize the guards on `registerParticipant`.

**Files:** `SportsPlayerRegistry.sol`, tests.

**Instructions:**
1. Extend the `Registration` struct by APPENDING `dobHash` (bytes32) and `hasAffiliation` (bool).
2. Extend the `RegistrationStatus` enum by APPENDING `Confirmed` (value 4) and `Rejected` (value 5). Keep `None`, `Registered`, `Withdrawn`, `Suspended` in their existing positions.
3. Change `registerParticipant` to `registerParticipant(uint256 eventId, bytes32 participantId, bytes32 commitment, bytes32 dobHash, bool hasAffiliation)`. Public, anyone can call. Guards, in this order: event exists (`EventNotFound`); event not cancelled and event deadline not reached (`EventNotActive`); `registrationOpen` true (`RegistrationIsClosed`); registration deadline is 0 or not passed (`RegistrationDeadlinePassed`); `participantId != 0` (`ZeroParticipantId`); `commitment != 0` (`ZeroCommitment`); new error `ZeroDobHash()` if `dobHash == 0`; no existing registration for the same event/participant (`ParticipantAlreadyRegistered`). On success store the struct with status `Registered`, `registrant = msg.sender`, `submittedAt = block.timestamp`.
4. Append `bool hasAffiliation` and `bytes32 dobHash` (non-indexed) to the END of the `ParticipantRegistered` event parameters; keep existing parameters and their indexing.
5. `getParticipant`, `isRegistered`, `verifyCommitment`, `getEventRegistrationCount`, `getEventParticipantIds` keep their behavior. `isRegistered` still means status `Registered`; `verifyCommitment` still requires status `Registered`.

**Tests:** all guards revert with the right error; duplicate rejection; the stored struct includes the dobHash and the flag; cancelled and ended events refuse registration; `verifyCommitment` behavior unchanged.

**Done when:** tests pass.

## A4: Event-scoped verifier management

**Goal:** Let the event's organizer allow-list verifier wallets for that event only.

**Files:** `SportsPlayerRegistry.sol`, tests.

**Instructions:**
1. Add a private/internal mapping from event ID to verifier address to bool, and a public view `isVerifier(uint256 eventId, address account) returns (bool)`.
2. Add `addVerifier(uint256 eventId, address verifier)`. Reverts, in order: `EventNotFound`; `NotEventOrganizer` if caller is not the event's recorded organizer; `EventNotActive` if the event is cancelled or ended; new error `ZeroAddressVerifier()` if `verifier` is the zero address; new error `OrganizerCannotBeVerifier(uint256 eventId, address account)` if `verifier` equals the event's organizer; new error `VerifierAlreadyAdded(uint256 eventId, address verifier)` if already added.
3. Add event `VerifierAdded(uint256 indexed eventId, address indexed verifier, address indexed addedBy, uint256 addedAt)`; emit on success.
4. There is no removal function in this version.

**Tests:** only the event's organizer can add; cannot add the organizer as a verifier; duplicates revert; a verifier of event 1 is not a verifier of event 2; adding to cancelled/ended events reverts; event emitted with correct indexed values.

**Done when:** tests pass.

## A5: Two-verifier verification state machine

**Goal:** Implement on-chain voting that decides Confirmed / Rejected, storing verifier addresses and evidence hashes.

**Files:** `SportsPlayerRegistry.sol`, tests.

**Instructions:**
1. Add a struct `VerificationRecord { address verifier; bool approved; bytes32 evidenceHash; uint256 timestamp; }` and a mapping event ID -> participant ID -> `VerificationRecord[]` (at most 2 entries will ever exist).
2. Add `submitVerification(uint256 eventId, bytes32 participantId, bool approved, bytes32 evidenceHash)`. Checks in this order, each with a custom error: event exists (`EventNotFound`); caller is a verifier of this event (new error `NotEventVerifier(address caller, uint256 eventId)`); event not cancelled and not ended (`EventNotActive`); participant registration exists, i.e. status is not `None` (new error `ParticipantNotRegistered(uint256 eventId, bytes32 participantId)`); status is exactly `Registered`, otherwise revert new error `VerificationFinalized(uint256 eventId, bytes32 participantId, RegistrationStatus status)` carrying the current status; `evidenceHash != 0` (new error `ZeroEvidenceHash()`); caller has not already voted for this participant (new error `VerifierAlreadyVoted(uint256 eventId, bytes32 participantId, address verifier)`), determined by scanning the record array.
3. Apply the vote exactly per the state machine in Section 1.5: push the record; if `approved` is false set status `Rejected`; else if this is the second record (the first being an approval by a different wallet) set status `Confirmed`; else leave status `Registered`.
4. Add event `VerificationVoted(uint256 indexed eventId, bytes32 indexed participantId, address indexed verifier, bool approved, bytes32 evidenceHash, uint8 resultingStatus, uint256 timestamp)` and emit it on every successful vote.
5. Add view `getVerifications(uint256 eventId, bytes32 participantId) returns (VerificationRecord[] memory)`.
6. `verifyCommitment` and `isRegistered` keep requiring status `Registered` (so they return false after finalization; this is intended).

**Tests (must cover the entire table):** single confirm keeps Registered; confirm + different confirm = Confirmed; confirm + different reject = Rejected; first-vote reject = Rejected; same wallet twice reverts `VerifierAlreadyVoted`; any vote after Confirmed or Rejected reverts `VerificationFinalized` with the status; non-verifier reverts; verifier of another event reverts; organizer cannot vote; voting on cancelled/ended events reverts; zero evidence hash reverts; `getVerifications` returns the stored addresses and hashes; event emitted with correct `resultingStatus`.

**Done when:** tests pass.

## A6: Deploy script writes backend config, plus grant-organizer script

**Goal:** Make deployment feed both frontend and backend, and let the admin authorize new organizer wallets.

**Files:** deploy script, new `contracts/scripts/grant-organizer.*`, `backend/src/config/` (generated files), `.gitignore` if needed.

**Instructions:**
1. Extend the existing deploy script so that, in addition to writing the frontend config exactly as it does today, it also writes `backend/src/config/contract.json` (address, chainId, network name, deployment block number, deployer) and `backend/src/config/SportsPlayerRegistry.abi.json` (same ABI as the frontend gets). Create the `backend/src/config/` directory if it does not exist. Record the deployment block number in BOTH the frontend and backend `contract.json` (add the field if absent).
2. Keep all existing safety checks (reject mainnet, only local/Sepolia, nonzero balance).
3. Add a script `grant-organizer` that takes an address argument, reads the deployed contract address from the generated config, connects as the deployer (default admin) and calls `grantRole(ORGANIZER_ROLE, address)`. It must fail clearly if the caller is not admin, and print the transaction hash.
4. Mention both scripts in a short usage note in `docs/DEPLOYMENT.md` (full docs pass is E3).

**Done when:** deploying to the local Hardhat node regenerates frontend and backend configs, and `grant-organizer` successfully grants the role to a second Hardhat account (verify with `hasRole` in a Hardhat console session or a tiny test).

---

# PHASE B — FRONTEND CHAIN LAYER

Phase B keeps the existing frontend compiling and its tests/scripts passing against the new contract. It does not build new UI.

## B1: Refresh ABI and extend contractService for the new contract

**Goal:** Make the single contract access point (contractService) aware of every new function.

**Files:** `frontend/src/config/*` (regenerated by deploy), `contractService.js`, any existing page that calls the old signatures (minimal compile-only adjustments).

**Instructions:**
1. Run the local Hardhat node, deploy, and confirm the frontend config and ABI are regenerated.
2. In `contractService`, keep all existing helpers and update them: `createEvent(name, eventDeadlineUnix, registrationDeadlineUnix)`; `registerParticipant(eventId, participantId, commitment, dobHash, hasAffiliation)`. Event objects returned by read helpers must now include `eventDeadline` and `cancelled`, normalized to plain numbers/booleans like the existing integer normalization does.
3. Add helpers (all in contractService, all following the existing reads-via-provider / writes-via-signer split): `getEventStatus(eventId)` returning the strings `ACTIVE | CANCELLED | FINISHED`; `hasEventEnded(eventId)`; `cancelEvent(eventId)`; `addVerifier(eventId, verifierAddress)`; `isVerifier(eventId, address)`; `submitVerification(eventId, participantId, approved, evidenceHash)`; `getVerifications(eventId, participantId)` returning an array of `{ verifier, approved, evidenceHash, timestamp }`. `getParticipant` must now return `dobHash` and `hasAffiliation` and map status numbers to the strings `NONE | UNCONFIRMED | WITHDRAWN | SUSPENDED | CONFIRMED | REJECTED` (value 1 maps to `UNCONFIRMED`).
4. Write helpers must return the transaction hash and the receipt after `tx.wait()`, like existing helpers.
5. The existing pages (old Register, old Organizer dashboard) may be adjusted minimally so the project builds (for example passing a placeholder deadline) — they are replaced in Phase D.

**Done when:** `npm run build` succeeds and existing frontend script tests still run (update them in B2 if they fail due to signatures).

## B2: Participant utilities, error mapping and script updates

**Goal:** Add the crypto/formatting helpers and error messages the new flows need.

**Files:** `utils/participant.js`, `errorMapper.js`, validators, `frontend/scripts/*`.

**Instructions:**
1. In `utils/participant.js` add: `generateSalt()` (random bytes32, used for both `salt` and `salt2`, each call independent); `normalizeDob(dateString)` returning `YYYY-MM-DD` and throwing on invalid or future dates; `computeDobHash(eventId, participantId, dob, salt2)` implementing the formula in Section 1.4 using ABI encoding of types `uint256, bytes32, string, bytes32`; `hashBytes(uint8array)` returning `keccak256` of the bytes (used for evidence). Keep existing `computeCommitment` unchanged.
2. In `errorMapper`, add human-readable messages for every new custom error from Phase A: `InvalidEventDeadline`, `InvalidRegistrationDeadline`, `EventNotActive`, `EventAlreadyCancelled`, `EventHasEnded`, `NotEventOrganizer`, `ZeroDobHash`, `ZeroAddressVerifier`, `OrganizerCannotBeVerifier`, `VerifierAlreadyAdded`, `NotEventVerifier`, `ParticipantNotRegistered`, `VerificationFinalized` (message must differentiate Confirmed vs Rejected using the carried status), `ZeroEvidenceHash`, `VerifierAlreadyVoted`.
3. Add validators (with tests in the existing validator script): event deadline must be in the future; registration deadline optional but, if present, in the future and not after the event deadline; DOB valid and not in the future; name length; ID number length 3–64; image file type (jpeg/png/webp) and size ≤ 5 MB.
4. Update the four existing `frontend/scripts/*` tests for the new signatures and add a script test covering `computeDobHash`, `normalizeDob` and `hashBytes` determinism.

**Done when:** all frontend scripts pass against a local deployment.

---

# PHASE C — BACKEND

## C1: Scaffold backend project, env validation and health route

**Goal:** A running empty Express server with strict environment validation.

**Files:** `backend/package.json`, `.env.example`, `.gitignore`, `src/server.js`, `src/app.js`, `src/config/env.js`, `src/utils/errors.js`, `src/middleware/errorHandler.js`, `src/routes/index.js`.

**Instructions:**
1. Create `backend/` as its own Node project with `"type": "module"` and scripts: `dev` (`node --watch src/server.js`), `start`, `test` (`node --test src/tests`). Install dependencies listed in Section 3.2.
2. `config/env.js` loads dotenv, validates every variable in Section 3.3 (types, defaults, 64-hex checks for keys), and exports one frozen config object. It throws with a clear message listing what is missing/invalid.
3. `utils/errors.js` exports an `AppError` class (`status`, `code`, `message`) and small helper constructors. `errorHandler` converts `AppError` into the standard error JSON, converts multer errors (file too large, unexpected field) into `VALIDATION_ERROR`, and converts everything else into a generic 500 `{ error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } }` without leaking stack traces or personal data.
4. `app.js` builds the Express app: CORS restricted to `CORS_ORIGIN`, `express.json` with a small body limit, `GET /api/health` returning `{ status: "ok" }`, a 404 handler returning `{ error: { code: "NOT_FOUND", ... } }`, and the error handler last. `server.js` only starts listening (DB connection added in C2).
5. `.gitignore` for the backend: `node_modules`, `.env`, `storage/`. Add `backend/.env`/`backend/storage` to the root `.gitignore` too if the repo uses one.

**Done when:** `npm run dev` starts, `GET /api/health` returns ok, and starting without `.env` fails with the descriptive error.

## C2: MongoDB connection and AuthNonce model

**Goal:** Connect Mongoose to local MongoDB and define the login nonce collection.

**Files:** `src/db/connect.js`, `src/models/AuthNonce.js`, `src/server.js`.

**Instructions:**
1. `connect.js` connects with `MONGO_URI`, logs success or failure without printing credentials, and exits the process with a non-zero code if the connection fails at startup. `server.js` must connect before listening.
2. `AuthNonce` schema: `address` (lowercase string, indexed), `nonce` (string), `message` (string), `expiresAt` (Date). Add a TTL index on `expiresAt` with `expireAfterSeconds: 0` so Mongo deletes expired nonces automatically. One active nonce per address: creating a new one replaces the previous.

**Done when:** server starts with MongoDB running (`sudo service mongod start`), and a nonce document appears and later disappears after expiry (check once with `mongosh` using a short TTL).

## C3: Chain service (read-only contract access and transaction verification helpers)

**Goal:** One module through which the backend talks to the blockchain, reading the contract and verifying that transactions did what the client claims.

**Files:** `src/services/chainService.js`, `src/tests/chainService.test.js` (light, skippable when no node is available).

**Instructions:**
1. Build an ethers v6 `JsonRpcProvider` from `RPC_URL`, load `config/contract.json` and the ABI, and verify at startup that the provider's chain ID equals `CHAIN_ID` and the contract config's chainId; fail with a clear error otherwise. The backend NEVER holds a private key and never sends transactions.
2. Export read helpers returning plain JSON-safe objects (bigint converted to numbers/strings, statuses mapped to the strings in Section 3.5): `getEvent(eventId)` (null if not found), `getEventStatus(eventId)`, `hasEventEnded(eventId)`, `getRegistration(eventId, participantId)`, `getVerifications(eventId, participantId)`, `isVerifier(eventId, address)`, `hasOrganizerRole(address)`.
3. Export log-query helpers using `queryFilter` from the deployment block (from config) to latest: `getEventsOrganizedBy(address)` (filter `EventCreated` by indexed organizer), `getEventsWhereVerifier(address)` (filter `VerifierAdded` by indexed verifier, then confirm each with `isVerifier`). Both return event IDs; combine with `getEvent` + `getEventStatus` where listing is needed.
4. Export transaction verification helpers that fetch the receipt by hash and parse logs belonging only to the contract address: `verifyVerifierAddedTx(txHash, { eventId, verifier, addedBy })` and `verifyVerificationVotedTx(txHash, { eventId, participantId, verifier })` returning the parsed event arguments (including `approved`, `evidenceHash`). Throw `AppError` `TX_NOT_FOUND` if the receipt is missing or failed, and `TX_EVENT_MISMATCH` if no matching log exists.

**Done when:** a short script or test against a local deployed contract returns an event created by hand.

## C4: Crypto service (field encryption, file encryption, commitment recomputation)

**Goal:** All cryptography the backend needs, in one place, with unit tests.

**Files:** `src/services/cryptoService.js`, `src/tests/cryptoService.test.js`.

**Instructions:**
1. `encryptField(plainText)` / `decryptField(payload)` using AES-256-GCM with `PII_ENCRYPTION_KEY`, a fresh random 12-byte IV per value, and the 16-byte auth tag. The stored representation is a single string `iv:authTag:cipherText` (all base64). Decryption must throw on tampering.
2. `encryptBuffer(buffer)` / `decryptBuffer(buffer)` for files with the same algorithm; the output buffer layout is IV (12 bytes) + auth tag (16 bytes) + ciphertext.
3. `computeCommitment(eventId, participantId, salt)` and `computeDobHash(eventId, participantId, dob, salt2)` identical to the frontend formulas (ethers `AbiCoder.defaultAbiCoder().encode` + `keccak256`), and `hashBytes(buffer)` returning keccak256 hex.
4. Validators in `utils/validators.js`: `isBytes32Hex(value)`, `isNonZeroBytes32(value)`, `isValidDobString`, `isValidAddress` (lowercases).
5. Unit tests with `node:test`: encrypt/decrypt round trip, different IV each time, tamper detection, buffer round trip, commitment/DOB-hash determinism, and a known-vector test that the commitment function matches the value produced by the frontend utility for the same inputs (generate one vector from the frontend util and hardcode it).

**Done when:** `npm test` passes.

## C5: Wallet-signature authentication and JWT middleware

**Goal:** Sign-in with wallet.

**Files:** `src/services/authService.js`, `src/routes/auth.routes.js`, `src/middleware/requireAuth.js`, `src/routes/index.js`.

**Instructions:**
1. `POST /api/auth/nonce` body `{ address }`. Validate the address, generate a random nonce (cryptographically random, 16+ bytes hex), build the message with exactly these lines: `Sign in to SportsVerify`, `Wallet: <checksum address>`, `Nonce: <nonce>`, `Issued At: <ISO timestamp>`. Store/replace the `AuthNonce` document (expiry = now + `NONCE_TTL_SECONDS`) and respond `{ nonce, message, expiresAt }`. The client must sign the returned `message` string unchanged.
2. `POST /api/auth/verify` body `{ address, signature }`. Load the stored nonce document for the address; if missing or expired respond 401 `UNAUTHENTICATED`. Recover the signer with ethers `verifyMessage(storedMessage, signature)`; if it does not equal the address (case-insensitive) respond 401. Delete the nonce document (single use) BEFORE responding. On success sign a JWT (HS256, `JWT_SECRET`, subject = lowercase address, expiry `SESSION_TTL_HOURS`) and respond `{ token, address, expiresAt }`.
3. `requireAuth` reads the Bearer token, verifies it, and sets `req.wallet` (lowercase address). Missing/invalid/expired tokens respond 401 `UNAUTHENTICATED`. Also reject tokens whose `type` claim equals `lookup` (those are for a different purpose, defined in C13).
4. Register the auth routes under `/api/auth` and add one protected route `GET /api/auth/me` returning `{ address }` to test the middleware.

**Done when:** with a script (ethers `Wallet` with a Hardhat private key) you can fetch a nonce, sign, verify and call `/api/auth/me`; reusing the same signature a second time fails; a wrong signer fails.

## C6: Encrypted file storage and upload middleware

**Goal:** Safe handling of uploaded images.

**Files:** `src/services/fileStorageService.js`, `src/middleware/upload.js`.

**Instructions:**
1. `upload.js` exports multer configurations using memory storage with a per-file size limit of `MAX_UPLOAD_MB`, accepting only `image/jpeg`, `image/png`, `image/webp`, and a limit of the expected number of files. Different routes will use field names defined in their own commits.
2. `fileStorageService.saveEncrypted(buffer, mimeType)` encrypts the buffer with `encryptBuffer`, writes it to `STORAGE_DIR` using a random UUID file name with no extension and no user-provided name, and returns `{ fileId, mimeType, size }`. `readDecrypted(fileId)` reads and decrypts, throwing `AppError` 404 if missing. The service must reject any `fileId` that is not a valid UUID (prevent path traversal). The storage directory must NOT be served statically by Express.
3. `sendImage(res, fileId, mimeType)` helper that sets `Content-Type`, `Cache-Control: no-store`, and streams the decrypted bytes.
4. Verify uploaded buffers actually look like the declared image type by checking magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF....WEBP`); reject mismatches with `VALIDATION_ERROR`.

**Done when:** a unit test saves a buffer, confirms the file on disk is not readable as an image (ciphertext), and reading it back returns the original bytes.

## C7: Access log model and service

**Goal:** Record who viewed personal data.

**Files:** `src/models/AccessLog.js`, `src/services/accessLogService.js`.

**Instructions:**
1. `AccessLog` schema: `actor` (lowercase wallet), `role` (`ORGANIZER` | `VERIFIER` | `PARTICIPANT`), `action` (string enum: `LIST_PARTICIPANTS`, `VIEW_IMAGE`, `VIEW_EVIDENCE`, `VIEW_EVIDENCE_IMAGE`, `LOOKUP_SUCCESS`, `LOOKUP_FAILED`, `UPLOAD_EVIDENCE`, `SUBMIT_DETAILS`), `eventId` (number), `participantId` (string, optional), `meta` (small object, no personal data), `createdAt`.
2. `accessLogService.log({ actor, role, action, eventId, participantId, meta })` writes a document and never throws to the caller (it must catch its own errors and write a console warning without personal data).
3. No endpoints are exposed for reading logs in this version.

**Done when:** a unit/manual call creates a document.

## C8: Profile model and organizer onboarding endpoints

**Goal:** Organizer account creation after on-chain role verification, plus event-level authorization middleware.

**Files:** `src/models/Profile.js`, `src/middleware/requireOrganizerRole.js`, `src/middleware/requireEventOrganizer.js`, `src/routes/organizer.routes.js`.

**Instructions:**
1. `Profile` schema (used for both organizers and verifiers): `address` (unique, lowercase), `name`, `email`, `organization` (optional). Store `name`, `email`, `organization` encrypted using `encryptField`. Provide helper functions to read/write that transparently encrypt/decrypt.
2. `requireOrganizerRole` calls `chainService.hasOrganizerRole(req.wallet)`; if false respond 403 `NOT_ORGANIZER_ROLE` ("This wallet is not authorized as an organizer").
3. `requireEventOrganizer` reads `:eventId`, validates it is a positive integer, loads the event from chain (404 `EVENT_NOT_FOUND` if missing) and requires `event.organizer` to equal `req.wallet`, else 403 `NOT_EVENT_ORGANIZER`. It attaches `req.event` for handlers.
4. `GET /api/organizer/me` (auth + organizer role): returns `{ address, profile: null | { name, email, organization } }`. `PUT /api/organizer/profile` (auth + organizer role): validate name (1–100 chars) and email (basic format) and optional organization (max 100), upsert the profile, return it.
5. `GET /api/organizer/events` (auth + organizer role): returns the events from `getEventsOrganizedBy(req.wallet)`, each as `{ eventId, name, status, eventDeadline, registrationDeadline, registrationOpen, createdAt, participantCount }` where `participantCount` is the on-chain registration count. Newest first. Return an empty array if none.
6. Respond `PROFILE_REQUIRED` (403) from event-management endpoints in later commits ONLY where noted; for now organizers may read their events without a profile, but the frontend forces profile creation at first login (D6).

**Done when:** a scripted login using a wallet with the organizer role returns `/organizer/me` with `profile: null`; a wallet without the role gets 403; creating a profile then fetching it shows decrypted values while MongoDB itself shows encrypted strings.

## C9: Verifier onboarding and events endpoints

**Goal:** Verifier account flow mirroring the organizer flow.

**Files:** `src/middleware/requireEventVerifier.js`, `src/routes/verifier.routes.js`.

**Instructions:**
1. `requireEventVerifier` reads `:eventId`, loads the event from chain (404 if missing), and requires `chainService.isVerifier(eventId, req.wallet)` to be true, else 403 `NOT_EVENT_VERIFIER`. It attaches `req.event`.
2. `GET /api/verifier/me` (auth): finds events where the wallet is a verifier via `getEventsWhereVerifier`. If none, respond 403 `NOT_A_VERIFIER` ("This wallet has no verifier privileges for any event"). Otherwise return `{ address, profile: null | {name,email,organization}, eventCount }`.
3. `PUT /api/verifier/profile` (auth, must be verifier of at least one event): same validation and encryption as the organizer profile (same `Profile` collection and helpers).
4. `GET /api/verifier/events` (auth, verifier of at least one event): list `{ eventId, name, status, eventDeadline, selectable }` where `selectable` is true only when status is `ACTIVE`. Newest first.

**Done when:** a wallet added as verifier on-chain (after A4) can log in and list its events; any other wallet gets 403.

## C10: Participant intake endpoint with on-chain cross-checks

**Goal:** Store a participant's personal data only if it provably belongs to an on-chain registration made by the signed-in wallet.

**Files:** `src/models/Participant.js`, `src/routes/participant.routes.js`, `src/services/participantService.js`.

**Instructions:**
1. `Participant` schema: `eventId` (number), `participantId` (lowercase bytes32 hex), `registrant` (lowercase address), encrypted strings `name`, `dob`, `idNumber`, `affiliationOrg` (optional), `salt`, `salt2`; `faceImage` (`{ fileId, mimeType }`), `affiliationProof` (`{ fileId, mimeType }`, optional); `hasAffiliation` (boolean); `createdAt`. Unique compound index on (`eventId`, `participantId`).
2. `POST /api/participants` (auth, multipart). Text fields: `eventId`, `participantId`, `salt`, `salt2`, `name`, `dob`, `idNumber`, `affiliationOrg` (optional). Files: `faceImage` (required, 1 file), `affiliationProof` (optional, 1 file).
3. Validation (400 `VALIDATION_ERROR`): `eventId` positive integer; `participantId`, `salt`, `salt2` are non-zero bytes32 hex and `salt !== salt2`; `name` 1–100 chars; `dob` valid `YYYY-MM-DD` not in the future; `idNumber` 3–64 chars; `affiliationOrg` ≤ 100 chars; images valid per C6.
4. On-chain cross-checks, in order, via `chainService`: event exists (404 `EVENT_NOT_FOUND`); registration record exists with status not `NONE` (404 `NOT_ON_CHAIN`); on-chain `registrant` equals `req.wallet` (403 `FORBIDDEN`); recomputed commitment from `salt` equals on-chain commitment (400 `COMMITMENT_MISMATCH`); recomputed DOB hash from `dob` and `salt2` equals on-chain `dobHash` (400 `DOB_HASH_MISMATCH`); the on-chain `hasAffiliation` equals whether both `affiliationOrg` and `affiliationProof` were provided (400 `AFFILIATION_MISMATCH`; providing only one of the two is also `AFFILIATION_MISMATCH`).
5. If a Participant already exists for (eventId, participantId) respond 409 `ALREADY_SUBMITTED`.
6. Save images through `fileStorageService`, encrypt text fields, insert the document, log `SUBMIT_DETAILS` in the access log (role `PARTICIPANT`), respond 201 `{ eventId, participantId, stored: true }`. If DB insert fails after images are written, delete the written files.
7. Never return stored personal data in this response.

**Done when:** a script that registers on-chain with a Hardhat account and then posts matching details gets 201; posting from a different wallet, with a wrong salt, or twice fails with the specific codes.

## C11: Organizer participant list, image and access-window endpoints

**Goal:** Organizers can read everything stored for their own events (read-only), until the event deadline.

**Files:** `src/routes/organizer.routes.js`, `src/services/participantService.js`, a small middleware or helper `ensureEventAccessOpen`.

**Instructions:**
1. `ensureEventAccessOpen(eventId)` calls `chainService.hasEventEnded`; if true throw 403 `EVENT_ENDED_ACCESS_CLOSED` ("This event has ended; participant data is no longer accessible through the app"). Use it in every route in this commit and later in verifier routes.
2. `GET /api/organizer/events/:eventId/participants` (auth, `requireEventOrganizer`, access window open). For each Participant document of the event, return decrypted: `participantId`, `name`, `dob`, `idNumber`, `affiliationOrg` (or null), `hasAffiliation`, `salt`, `registrant`, `createdAt`, plus on-chain facts: `status` (UNCONFIRMED | CONFIRMED | REJECTED), `confirmations` (number of approving on-chain records), `commitmentStatus` (`VALID` when a commitment recomputed from the stored salt equals the on-chain commitment, otherwise `INVALID`) and `dobHashStatus` (`VALID`/`INVALID`, same idea with stored `dob` and `salt2`). Do NOT include `salt2` or image data in the list. Also include participants that are registered on-chain but have no DB record yet as `{ participantId, registrant, status, detailsMissing: true }` (from `getEventParticipantIds` pagination). Log one `LIST_PARTICIPANTS` entry (role `ORGANIZER`, meta: count).
3. `GET /api/organizer/events/:eventId/participants/:participantId/images/:kind` where `kind` is `face` or `affiliation` (auth, `requireEventOrganizer`, access window open). Stream the decrypted image with `sendImage`; 404 `PARTICIPANT_NOT_FOUND` if absent or the kind does not exist. Log `VIEW_IMAGE`.
4. All responses are read-only; no update or delete endpoints exist for participants.

**Done when:** after C10's script, the organizer sees the full decrypted record and images; another wallet gets 403 `NOT_EVENT_ORGANIZER`; after advancing the Hardhat clock past the event deadline the same calls return 403 `EVENT_ENDED_ACCESS_CLOSED`.

## C12: Verifier assignment endpoints

**Goal:** Tie each on-chain verifier wallet to a real person, recorded when the organizer adds them.

**Files:** `src/models/VerifierAssignment.js`, `src/routes/organizer.routes.js`.

**Instructions:**
1. `VerifierAssignment` schema: `eventId`, `address` (lowercase), encrypted `name`, encrypted `contact` (optional), `addedBy` (lowercase organizer wallet), `txHash`, `createdAt`. Unique compound index (`eventId`, `address`) and unique `txHash`.
2. `POST /api/organizer/events/:eventId/verifiers` (auth, `requireEventOrganizer`) body `{ address, name, contact?, txHash }`. The organizer first sends the on-chain `addVerifier` transaction from their own wallet (frontend, D10); this endpoint records it. Validate fields (name 1–100). Call `verifyVerifierAddedTx(txHash, { eventId, verifier: address, addedBy: req.wallet })`; failures map to `TX_NOT_FOUND` or `TX_EVENT_MISMATCH`. Also require `isVerifier(eventId, address)` true on-chain. Insert the assignment; respond 201. Duplicate -> 409 with code `VALIDATION_ERROR` and message "Verifier already recorded".
3. `GET /api/organizer/events/:eventId/verifiers` (auth, `requireEventOrganizer`): list `{ address, name, contact, addedAt }` decrypted. This endpoint is NOT blocked by the access window (it contains no participant data).

**Done when:** adding a verifier on-chain then posting its txHash records it; posting a txHash from another event/wallet fails with `TX_EVENT_MISMATCH`.

## C13: Verifier lookup endpoint with commitment gate and lookup token

**Goal:** A verifier gets a participant's data only after proving they were given the participant's synthetic ID and salt, and only for an Active event.

**Files:** `src/routes/verifier.routes.js`, `src/services/participantService.js`, JWT helper in `authService`.

**Instructions:**
1. `POST /api/verifier/events/:eventId/lookup` (auth, `requireEventVerifier`) body `{ participantId, salt }`. Steps in order: event status must be `ACTIVE` else 403 `EVENT_NOT_ACTIVE` (if ended respond `EVENT_ENDED_ACCESS_CLOSED`); load the on-chain registration; if status `NONE` respond 404 `PARTICIPANT_NOT_FOUND`; if `CONFIRMED` respond 409 `ALREADY_CONFIRMED` ("This participant is already verified"); if `REJECTED` respond 409 `ALREADY_REJECTED`; if the calling wallet is already in the on-chain verification records respond 409 `YOU_ALREADY_VOTED`.
2. Gate: recompute `commitment = computeCommitment(eventId, participantId, salt)` and require it to equal the on-chain commitment (use the chain's `verifyCommitment` through chainService, which also requires status Registered). On failure log `LOOKUP_FAILED` and respond 403 `INVALID_SALT` ("The participant ID and salt do not match"). Do not reveal whether the participant ID exists on failures beyond this message once the status checks above have passed.
3. On success load the Participant document (404 `PARTICIPANT_NOT_FOUND` if details were never submitted) and respond with ONLY: `participantId`, `dob`, `idNumber`, `hasAffiliation`, `affiliationOrg` (or null), `verificationsSoFar` (number of on-chain approvals), and a `lookupToken`. Never include name, salt, salt2, registrant or file IDs.
4. `lookupToken` is a JWT signed with `JWT_SECRET` containing `type: "lookup"`, subject = verifier wallet, `eventId`, `participantId`, and expiry `LOOKUP_TOKEN_TTL_SECONDS`. Log `LOOKUP_SUCCESS` (role `VERIFIER`).
5. `GET /api/verifier/events/:eventId/participants/:participantId/images/:kind` (`kind` = `face` | `affiliation`) (auth, `requireEventVerifier`): requires a header `X-Lookup-Token` that verifies, is of type `lookup`, and matches wallet, eventId and participantId; also re-check the event is `ACTIVE`. Stream the decrypted image; log `VIEW_IMAGE` (role `VERIFIER`). Without a valid token respond 403 `FORBIDDEN`.

**Done when:** with a verifier wallet, a wrong salt gets 403 `INVALID_SALT`; the right salt returns the limited fields and a token; images only load with the token; a confirmed participant returns `ALREADY_CONFIRMED`; an ended event returns `EVENT_ENDED_ACCESS_CLOSED`.

## C14: Verification evidence upload and organizer evidence endpoints

**Goal:** Store the evidence photo for each on-chain vote and let organizers inspect it on demand.

**Files:** `src/models/VerificationEvidence.js`, `src/routes/verifier.routes.js`, `src/routes/organizer.routes.js`.

**Instructions:**
1. `VerificationEvidence` schema: `eventId`, `participantId`, `verifier` (lowercase wallet), `approved` (boolean), `evidenceHash` (hex), `file` (`{ fileId, mimeType }`), `txHash`, `voteTimestamp` (from chain), `createdAt`. Unique compound index (`eventId`, `participantId`, `verifier`) and unique `txHash`.
2. `POST /api/verifier/events/:eventId/participants/:participantId/evidence` (auth, `requireEventVerifier`, multipart): file field `evidence` (required, JPEG only) and text field `txHash`; header `X-Lookup-Token` required and validated exactly like C13 (so evidence can only be uploaded by a verifier who legitimately looked the participant up). The verifier has ALREADY sent the on-chain `submitVerification` transaction from the frontend before calling this endpoint.
3. Processing: `verifyVerificationVotedTx(txHash, { eventId, participantId, verifier: req.wallet })` (errors `TX_NOT_FOUND`, `TX_EVENT_MISMATCH`); compute `hashBytes` of the uploaded file bytes and require equality with the event's `evidenceHash` (400 `EVIDENCE_HASH_MISMATCH`); then save the encrypted file, insert the `VerificationEvidence` document with `approved`, `evidenceHash` and `voteTimestamp` taken from the chain event, log `UPLOAD_EVIDENCE`, and respond 201 `{ stored: true }`. Duplicate -> 409 `ALREADY_SUBMITTED`. This endpoint is not blocked by the access window if the on-chain vote itself was valid (the vote already required an active event), but the lookup token's short life bounds the delay.
4. Organizer side, all with auth + `requireEventOrganizer` + access window open: `GET /api/organizer/events/:eventId/participants/:participantId/evidence` returns an array of `{ verifier, verifierName (from VerifierAssignment, decrypted, or null), approved, evidenceHash, voteTimestamp, txHash, hashStatus }` where `hashStatus` is `VALID` when the stored file's recomputed hash equals both the stored `evidenceHash` and the matching on-chain record's hash, else `INVALID`; log `VIEW_EVIDENCE`. `GET /api/organizer/events/:eventId/participants/:participantId/evidence/:verifier/image` streams the decrypted evidence image; log `VIEW_EVIDENCE_IMAGE`. Evidence is never part of the default participants list.

**Done when:** after a scripted vote (tx first, then evidence upload) the organizer endpoints return the evidence with `hashStatus: VALID`; uploading a different image than the hash the vote carried fails with `EVIDENCE_HASH_MISMATCH`.

---

# PHASE D — FRONTEND APPLICATION

General frontend rules for Phase D: use plain React 19 + React Router 7 + the existing styling approach (no new UI libraries); pages call hooks/services only; show clear loading, empty and error states; map backend error codes (Section 3.5) and contract errors (errorMapper) to human messages; display all times in the user's local time but send Unix seconds to the contract; label chain status `Registered` as "Unconfirmed", `Confirmed` as "Confirmed", `Rejected` as "Rejected".

## D1: API client and wallet-signature session

**Goal:** One module for backend calls and one for the sign-in session.

**Files:** `frontend/src/services/apiClient.js`, `frontend/src/services/authService.js`, an `AuthProvider` + `useAuth` hook following the same pattern as `WalletProvider`/`useWallet`, `.env.example` entry for `VITE_API_BASE_URL`.

**Instructions:**
1. `apiClient` wraps `fetch`: base URL from `VITE_API_BASE_URL`, automatic JSON handling, `FormData` support for multipart (no manual content-type), automatic `Authorization` header from the current session, and error normalization into an `ApiError` with `code`, `message`, `status`. Support passing an extra headers object (needed for `X-Lookup-Token`) and a `responseType: "blob"` option for images.
2. `authService.signIn(address, signMessage)` performs: request nonce → ask the wallet to sign the returned `message` unchanged using `personal_sign` through walletService (add a `signMessage(message)` function to walletService; ethers stays inside services) → post signature → return `{ token, address, expiresAt }`.
3. `AuthProvider` exposes `session` (`{ token, address }` or null), `signIn()`, `signOut()`, and `isAuthenticated`. Persist the token in `sessionStorage` only. The session must be cleared automatically when: the user switches MetaMask account, switches chain, the token expires, or any API call returns 401 `UNAUTHENTICATED`.
4. `signIn` must show the user what is happening ("Check MetaMask to sign the login message — no gas is used").

**Done when:** a temporary test button can connect, sign in against the running backend and call `/api/auth/me`; switching accounts in MetaMask logs the session out.

## D2: Routing restructure and three-way landing page

**Goal:** Replace the old page structure with the role-based flow.

**Files:** router config, `LandingPage`, shared layout components, new empty page shells, removal of obsolete pages (`OrganizerPlaceholderPage`, old Register/Organizer dashboards once replaced).

**Instructions:**
1. New landing page with three large choices: Participant, Organizer, Verifier, each with a one-line description. Keep the existing network/wallet status display from the current layout.
2. Routes: `/` landing; `/participant` (event ID step); `/participant/register/:eventId`; `/participant/receipt`; `/organizer` (login/onboarding); `/organizer/dashboard`; `/organizer/create`; `/organizer/events`; `/organizer/events/:eventId`; `/verifier` (login/onboarding); `/verifier/events`; `/verifier/events/:eventId`; `/verifier/events/:eventId/review`.
3. Create a `RequireAuth` route guard that redirects to the role's entry page when there is no session. Create temporary shell pages with just a title for routes implemented later.
4. Keep the frontend building and the existing wallet connection UI working. Remove the obsolete pages only when their replacement exists; at the end of Phase D no dead pages should remain.

**Done when:** all routes render shells and the landing buttons navigate.

## D3: Participant step 1, event ID validation

**Goal:** The participant enters an event ID that is validated on-chain.

**Files:** `ParticipantEventIdPage`, a small hook `useEventLookup`.

**Instructions:**
1. A single input for the event ID (positive integer). On submit, read the event directly from the chain via contractService (no login needed): `getEventById` (revert/not found → "Event not found"), then `getEventStatus` and registration conditions.
2. Valid only if: status `ACTIVE`, `registrationOpen` is true, and registration deadline is 0 or not passed. Otherwise show the specific reason (cancelled, finished, registration closed, registration deadline passed).
3. On valid events show the event name, event deadline and registration deadline (if any) and a "Continue" button navigating to `/participant/register/:eventId`. The registration page re-validates the same conditions on load (deep-link safe).

**Done when:** valid IDs continue; invalid/cancelled/finished IDs show the right message.

## D4: Participant step 2, details form

**Goal:** The form where the participant provides personal details, gated by wallet sign-in.

**Files:** `ParticipantRegisterPage`, `ImageUpload` component (reuse the existing component if suitable), form validators.

**Instructions:**
1. On entering the page require: wallet connected on the correct chain, and a backend session (`useAuth().signIn()`), shown as a clear first step "Connect wallet and sign in". The form is disabled until both are done.
2. Fields: full name, date of birth (date input), ID number (text; helper text "number of an ID document that proves your date of birth"), face photo (required image, with preview), and an optional affiliation section: organization name + affiliation proof photo (both required if the section is used; a toggle "I have an affiliation" shows it).
3. Use the validators from B2 (name, DOB, ID number length, image type/size). Show inline field errors. Keep all form values in component state only; nothing is stored in localStorage/sessionStorage.
4. The Submit button leads to the orchestration in D5; in this commit it can call a stub function after validation.

**Done when:** validation works for each field and image preview/removal works.

## D5: Participant submission orchestration and receipt page

**Goal:** Do the on-chain registration and the backend upload in the correct order, then show the receipt.

**Files:** `useRegistration` hook/service module, `ParticipantReceiptPage`, `RegistrationResultCard` (reuse/extend).

**Instructions:**
1. On submit, in order: (a) generate `participantId` (random bytes32, via the existing helper), `salt` and `salt2` (two independent `generateSalt()` calls); (b) compute `commitment` and `dobHash` with the B2 utilities using the normalized DOB; (c) call `contractService.registerParticipant(eventId, participantId, commitment, dobHash, hasAffiliation)` and wait for confirmation, showing a progress indicator "Waiting for blockchain confirmation"; (d) POST the multipart form to `/api/participants` with `eventId`, `participantId`, `salt`, `salt2`, `name`, `dob`, `idNumber`, optional `affiliationOrg`, `faceImage`, optional `affiliationProof`.
2. Failure handling: if the transaction fails, show the mapped error and allow retry (nothing has been stored anywhere). If the transaction succeeded but the backend call failed, keep the generated values and files in memory and show "Your registration is on the blockchain but your details were not saved" with a "Retry saving details" button that repeats only step (d). Never regenerate values or resend the transaction in that state.
3. On full success navigate to `/participant/receipt` (pass data via router state, not storage). The receipt shows: event name and ID, synthetic participant ID, salt, commitment, transaction hash, status "Unconfirmed", and a prominent warning: "Save your participant ID and salt now. You must bring them, together with your physical ID, on verification day. They cannot be recovered." Provide copy buttons and a "Download as text file" button. `salt2` must NOT be shown or exported.
4. Leaving the receipt page without having clicked copy or download should trigger a browser `beforeunload` confirmation.

**Done when:** a full registration works end to end against local chain + backend, the DB contains encrypted data, and refreshing the receipt page loses it (expected).

## D6: Organizer login, onboarding and dashboard home

**Goal:** Organizer gateway.

**Files:** `OrganizerEntryPage`, `OrganizerDashboardHome`, `useOrganizer` hook.

**Instructions:**
1. `/organizer`: step 1 connect wallet, step 2 sign in (via `useAuth`). Then call `GET /api/organizer/me`. On 403 `NOT_ORGANIZER_ROLE` show "This wallet is not authorized as an organizer" with the connected address and no way forward. If `profile` is null show a profile form (name, email, organization optional) that calls `PUT /api/organizer/profile`; only afterwards continue to `/organizer/dashboard`.
2. Dashboard home shows exactly two actions: "Create new event" (→ `/organizer/create`) and "My events" (→ `/organizer/events`), plus the organizer's name and address.
3. Session/wallet changes return the user to `/organizer` (handled by the `RequireAuth` guard).

**Done when:** an organizer-role wallet reaches the dashboard; a non-role wallet is blocked; first login forces the profile form.

## D7: Organizer create event page

**Goal:** Create an event on-chain.

**Files:** `OrganizerCreateEventPage`.

**Instructions:**
1. Fields: event name (1–100 chars), event deadline (required, date-time input, must be in the future), registration deadline (optional, in the future and not after the event deadline). Validate with the B2 validators and show inline errors.
2. Submit converts to Unix seconds and calls `contractService.createEvent`. Show progress while waiting for confirmation. Parse the `EventCreated` log from the receipt to obtain the new event ID.
3. On success show a prominent card: "Event created — Event ID: N. Give this ID to participants before registration." with a copy button, the deadlines in local time, and links to My events.
4. No backend call is needed for event creation (events live on-chain).

**Done when:** creating an event shows its ID and it appears in My events (after D8).

## D8: Organizer My Events list with cancellation

**Goal:** List an organizer's events with live status and the cancel action.

**Files:** `OrganizerEventsPage`, components `EventStatusBadge`, `CancelEventButton`.

**Instructions:**
1. Fetch `GET /api/organizer/events`. If empty show "No events created by you yet" (the specified wording: no active events by you).
2. Each row/card shows: name, event ID, status badge (Active / Cancelled / Finished), event deadline, registration deadline, registrations count, and a "Manage" link to `/organizer/events/:eventId`.
3. For `ACTIVE` events show a "Cancel event" button with a confirmation dialog warning that cancelling blocks further registrations and verification permanently. On confirm call `contractService.cancelEvent`, wait for confirmation, refresh the list. Cancelled and finished events show no cancel button.

**Done when:** cancelling changes the status to Cancelled; registering for that event is then refused on the participant side.

## D9: Organizer event detail and participant list

**Goal:** Read-only full participant data for the organizer's event.

**Files:** `OrganizerEventDetailPage`, `ParticipantTable`/`ParticipantRow` components.

**Instructions:**
1. Header: event name, ID, status badge, deadlines, cancel button (if active), link/tab to Verifiers (D10).
2. Participants section loads `GET /api/organizer/events/:eventId/participants`. If the API returns 403 `EVENT_ENDED_ACCESS_CLOSED`, show a clear notice "This event has ended. Participant data is no longer accessible here." and hide the table.
3. Table columns: name, DOB, ID number, affiliation organization (or "None"), participant ID, salt, commitment status (Valid / Invalid), DOB hash status (Valid / Invalid), verification status (Unconfirmed 0/2, Unconfirmed 1/2, Confirmed, Rejected). Rows with `detailsMissing` show a "Details not submitted" label. Everything is read-only (no edit/delete controls anywhere).
4. Per row, buttons "View face photo" and (if affiliated) "View affiliation proof" fetch the images on demand as blobs through `apiClient` (with auth header) and show them in a modal; never embed image URLs in `<img src>` that bypass the auth header.
5. Add a refresh button.

**Done when:** all fields display correctly; images open; after the deadline passes the notice appears.

## D10: Organizer verifier management

**Goal:** Add and list verifiers for an event.

**Files:** `OrganizerVerifiersPanel`, service additions.

**Instructions:**
1. In the event detail page add a "Verifiers" tab (visible for any status; the add form is only enabled while the event is Active). List from `GET /api/organizer/events/:eventId/verifiers`: wallet address, name, contact, added time.
2. Add form: verifier wallet address (validated as an address, not equal to the organizer's own address), verifier real name (required), contact (optional). Submit flow: (a) call `contractService.addVerifier(eventId, address)` and wait; (b) POST `/api/organizer/events/:eventId/verifiers` with `{ address, name, contact, txHash }`. If (a) succeeded and (b) failed, show "Verifier added on-chain but not recorded" and offer a retry of (b) only.
3. Show a short text explaining that the organizer is vouching for this person and that the assignment is permanently recorded on-chain.

**Done when:** the added verifier appears in the list and can later log in at `/verifier` (D12).

## D11: Organizer on-demand verification evidence viewer

**Goal:** Let organizers inspect verification evidence only when they ask.

**Files:** `OrganizerEvidenceModal`, additions to `ParticipantRow`.

**Instructions:**
1. In each participant row add a secondary button "View verification evidence". It is not loaded by default and the evidence is never in the table.
2. On click fetch `GET .../participants/:participantId/evidence` and show, for each vote: verifier wallet, verifier real name (if recorded), decision (Confirmed / Rejected), vote time, evidence hash, transaction hash, and the hash check result (Valid / Invalid, with a red warning for Invalid). Each vote has a "View evidence photo" button that fetches the image blob on demand.
3. If no votes yet, show "No verification has been submitted for this participant."

**Done when:** after verifications exist (after D14) the modal shows both verifiers and the images.

## D12: Verifier login, onboarding and event list

**Goal:** Verifier gateway mirroring the organizer one.

**Files:** `VerifierEntryPage`, `VerifierEventsPage`, `useVerifier` hook.

**Instructions:**
1. `/verifier`: connect wallet, sign in, call `GET /api/verifier/me`. On 403 `NOT_A_VERIFIER` show "This wallet has no verifier privileges for any event." If `profile` is null show the profile form (name, email, organization optional) → `PUT /api/verifier/profile`. Then continue to `/verifier/events`.
2. `/verifier/events` lists `GET /api/verifier/events`: name, event ID, status, event deadline. Only `ACTIVE` events are clickable (→ `/verifier/events/:eventId`); others are shown disabled with their status label.

**Done when:** a wallet added by an organizer can log in and sees only the events it was added to.

## D13: Verifier participant lookup

**Goal:** The verifier enters the participant's synthetic ID and salt.

**Files:** `VerifierLookupPage`.

**Instructions:**
1. Page `/verifier/events/:eventId` shows the event name and two inputs: participant ID (bytes32 hex) and salt (bytes32 hex), with a note "Ask the participant to show their participant ID and salt, and check their physical ID."
2. Submit calls `POST /api/verifier/events/:eventId/lookup`. Map error codes to clear messages: `INVALID_SALT` ("The participant ID and salt do not match"), `PARTICIPANT_NOT_FOUND`, `ALREADY_CONFIRMED` ("This participant is already verified"), `ALREADY_REJECTED` ("This participant was already rejected"), `YOU_ALREADY_VOTED` ("You have already submitted your verification for this participant"), `EVENT_NOT_ACTIVE` / `EVENT_ENDED_ACCESS_CLOSED`.
3. On success navigate to `/verifier/events/:eventId/review` passing the response (including `lookupToken`) via router state only (never storage).

**Done when:** each error code displays correctly and a valid lookup opens the review page.

## D14: Verifier review page, evidence capture and vote

**Goal:** Cross-check data, capture fresh evidence, cast the on-chain vote, and upload the evidence.

**Files:** `VerifierReviewPage`, `EvidenceCapture` component, services.

**Instructions:**
1. Display returned data: DOB, ID number, and, if `hasAffiliation`, affiliation organization name. Fetch the face photo (and the affiliation proof photo if applicable) as blobs using the lookup token header and show them. Show "Verifications so far: N of 2".
2. `EvidenceCapture`: use `navigator.mediaDevices.getUserMedia` to show a live camera preview and a "Capture" button that draws the current frame to a canvas and produces a JPEG `Blob`. File upload is NOT offered. Show the captured image with a "Retake" option. Instruction text: "Take a photo of the participant holding their ID next to their face." Handle denied/unavailable camera with a clear message (voting stays disabled).
3. Two decision buttons: "Confirm identity" and "Reject identity", enabled only when an evidence photo exists, each with a confirmation prompt.
4. Vote flow in order: (a) compute `evidenceHash = hashBytes(jpegBytes)` via the B2 utility; (b) call `contractService.submitVerification(eventId, participantId, approved, evidenceHash)` and wait for confirmation; (c) POST the JPEG and `txHash` to `/api/verifier/events/:eventId/participants/:participantId/evidence` with header `X-Lookup-Token`. If (b) succeeded and (c) failed, show "Your vote is on-chain but the evidence upload failed" with a retry button for (c) only, keeping the blob in memory. Map `VerificationFinalized` / `VerifierAlreadyVoted` contract errors to clear messages (another verifier may have finished it meanwhile).
5. On success show the outcome: after the vote read `getParticipant` and display the resulting status ("Recorded — 1 of 2 confirmations", "Participant confirmed", or "Participant rejected") and a button back to the event lookup page.

**Done when:** two different verifier wallets confirming results in status Confirmed; a rejection results in Rejected; a third verifier lookup returns "already verified"/"already rejected".

---

# PHASE E — FINISHING

## E1: Duplicate real-identity check

**Goal:** Stop one real ID number from registering twice in the same event.

**Files:** `backend/src/models/Participant.js`, `backend/src/services/cryptoService.js`, `backend/src/routes/participant.routes.js`, frontend registration orchestration, `.env.example`.

**Instructions:**
1. In `cryptoService` add `computeIdDigest(eventId, idNumber)`: normalize the ID number (trim, uppercase, remove spaces and hyphens), then HMAC-SHA256 with `DUP_CHECK_KEY` over `eventId + ":" + normalizedId`, returned as hex. The digest is stored instead of any plain or reversible form.
2. Add `idNumberDigest` to `Participant` with a unique compound index (`eventId`, `idNumberDigest`).
3. New `POST /api/participants/precheck` (auth) body `{ eventId, idNumber }`: responds `{ available: true }` or 409 `DUPLICATE_IDENTITY` ("This ID number is already registered for this event").
4. `POST /api/participants` also computes the digest and maps a duplicate-key error to 409 `DUPLICATE_IDENTITY`.
5. Frontend (D5 flow): call precheck BEFORE sending the transaction. If the final backend save still fails with `DUPLICATE_IDENTITY` after the transaction (race), show the message and explain the on-chain registration exists but will not be verifiable.

**Done when:** registering a second participant with the same ID number in the same event is blocked at precheck; the same ID number in a different event is allowed.

## E2: End-to-end smoke script

**Goal:** One scripted proof that the whole system works.

**Files:** `backend/scripts/e2e-smoke.js`, `package.json` script `e2e`.

**Instructions:** Using Hardhat's default accounts (as ethers `Wallet` objects with their known private keys, local node + MongoDB + backend running and contract deployed), script this sequence and assert each result: grant organizer role to account 1; account 1 signs in and creates an event (via ethers against the contract); account 1 adds accounts 2 and 3 as verifiers and records them via the API; account 4 signs in, registers on-chain and submits details; account 2 signs in, looks up with the correct salt, votes confirm and uploads evidence (generated test JPEG bytes); account 3 does the same, ending with status Confirmed; account 5 (verifier-less) is refused; a further lookup returns `ALREADY_CONFIRMED`; the organizer fetches participants and evidence with `hashStatus: VALID`; advance the Hardhat clock past the event deadline and confirm organizer access returns `EVENT_ENDED_ACCESS_CLOSED`. Print a pass/fail line per step and exit non-zero on the first failure.

**Done when:** the script passes on a clean local setup.

## E3: Documentation update

**Goal:** Make the docs match the system.

**Files:** `README.md`, `docs/ARCHITECTURE.md`, `docs/SMART_CONTRACT.md`, `docs/DEPLOYMENT.md`, `docs/FUTURE_ROADMAP.md`, `docs/MANUAL_TEST_CHECKLIST.md`.

**Instructions:**
1. README: new one-paragraph purpose (the chain witnesses the verification process), new stack list (Express, Mongoose, MongoDB, multer, jsonwebtoken, Node crypto), the run order from Section 3.6, folder overview, and the roles overview.
2. ARCHITECTURE: add the data-placement table (Section 1.3), the three flows (participant, organizer, verifier), the auth flow, the verification state machine and the access-window rule.
3. SMART_CONTRACT: rewrite the interface tables, structs, enums, events and errors for every Phase A change, keeping the document's existing structure.
4. DEPLOYMENT: backend `.env` setup, MongoDB on WSL (`sudo service mongod start`), deploy script outputs, `grant-organizer` usage, Sepolia notes.
5. FUTURE_ROADMAP: remove items now delivered (auth, backend, approval/verification, evidence); keep out-of-scope items (verifier removal, withdrawal/suspension methods, participant status page, rate limiting, production key management, audit, document storage in S3-compatible storage, QR verification).
6. MANUAL_TEST_CHECKLIST: add checklist items for each flow, including every error message in D3, D13 and D14.
7. Add an honest "Limitations" section: collusion between a verifier and a participant is reduced (two independent verifiers, attributable wallets, hashed evidence) but cannot be eliminated; the webcam snapshot proves a photo was captured in the browser, not physical presence; the backend operator can read decrypted data; no audit has been performed; local Hardhat clock can lag real time.

**Done when:** a reader can set up and run the whole system from the docs alone.

## E4: Final consistency pass

**Goal:** Clean finish.

**Instructions:**
1. Run every test suite (contracts, frontend scripts, backend `npm test`, `e2e`). Fix failures.
2. Search the repo for leftovers: old `createEvent`/`registerParticipant` signatures, obsolete pages, unused imports, unused exports, any `console.log` that prints personal data, any comments in code, any use of `ethers` inside React components or pages.
3. Confirm no personal data in any on-chain call, no secrets committed (`.env`, `storage/`), and that `.env.example` files are complete.
4. Confirm the participant receipt never shows or exports `salt2`, that no endpoint returns `salt2` or file IDs, and that the verifier lookup response contains no name.

**Done when:** all suites pass and the checklist above is clean.

---

## 5. FINAL ACCEPTANCE CHECKLIST (the prototype is complete when all are true)

- A non-role wallet cannot create events; a role wallet can, and becomes that event's organizer.
- Event deadline is mandatory; status shows Active, Cancelled or Finished, computed live; cancellation works only before the deadline.
- Participants register with an event ID, are validated against on-chain state, sign in with their wallet, and store encrypted details in MongoDB with images in encrypted storage; the chain holds only reference, commitment, DOB hash and affiliation flag.
- Organizers see the full read-only participant list for their own events until the event deadline, with images on demand and commitment status; they cannot verify.
- Organizers add verifiers per event (on-chain, plus recorded real name in the DB); the organizer cannot be their own event's verifier.
- Verifiers log in by wallet signature, see only events they were added to, unlock a participant only with the correct participant ID + salt, see only DOB, ID number, face photo and affiliation info, capture live evidence, and vote once.
- Two different confirming verifiers produce Confirmed; any rejection produces Rejected; further votes are refused with a clear message.
- Evidence hashes and verifier addresses are on-chain; evidence images are in the DB-side encrypted storage and viewable by the organizer only on demand with a hash validity check.
- Every personal-data view is access-logged.
- No code anywhere contains comments.