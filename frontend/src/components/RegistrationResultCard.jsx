import { blockExplorerUrl } from "../config/network.js";

const zeroBytes32 = `0x${"0".repeat(64)}`;

function readableDate(timestamp) {
  const date = new Date(Number(timestamp) * 1000);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString();
}

function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function RegistrationResultCard({ result }) {
  const found = result?.registration?.status > 0
    && result.registration.participantId?.toLowerCase() !== zeroBytes32;
  const transactionUrl = found && blockExplorerUrl && result.transaction?.txHash
    ? `${blockExplorerUrl.replace(/\/$/, "")}/tx/${result.transaction.txHash}`
    : null;

  return (
    <article className="lookup-result" aria-live="polite">
      <section className="lookup-result__section">
        <div className="lookup-result__section-heading">
          <h2>On-chain registration</h2>
          <span className={`status-badge ${found ? "status-badge--found" : "status-badge--not-found"}`}>
            {found ? "FOUND" : "NOT FOUND"}
          </span>
        </div>
        {found ? (
          <dl className="result-details">
            <div><dt>Event</dt><dd>{result.event.name} <span>(ID {result.event.id})</span></dd></div>
            <div><dt>Participant reference</dt><dd><code>{result.registration.participantId}</code></dd></div>
            <div><dt>Registration status</dt><dd>{result.registration.statusLabel}</dd></div>
            <div><dt>Commitment</dt><dd><code>{result.registration.commitment}</code></dd></div>
            <div><dt>Registrant</dt><dd title={result.registration.registrant}>{shortAddress(result.registration.registrant)}</dd></div>
            <div><dt>Block number</dt><dd>{result.transaction?.blockNumber ?? "Unavailable"}</dd></div>
            <div><dt>Block timestamp</dt><dd>{result.transaction ? readableDate(result.transaction.blockTimestamp) : "Unavailable"}</dd></div>
            <div>
              <dt>Transaction</dt>
              <dd>
                {transactionUrl
                  ? <a href={transactionUrl} target="_blank" rel="noreferrer">View transaction</a>
                  : <code>{result.transaction?.txHash || "Unavailable"}</code>}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="lookup-not-found">
            <strong>No registration exists for this reference in this event.</strong>
            <p>This result does not by itself prove anything about the person.</p>
          </div>
        )}
      </section>

      <section className="lookup-result__section">
        <div className="lookup-result__section-heading">
          <h2>Commitment check</h2>
          <span className={`status-badge ${result.commitmentMatch === null
            ? "status-badge--pending"
            : result.commitmentMatch ? "status-badge--match" : "status-badge--no-match"}`}>
            {result.commitmentMatch === null ? "NOT CHECKED" : result.commitmentMatch ? "MATCH" : "NO MATCH"}
          </span>
        </div>
        {result.commitmentMatch === null
          ? <p>Commitment verification was not checked. Enter the saved salt when available.</p>
          : <p>A match shows the stored commitment equals the hash of this event id, reference, and salt. It does not prove the submitted details were truthful.</p>}
      </section>

      <section className="lookup-result__section lookup-result__identity">
        <div className="lookup-result__section-heading">
          <h2>In-person identity verification</h2>
          <span className="status-badge status-badge--pending">PENDING</span>
        </div>
        <p>PENDING — Organizer must compare the participant with the presented identity document.</p>
      </section>
      <p className="lookup-result__disclaimer">Registration on-chain is not identity verification.</p>
    </article>
  );
}