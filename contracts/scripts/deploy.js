const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const networkName = hre.network.name;
  if (networkName === "sepolia" && !process.env.SEPOLIA_RPC_URL) {
    throw new Error("SEPOLIA_RPC_URL is required for Sepolia deployment.");
  }
  if (networkName === "sepolia" && !process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required for Sepolia deployment.");
  }

  const { chainId } = await hre.ethers.provider.getNetwork();
  if (chainId === 1n || networkName === "mainnet") {
    throw new Error("Refusing to deploy SportsPlayerRegistry to Ethereum mainnet (chainId 1).");
  }
  if (chainId !== 11155111n && chainId !== 31337n) {
    throw new Error(`Unsupported chainId ${chainId}; deployments are allowed only on Sepolia or local chain 31337.`);
  }
  if (networkName === "sepolia" && chainId !== 11155111n) {
    throw new Error(`The configured Sepolia RPC returned chainId ${chainId}, expected 11155111.`);
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account is configured for this network.");
  }

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Network: ${networkName} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} ETH`);
  if (balance === 0n) {
    throw new Error("Deployer balance is zero; fund the account before deployment.");
  }

  const Registry = await hre.ethers.getContractFactory("SportsPlayerRegistry", deployer);
  const registry = await Registry.deploy();
  const deploymentTransaction = registry.deploymentTransaction();
  if (!deploymentTransaction) {
    throw new Error("Deployment transaction was not created.");
  }

  const receipt = await deploymentTransaction.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw new Error("Contract deployment was not confirmed successfully.");
  }
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  const artifact = await hre.artifacts.readArtifact("SportsPlayerRegistry");
  const configDirectory = path.resolve(__dirname, "../../frontend/src/config");
  const deploymentConfig = {
    address,
    chainId: Number(chainId),
    networkName,
    deployedAt: new Date().toISOString(),
    txHash: receipt.hash,
  };

  fs.mkdirSync(configDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(configDirectory, "contract.json"),
    `${JSON.stringify(deploymentConfig, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(configDirectory, "SportsPlayerRegistry.abi.json"),
    `${JSON.stringify(artifact.abi, null, 2)}\n`
  );

  console.log(`SportsPlayerRegistry address: ${address}`);
  console.log(`Deployment transaction: ${receipt.hash}`);
  console.log(`Frontend config written to: ${configDirectory}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});