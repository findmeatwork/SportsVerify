import { Link } from "react-router-dom";
import { chainName } from "../config/network.js";
import { useWallet } from "../hooks/useWallet.js";

const steps = [
  { number: "01", title: "Choose an event", description: "Select a tournament with registration open." },
  { number: "02", title: "Create a private record", description: "A participant reference and salt create a commitment; personal details stay in this session." },
  { number: "03", title: "Confirm on-chain", description: "Submit the commitment and keep the receipt details for later verification." },
];

export default function LandingPage() {
  const wallet = useWallet();
  const networkLabel = wallet.chainId === null
    ? "Waiting for wallet network"
    : wallet.isCorrectNetwork ? chainName : `Switch from chain ${wallet.chainId}`;

  return (
    <div className="landing-page">
      <section className="landing-hero">
        <div className="landing-hero__copy">
          <p className="eyebrow">SPORTS REGISTRATION · PHASE 1</p>
          <h1>SportsVerify — Blockchain-Based Player Verification</h1>
          <p className="landing-hero__lead">
            Youth tournaments need a reliable way to check returning players. Identity fraud can undermine fair competition, but a blockchain registration record is not proof of a person’s real-world identity.
          </p>
          <div className="landing-hero__actions">
            <Link className="button button--primary" to="/register">Start registration <span aria-hidden="true">→</span></Link>
            <Link className="button button--quiet" to="/organizer">Organizer view</Link>
          </div>
        </div>
        <aside className="landing-status" aria-label="Current wallet and network status">
          <span className="landing-status__index">CONNECTION</span>
          <strong>{wallet.isConnected ? "Wallet connected" : "No wallet connected"}</strong>
          <span>{wallet.isConnected ? `${wallet.account.slice(0, 6)}…${wallet.account.slice(-4)}` : "Browsing is available without a wallet."}</span>
          <div className="landing-status__rule" />
          <span className="landing-status__index">TARGET NETWORK</span>
          <strong>{networkLabel}</strong>
        </aside>
      </section>

      <section className="problem-strip">
        <span className="problem-strip__tag">THE CHALLENGE</span>
        <p>Organizers need a repeatable registration reference without putting a young athlete’s personal documents on a public ledger.</p>
      </section>

      <section className="steps-section" aria-labelledby="steps-heading">
        <div className="section-heading">
          <p className="eyebrow">A SIMPLE FLOW</p>
          <h2 id="steps-heading">How it works</h2>
        </div>
        <div className="steps-grid">
          {steps.map((step) => (
            <article className="step-item" key={step.number}>
              <span className="step-item__number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-note">
        <span className="landing-note__mark" aria-hidden="true">!</span>
        <p><strong>Prototype limitation</strong> Registration existence is not identity verification. Names, birth dates, and uploaded images are not stored by this prototype.</p>
        <Link to="/register">Continue to registration <span aria-hidden="true">→</span></Link>
      </section>
    </div>
  );
}