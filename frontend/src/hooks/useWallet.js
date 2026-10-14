import { useContext } from "react";
import { WalletContext } from "./WalletProvider.jsx";

export function useWallet() {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error("useWallet must be used inside WalletProvider.");
  return wallet;
}