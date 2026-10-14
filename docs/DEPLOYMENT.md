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

The deploy script refuses mainnet and any chain ID other than Sepolia `11155111` or local `31337`. It prints the deployer and balance, requires a nonzero balance, waits for one deployment confirmation, and writes the deployed address, chain ID, network name, timestamp, transaction hash, and ABI under `frontend/src/config/`.

## Generated frontend files

Every deployment overwrites `frontend/src/config/contract.json` and `frontend/src/config/SportsPlayerRegistry.abi.json`. `contract.json` always describes the most recent deployment, including a local deployment; it is not a per-network registry. Save any address you need before deploying to another network.

Set `VITE_TARGET_CHAIN=localhost` for the local frontend network configuration. If unset, the frontend targets Sepolia. The frontend network constants are in `frontend/src/config/network.js`.