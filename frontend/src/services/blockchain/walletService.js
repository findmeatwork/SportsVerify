import { chainId, chainIdHex, chainName, rpcUrl, targetNetwork } from "../../config/network.js";

function getEthereum() {
  return typeof window !== "undefined" ? window.ethereum : undefined;
}

function parseChainId(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.startsWith("0x")) return Number.parseInt(value, 16);
  return Number(value);
}

function requireEthereum() {
  const ethereum = getEthereum();
  if (!ethereum) {
    const error = new Error("MetaMask is not installed or available in this browser.");
    error.code = "METAMASK_MISSING";
    throw error;
  }
  return ethereum;
}

export function isMetaMaskInstalled() {
  return Boolean(getEthereum()?.isMetaMask);
}

export async function connectWallet() {
  return requireEthereum().request({ method: "eth_requestAccounts" });
}

export async function getAccounts() {
  return requireEthereum().request({ method: "eth_accounts" });
}

export async function getChainId() {
  return parseChainId(await requireEthereum().request({ method: "eth_chainId" }));
}

export function subscribeToAccountsChanged(listener) {
  const ethereum = getEthereum();
  if (!ethereum?.on) return () => {};

  const handler = (accounts) => listener(accounts);
  ethereum.on("accountsChanged", handler);
  return () => ethereum.removeListener?.("accountsChanged", handler);
}

export function subscribeToChainChanged(listener) {
  const ethereum = getEthereum();
  if (!ethereum?.on) return () => {};

  const handler = (nextChainId) => listener(parseChainId(nextChainId));
  ethereum.on("chainChanged", handler);
  return () => ethereum.removeListener?.("chainChanged", handler);
}

export function isCorrectNetwork(activeChainId) {
  return parseChainId(activeChainId) === chainId;
}

export async function switchToTargetNetwork() {
  const ethereum = requireEthereum();
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (error) {
    if (error.code !== 4902 || targetNetwork !== "localhost") throw error;

    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: chainIdHex,
        chainName,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: [rpcUrl],
      }],
    });
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  }
}