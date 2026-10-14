import { blockExplorerUrl } from "../config/network.js";
import Spinner from "./Spinner.jsx";

export default function TxStatus({ status = "idle", txHash, blockNumber, error }) {
  if (status === "idle") return null;
  if (status === "pending") {
    return <div className="tx-status tx-status--pending"><Spinner label="Submitting registration…" /></div>;
  }
  if (status === "failed") {
    return <div className="tx-status tx-status--failed" role="alert">{error || "Registration failed."}</div>;
  }

  const transactionUrl = blockExplorerUrl && txHash
    ? `${blockExplorerUrl.replace(/\/$/, "")}/tx/${txHash}`
    : null;

  return (
    <div className="tx-status tx-status--confirmed" role="status">
      <strong>Transaction confirmed</strong>
      <span>Block {blockNumber}</span>
      {transactionUrl
        ? <a href={transactionUrl} target="_blank" rel="noreferrer">View transaction</a>
        : <code>{txHash}</code>}
    </div>
  );
}