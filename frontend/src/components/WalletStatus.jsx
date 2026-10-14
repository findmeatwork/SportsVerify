import { chainName } from "../config/network.js";
import { useWallet } from "../hooks/useWallet.js";

function shortenAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function WalletStatus() {
  const wallet = useWallet();
  const currentNetwork = wallet.chainId === null
    ? "Network unavailable"
    : wallet.isCorrectNetwork ? chainName : `Chain ${wallet.chainId}`;

  return (
    <div className="wallet-status" aria-label="Wallet status">
      <span className={`wallet-status__dot ${wallet.isConnected ? "is-connected" : ""}`} aria-hidden="true" />
      <div className="wallet-status__details">
        <span className="wallet-status__account">
          {wallet.isConnected ? shortenAddress(wallet.account) : "Wallet not connected"}
          {wallet.isOrganizer && <span className="organizer-badge">Organizer</span>}
        </span>
        <span className="wallet-status__network">{currentNetwork}</span>
      </div>
      {!wallet.isConnected && (
        <button className="button button--small button--outline" type="button" onClick={wallet.connect}>
          {wallet.isMetaMaskInstalled ? "Connect wallet" : "MetaMask unavailable"}
        </button>
      )}
      {wallet.isConnected && !wallet.isCorrectNetwork && (
        <button className="button button--small button--outline" type="button" onClick={wallet.switchNetwork}>
          Switch network
        </button>
      )}
      {!wallet.isMetaMaskInstalled && (
        <span className="wallet-status__message">Install MetaMask to connect.</span>
      )}
      {wallet.error && <span className="wallet-status__message" role="status">{wallet.error}</span>}
    </div>
  );
}