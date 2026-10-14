import { createContext, useEffect, useState } from "react";
import {
  connectWallet,
  getAccounts,
  getChainId,
  isCorrectNetwork as checkCorrectNetwork,
  isMetaMaskInstalled,
  subscribeToAccountsChanged,
  subscribeToChainChanged,
  switchToTargetNetwork,
} from "../services/blockchain/walletService.js";
import { isOrganizer as checkIsOrganizer } from "../services/blockchain/contractService.js";
import { mapBlockchainError } from "../services/blockchain/errorMapper.js";

export const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [error, setError] = useState("");
  const [metaMaskInstalled] = useState(isMetaMaskInstalled);

  useEffect(() => {
    let active = true;

    async function refreshWallet() {
      if (!isMetaMaskInstalled()) {
        if (active) {
          setAccount(null);
          setChainId(null);
          setIsOrganizer(false);
        }
        return;
      }

      try {
        const [accounts, activeChainId] = await Promise.all([getAccounts(), getChainId()]);
        const nextAccount = accounts[0] || null;
        const correctNetwork = checkCorrectNetwork(activeChainId);
        let organizer = false;
        if (nextAccount && correctNetwork) organizer = await checkIsOrganizer(nextAccount);

        if (active) {
          setAccount(nextAccount);
          setChainId(activeChainId);
          setIsOrganizer(organizer);
          setError("");
        }
      } catch (walletError) {
        if (active) {
          setIsOrganizer(false);
          setError(mapBlockchainError(walletError));
        }
      }
    }

    const unsubscribeAccounts = subscribeToAccountsChanged(() => refreshWallet());
    const unsubscribeChain = subscribeToChainChanged(() => refreshWallet());
    refreshWallet();

    return () => {
      active = false;
      unsubscribeAccounts();
      unsubscribeChain();
    };
  }, []);

  async function connect() {
    setError("");
    try {
      await connectWallet();
      if (isMetaMaskInstalled()) {
        const [accounts, activeChainId] = await Promise.all([getAccounts(), getChainId()]);
        const nextAccount = accounts[0] || null;
        const organizer = nextAccount && checkCorrectNetwork(activeChainId)
          ? await checkIsOrganizer(nextAccount)
          : false;
        setAccount(nextAccount);
        setChainId(activeChainId);
        setIsOrganizer(organizer);
      }
    } catch (walletError) {
      setError(mapBlockchainError(walletError));
    }
  }

  async function switchNetwork() {
    setError("");
    try {
      await switchToTargetNetwork();
      const [accounts, activeChainId] = await Promise.all([getAccounts(), getChainId()]);
      const nextAccount = accounts[0] || null;
      const organizer = nextAccount && checkCorrectNetwork(activeChainId)
        ? await checkIsOrganizer(nextAccount)
        : false;
      setAccount(nextAccount);
      setChainId(activeChainId);
      setIsOrganizer(organizer);
    } catch (walletError) {
      setError(mapBlockchainError(walletError));
    }
  }

  return (
    <WalletContext.Provider value={{
      account,
      chainId,
      isConnected: Boolean(account),
      isCorrectNetwork: checkCorrectNetwork(chainId),
      isOrganizer,
      connect,
      switchNetwork,
      error,
      isMetaMaskInstalled: metaMaskInstalled,
    }}>
      {children}
    </WalletContext.Provider>
  );
}