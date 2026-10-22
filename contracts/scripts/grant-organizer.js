const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const targetAddress = process.env.TARGET_ADDRESS
    || process.argv.slice(2).find((arg) => !arg.startsWith("-") && hre.ethers.isAddress(arg));

  if (!targetAddress || !hre.ethers.isAddress(targetAddress)) {
    throw new Error("Target address is required and must be a valid Ethereum address.");
  }

  const configPath = path.resolve(__dirname, "../../frontend/src/config/contract.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Deployment config not found at: ${configPath}`);
  }

  const deployment = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!deployment.address || !hre.ethers.isAddress(deployment.address)) {
    throw new Error("Invalid or missing contract address in deployment config.");
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer configured for this network.");
  }

  const Registry = await hre.ethers.getContractFactory("SportsPlayerRegistry", deployer);
  const registry = Registry.attach(deployment.address);

  const adminRole = await registry.DEFAULT_ADMIN_ROLE();
  const isAdmin = await registry.hasRole(adminRole, deployer.address);
  if (!isAdmin) {
    throw new Error(`Caller ${deployer.address} does not hold DEFAULT_ADMIN_ROLE on contract ${deployment.address}.`);
  }

  const organizerRole = await registry.ORGANIZER_ROLE();
  const tx = await registry.grantRole(organizerRole, targetAddress);
  const receipt = await tx.wait(1);

  console.log(`Granted ORGANIZER_ROLE to: ${targetAddress}`);
  console.log(`Transaction hash: ${receipt.hash}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

