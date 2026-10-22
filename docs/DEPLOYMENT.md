# Deployment

## Environment

Copy the root `.env.example` to `.env` and set `SEPOLIA_RPC_URL` and `PRIVATE_KEY` only in the local `.env` file. `.env` is ignored by Git. Never commit a wallet key or use a wallet that holds valuable assets for this prototype.

The Hardhat config remains loadable when either variable is absent, so local compilation and tests do not require secrets. The Sepolia deploy script requires both values. The config only adds the Sepolia `accounts` entry when `PRIVATE_KEY` is nonempty.

## Local deployment

Start a local node in one terminal:

```sh
cd contracts
npm run node
```

Deploy from another terminal:

```sh
cd contracts
npm run deploy:local
```

## Sepolia deployment

After setting both root `.env` values, run:

```sh
cd contracts
npm run deploy:sepolia
```

The deploy script refuses mainnet and any chain ID other than Sepolia `11155111` or local `31337`. It prints the deployer and balance, requires a nonzero balance, waits for one deployment confirmation, and writes the deployed address, chain ID, network name, timestamp, transaction hash, block number, and ABI under both `frontend/src/config/` and `backend/src/config/`.

## Generated config files

Every deployment overwrites `contract.json` and `SportsPlayerRegistry.abi.json` in both `frontend/src/config/` and `backend/src/config/`. `contract.json` always describes the most recent deployment, including deployment block number and deployer address; it is not a per-network registry. Save any address you need before deploying to another network.

Set `VITE_TARGET_CHAIN=localhost` for the local frontend network configuration. If unset, the frontend targets Sepolia. The frontend network constants are in `frontend/src/config/network.js`.

## Granting the Organizer Role

To authorize another wallet as an organizer, run `grant-organizer` from `contracts/` with the target wallet address:

```sh
cd contracts
npm run grant-organizer -- --network localhost <WALLET_ADDRESS>
```

Or via environment variable:

```sh
TARGET_ADDRESS=<WALLET_ADDRESS> npm run grant-organizer -- --network localhost
```

The script connects with the deployer account (admin), verifies `DEFAULT_ADMIN_ROLE`, grants `ORGANIZER_ROLE` to the target address, and prints the transaction hash.