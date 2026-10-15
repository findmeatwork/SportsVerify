# SportsVerify

## Overview

SportsVerify is a Phase 1 prototype for sports-event registration using a public smart-contract record and a pseudonymous participant reference. The contract stores a cryptographic commitment rather than participant identity details. A registration or commitment match is not proof of real-world identity.

Phase 1 is demo mode only. There is no authentication.

## Problem Statement

Sports organizers need a repeatable way to check whether a supplied participant reference has a registration for an event, without putting identity documents or personal details on a public blockchain. This prototype demonstrates the registration and lookup portions of that flow; identity comparison remains an in-person organizer task.

## Features in Phase 1

- Browse public events whose registration is open, including events with no deadline.
- Generate or enter a synthetic 32-byte participant reference and register it for an event.
- Create an event from the organizer dashboard, with an optional registration deadline.
- Keep the participant's name, date of birth, gender, affiliation details, and selected image files in browser memory only. They are not persisted by this application and are lost on refresh.
- Store the event ID, participant reference, commitment, registrant wallet, timestamp, and registration status on-chain.
- Look up a registration by event and participant reference; optionally compare a supplied salt against the stored commitment.
- Show real-world identity verification as pending. A blockchain registration or commitment match does not establish a person's identity.

## Deferred Features

There is no authentication, backend, database, persistent private-document storage, team roster management, organizer approval workflow, registration withdrawal or suspension workflow, QR verification, or audit-history interface in Phase 1. The contract enum includes `Withdrawn` and `Suspended`, but the current contract has no methods that set those states.

## Tech Stack

- Solidity `0.8.24` source and OpenZeppelin Contracts `5.6.1` dependency.
- Hardhat `2.x` contract development and tests.
- React `19.2.8`, Vite `8.3.0` package range, and React Router `7.18.4`.
- ethers `6.17.0` package range, isolated to the blockchain service layer and utility code.
- Node.js LTS and npm.

## Architecture Overview

The React pages use wallet hooks and the centralized blockchain service. The service reads the configured ABI and deployment address, selects the configured chain, normalizes returned integer values, and handles contract writes. The contract stores event metadata and participant commitments. Names, birth dates, affiliation data, and images are not sent to the contract. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository Structure

```text
.
├── .env.example
├── .gitignore
├── contracts/
│   ├── contracts/SportsPlayerRegistry.sol
│   ├── hardhat.config.js
│   ├── package.json
│   ├── package-lock.json
│   ├── scripts/deploy.js
│   └── test/SportsPlayerRegistry.js
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── FUTURE_ROADMAP.md
│   ├── MANUAL_TEST_CHECKLIST.md
│   └── SMART_CONTRACT.md
└── frontend/
    ├── index.html
    ├── package.json
    ├── package-lock.json
    ├── README.md
    ├── eslint.config.js
    ├── .gitignore
    ├── vite.config.js
    ├── public/
    │   ├── favicon.svg
    │   └── icons.svg
    ├── scripts/
    │   ├── openEventsRegression.mjs
    │   ├── registerFlowCheck.mjs
    │   ├── serviceSmokeTest.mjs
    │   └── validators.test.mjs
    ├── src/
    │   ├── App.jsx
    │   ├── main.jsx
    │   ├── App.css
    │   ├── index.css
    │   ├── assets/
    │   │   ├── hero.png
    │   │   ├── react.svg
    │   │   └── vite.svg
    │   ├── components/
    │   │   ├── Banner.jsx
    │   │   ├── FormField.jsx
    │   │   ├── ImageUpload.jsx
    │   │   ├── RegistrationResultCard.jsx
    │   │   ├── Spinner.jsx
    │   │   ├── TxStatus.jsx
    │   │   └── WalletStatus.jsx
    │   ├── config/
    │   │   ├── SportsPlayerRegistry.abi.json
    │   │   ├── contract.json
    │   │   └── network.js
    │   ├── hooks/
    │   │   ├── WalletProvider.jsx
    │   │   └── useWallet.js
    │   ├── layouts/
    │   │   └── MainLayout.jsx
    │   ├── pages/
    │   │   ├── LandingPage.jsx
    │   │   ├── NotFoundPage.jsx
    │   │   ├── OrganizerDashboard.jsx
    │   │   ├── OrganizerPlaceholderPage.jsx
    │   │   └── RegisterPage.jsx
    │   ├── services/blockchain/
    │   │   ├── contractService.js
    │   │   ├── errorMapper.js
    │   │   └── walletService.js
    │   ├── styles/global.css
    │   └── utils/
    │       ├── participant.js
    │       └── validators.js
```

Hardhat artifacts and cache, installed dependencies, and the Vite build output are generated or ignored files, not source directories to commit.

## Prerequisites

- Node.js LTS with npm.
- Git.
- MetaMask for wallet-based transactions and the manual wallet flows.

Public event browsing and contract tests do not require MetaMask. Local Hardhat accounts and their keys are publicly known test credentials; use them only on the disposable local chain.

## Install

There is no root package manifest. Install each package in its own directory:

```sh
cd contracts && npm install
cd frontend && npm install
```

These are npm CLI installs for the two checked-in package manifests. Do not run `npx hardhat` from the repository root. If npm offers to download a different Hardhat major version, decline; use the installed package scripts from `contracts/` instead.

## Environment Configuration

The only checked-in environment template is the root `.env.example`:

```dotenv
SEPOLIA_RPC_URL=
PRIVATE_KEY=
```

Copy it to the ignored root `.env` for a Sepolia deployment. `SEPOLIA_RPC_URL` is the RPC endpoint used by Hardhat on Sepolia. `PRIVATE_KEY` is the deployer's private key; use a throwaway wallet with no valuable assets. The deploy script requires both for `deploy:sepolia`. Never commit `.env`, a private key, or a recovery phrase. `.env` and `.env.*` are ignored, except `.env.example`.

There is no `frontend/.env.example`. Set `VITE_TARGET_CHAIN` in the shell when starting Vite: `localhost` selects chain `31337`; `sepolia` selects chain `11155111`. The frontend defaults to `sepolia` if the variable is unset. `LOCAL_RPC_URL`, `LOCAL_ORGANIZER_PRIVATE_KEY`, and `LOCAL_PARTICIPANT_PRIVATE_KEY` are optional shell variables used by Node verification scripts; they are not deployment secrets for a production wallet.

## Run Contract Tests

Run the Hardhat test script from `contracts/`:

```sh
cd contracts && npm test
```

This runs `hardhat test` on Hardhat's test network. The tests exercise event creation and roles, event visibility, participant registration, duplicate rejection, counts and pagination, and commitment comparisons. This command does not test browser rendering or MetaMask behavior.

To compile using the existing script:

```sh
cd contracts && npm run compile
```

## Start a Local Node

Compile first, then start the node in a terminal that stays open:

```sh
cd contracts && npm run compile
cd contracts && npm run node
```

The Hardhat node listens at `http://127.0.0.1:8545` and uses chain ID `31337`. Its accounts and keys are public development credentials; do not send real funds to them or use them on a live network.

## Deploy Locally

With the local node running, deploy from another terminal:

```sh
cd contracts && npm run deploy:local
```

This uses the first Hardhat account and writes the deployment address, chain ID, network name, timestamp, transaction hash, and ABI to `frontend/src/config/`. Deployment overwrites the single checked-in deployment record and ABI; keep in mind that `contract.json` represents one most-recent deployment, not multiple network deployments.

## Deploy to Sepolia

Use a throwaway wallet, a Sepolia faucet for test ETH, and an RPC endpoint from a provider. Do not use real funds, a valuable wallet, or share/enter your recovery phrase into this application.

1. Copy `.env.example` to the root `.env` and set `SEPOLIA_RPC_URL` and `PRIVATE_KEY` there.
2. From `contracts/`, run the existing deploy script:

```sh
cd contracts && npm run deploy:sepolia
```

The script checks for both variables, requires a nonzero deployer balance, rejects Ethereum mainnet, and allows only chain IDs Sepolia `11155111` and local `31337`. It waits for one confirmation and overwrites the frontend deployment record and ABI. Select Sepolia in MetaMask and start Vite with `VITE_TARGET_CHAIN=sepolia` after deploying.

**Current checked-in deployment status:** `frontend/src/config/contract.json` has chain ID `31337` and network name `localhost`. Therefore the repository currently records a local deployment, not a Sepolia deployment.

## Configure MetaMask

**Sepolia:** select the built-in Sepolia test network (chain ID `11155111`) or add it using the RPC details from your provider. Obtain test ETH only from a Sepolia faucet. The configured contract must also be deployed on Sepolia before using the app there.

**Hardhat Local:** add a custom network with network name `Hardhat Local`, RPC URL `http://127.0.0.1:8545`, chain ID `31337`, and currency symbol `ETH`. Import only the local account needed for your demo using its private key displayed by the local Hardhat node. Accounts #0, #1, and #2 correspond to organizer, participant, and outsider demo roles described below. Their keys are public and local-only.

## Start the Frontend

For a local Hardhat deployment, set the target chain explicitly:

```sh
cd frontend && VITE_TARGET_CHAIN=localhost npm run dev
```

Vite prints the local URL to open. For Sepolia, use `VITE_TARGET_CHAIN=sepolia npm run dev` after the deployment config contains a Sepolia deployment. The configured chain ID in `contract.json` must match the selected target.

Other existing frontend scripts are `npm run build`, `npm run lint`, and `npm run preview`, run from `frontend/`.

## Demo Walkthrough

Use a fresh local node and local deployment. In MetaMask, use the local network and the local test accounts:

1. Connect **Account #0** (deployer, admin, and organizer) and open **Organizer**. Create an event with a name and either no deadline or a future deadline. The dashboard lists events owned by the connected organizer.
2. Switch MetaMask to **Account #1** (participant) and open **Register**. Choose the public event, generate or enter a synthetic participant reference, enter the form details, and submit. The page shows the transaction receipt, participant reference, salt, and commitment. Save the reference and salt for the lookup demonstration.
3. Switch back to **Account #0**, open **Organizer**, and look up the registration using the event, saved participant reference, and optional salt. A found registration and commitment match still do not establish the presented person's identity; the organizer must compare the person with the presented identity document in person.
4. Switch to **Account #2** (outsider). It can browse public events and use public registration reads, but it does not have the organizer role and must not be able to create events.

The local Hardhat chain is ephemeral. Restarting it clears its state; deploy the contract again and recreate demo events and registrations.

## Verification Scripts

These are the actual scripts currently in `frontend/scripts/`:

- `validators.test.mjs`: date validator tests; run from `frontend/` with `node --test scripts/validators.test.mjs`. It needs no chain.
- `openEventsRegression.mjs`: open-event visibility checks for deadline zero, future deadline, expired deadline, closed registration, and a non-organizer public reader. On a fresh local node, compile first, start `npm run node`, then from `frontend/` set `LOCAL_ORGANIZER_PRIVATE_KEY` and `LOCAL_PARTICIPANT_PRIVATE_KEY` to the local Hardhat Account #0 and #1 private keys shown in the node output and run `node scripts/openEventsRegression.mjs`. `LOCAL_RPC_URL` is optional and defaults to `http://127.0.0.1:8545`. This script may deploy to the configured address if that address has no code; use a disposable node because it creates events and advances local EVM time.
- `serviceSmokeTest.mjs`: service/contract smoke workflow using unlocked local Hardhat signers. Start the local node and deploy to the address in the current frontend config first, then run `node scripts/serviceSmokeTest.mjs` from `frontend/`. It creates an event and registration.
- `registerFlowCheck.mjs`: service registration-flow check. Start and deploy locally; export `VITE_TARGET_CHAIN=localhost`, `LOCAL_ORGANIZER_PRIVATE_KEY`, and `LOCAL_PARTICIPANT_PRIVATE_KEY` for local accounts #0 and #1, then run `node scripts/registerFlowCheck.mjs` from `frontend/`. `LOCAL_RPC_URL` can select the local RPC endpoint. It creates an event and registration.

The scripts above are not browser/MetaMask tests. The browser checklist in [docs/MANUAL_TEST_CHECKLIST.md](docs/MANUAL_TEST_CHECKLIST.md) is intentionally marked **NOT YET RUN**.

## Troubleshooting

- **Nonce errors after restarting the local node:** in MetaMask, open the account's **Activity** tab and use **Clear activity tab data** for the local network, then reconnect. Restarting the node resets its account nonce state while MetaMask may retain local transaction activity.
- **Stale contract or missing events after a node restart:** the restarted node has a new empty chain. Run `npm run deploy:local` from `contracts/`, then recreate events and registrations.
- **Wrong network:** check the selected MetaMask chain against `VITE_TARGET_CHAIN` and the `chainId` in `frontend/src/config/contract.json`.
- **No event getter in ethers:** the Solidity/ABI single-event getter is `getEventById(eventId)`. The service uses that method for enumeration and lookup; use the actual ABI method name.
- **npm offers to install Hardhat 3:** decline the prompt and run the existing npm scripts from `contracts/`, where the project-local Hardhat 2.x dependency is installed. Do not run `npx hardhat` from the repository root.
- **Sepolia deployment fails:** confirm both root `.env` variables are set, the RPC endpoint is reachable, and the throwaway deployer has Sepolia test ETH. Do not paste a private key or recovery phrase into an issue or chat.

## Known Limitations and Security Notes

- Demo mode only; Phase 1 has no authentication or server-side authorization layer. Organizer writes are role-gated by the contract.
- Participant names, dates of birth, gender, affiliation fields, and images are only held in browser memory. They are not saved to a backend and are lost on refresh. Image files are not uploaded or persisted.
- Event names, participant references, commitments, wallet addresses, transaction metadata, and emitted contract events are public on-chain data. Do not put personal details in event names or references.
- Hashing is not encryption. A commitment does not prove the submitted facts are truthful or identify a real person. Low-entropy inputs may be guessed against public chain data; use random participant references and unpredictable salts.
- Keep the salt and receipt safe. The current prototype has no recovery or private off-chain backup for them.
- Local Hardhat accounts and keys are publicly known and must never be used on a live network.
- The contract and application have not been security-audited. The prototype lacks production key management, privacy controls, access-management UX, and persistent identity verification records.
- Event enumeration scans sequential IDs and may become expensive as event count grows.

## Roadmap

Planned areas are listed in [docs/FUTURE_ROADMAP.md](docs/FUTURE_ROADMAP.md): authentication, an Express API and MongoDB, protected document storage, team rosters, approval/revocation, QR verification, privacy improvements, and audit history.

## Command and Script Map

Every command shown above maps to an installed package script, a script in this repository, or a standard shell/Node/npm CLI:

| Command | Mapping |
| --- | --- |
| `cp .env.example .env` | Standard `cp` shell utility. |
| `cd contracts && npm install` | npm CLI installing `contracts/package.json`. |
| `cd frontend && npm install` | npm CLI installing `frontend/package.json`. |
| `npx hardhat` | Real npx CLI invocation, explicitly not recommended from the repository root because it may prompt to fetch an unpinned Hardhat version; use the `contracts/` package scripts instead. |
| `cd contracts && npm test` | `contracts/package.json` script `test` (`hardhat test`). |
| `cd contracts && npm run compile` | `contracts/package.json` script `compile` (`hardhat compile`). |
| `cd contracts && npm run node` | `contracts/package.json` script `node` (`hardhat node`). |
| `cd contracts && npm run deploy:local` | `contracts/package.json` script `deploy:local`. |
| `cd contracts && npm run deploy:sepolia` | `contracts/package.json` script `deploy:sepolia`. |
| `cd frontend && VITE_TARGET_CHAIN=localhost npm run dev` | `frontend/package.json` script `dev` (`vite`), with a Vite environment variable. |
| `VITE_TARGET_CHAIN=sepolia npm run dev` | `frontend/package.json` script `dev` (`vite`), with a Vite environment variable. |
| `npm run build` | `frontend/package.json` script `build` (`vite build`). |
| `npm run lint` | `frontend/package.json` script `lint` (`eslint .`). |
| `npm run preview` | `frontend/package.json` script `preview` (`vite preview`). |
| `node --test scripts/validators.test.mjs` | Node.js built-in test runner and the checked-in test file. |
| `node scripts/openEventsRegression.mjs` | Node.js CLI and the checked-in regression script. |
| `node scripts/serviceSmokeTest.mjs` | Node.js CLI and the checked-in smoke script. |
| `node scripts/registerFlowCheck.mjs` | Node.js CLI and the checked-in flow-check script. |

No package script or command in this README assumes a root `package.json`.