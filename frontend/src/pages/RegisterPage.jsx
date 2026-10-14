import { useEffect, useState } from "react";
import Banner from "../components/Banner.jsx";
import FormField from "../components/FormField.jsx";
import ImageUpload from "../components/ImageUpload.jsx";
import Spinner from "../components/Spinner.jsx";
import TxStatus from "../components/TxStatus.jsx";
import { useWallet } from "../hooks/useWallet.js";
import { getEvents, registerParticipant } from "../services/blockchain/contractService.js";
import { mapBlockchainError } from "../services/blockchain/errorMapper.js";
import { computeCommitment, generateParticipantId, generateSalt, isValidBytes32 } from "../utils/participant.js";
import { validateDateOfBirth, validateRequired } from "../utils/validators.js";

const initialValues = {
  eventId: "",
  participantId: "",
  fullName: "",
  dateOfBirth: "",
  gender: "",
  affiliationType: "None",
  organizationName: "",
  organizationReference: "",
};

function validateForm(values) {
  const errors = {
    eventId: validateRequired(values.eventId, "Event"),
    participantId: validateRequired(values.participantId, "Participant reference"),
    fullName: validateRequired(values.fullName, "Full name"),
    dateOfBirth: validateDateOfBirth(values.dateOfBirth),
    gender: validateRequired(values.gender, "Gender"),
  };
  if (values.participantId && !isValidBytes32(values.participantId.trim())) {
    errors.participantId = "Enter a 0x-prefixed 32-byte hexadecimal reference.";
  }
  if (values.affiliationType !== "None") {
    errors.organizationName = validateRequired(values.organizationName, "Organization name");
    errors.organizationReference = validateRequired(values.organizationReference, "Organization reference");
  }
  return errors;
}

function isFormValid(errors) {
  return Object.values(errors).every((error) => !error);
}

export default function RegisterPage() {
  const wallet = useWallet();
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [values, setValues] = useState(initialValues);
  const [participantImage, setParticipantImage] = useState(null);
  const [organizationImage, setOrganizationImage] = useState(null);
  const [imageErrors, setImageErrors] = useState({ participant: "", organization: "" });
  const [showErrors, setShowErrors] = useState(false);
  const [txStatus, setTxStatus] = useState({ status: "idle" });
  const [receipt, setReceipt] = useState(null);
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    let active = true;
    getEvents()
      .then((chainEvents) => {
        const openEvents = chainEvents.filter((event) => (
          event.registrationOpen === true
          && Number(event.registrationDeadline) * 1000 > Date.now()
        ));
        if (active) setEvents(openEvents);
      })
      .catch((error) => {
        if (active) setEventsError(mapBlockchainError(error));
      })
      .finally(() => {
        if (active) setEventsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const errors = validateForm(values);
  const canSubmit = isFormValid(errors)
    && !imageErrors.participant
    && !imageErrors.organization
    && Boolean(values.eventId)
    && wallet.isConnected
    && wallet.isCorrectNetwork
    && txStatus.status !== "pending";

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    if (field === "affiliationType" && value === "None") {
      setValues((current) => ({
        ...current,
        affiliationType: value,
        organizationName: "",
        organizationReference: "",
      }));
      setOrganizationImage(null);
      setImageErrors((current) => ({ ...current, organization: "" }));
    }
  }

  function handleParticipantImage(file, error) {
    setParticipantImage(file);
    setImageErrors((current) => ({ ...current, participant: error }));
  }

  function handleOrganizationImage(file, error) {
    setOrganizationImage(file);
    setImageErrors((current) => ({ ...current, organization: error }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setShowErrors(true);
    if (!canSubmit) return;

    setTxStatus({ status: "pending" });
    setReceipt(null);
    try {
      const salt = generateSalt();
      const commitment = computeCommitment(values.eventId, values.participantId.trim(), salt);
      const result = await registerParticipant(
        values.eventId,
        values.participantId.trim(),
        commitment,
      );
      const confirmedReceipt = {
        eventId: values.eventId,
        participantId: values.participantId.trim(),
        salt,
        commitment,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
      };
      setReceipt(confirmedReceipt);
      setTxStatus({ status: "confirmed", ...result });
    } catch (error) {
      setTxStatus({ status: "failed", error: mapBlockchainError(error) });
    }
  }

  async function copyReceiptValue(label, value) {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopyMessage(`${label} copied.`);
    } catch {
      setCopyMessage("Clipboard access is unavailable in this browser.");
    }
  }

  const visibleErrors = showErrors ? errors : {};

  return (
    <div className="register-page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">PARTICIPANT ENTRY</p>
          <h1>Register a player</h1>
          <p>Enter participant details for this session. Personal details and uploaded images are not sent to the contract.</p>
        </div>
        <span className="page-intro__step">PHASE 1 / 03</span>
      </div>

      {!wallet.isMetaMaskInstalled && (
        <Banner type="warning">MetaMask is not available. Install it to submit a registration; browsing events does not require a wallet.</Banner>
      )}
      {wallet.isMetaMaskInstalled && !wallet.isConnected && (
        <Banner type="info" className="wallet-prompt">
          Connect a wallet on the configured network to submit.
          <button className="text-button" type="button" onClick={wallet.connect}>Connect wallet</button>
        </Banner>
      )}
      {wallet.isConnected && !wallet.isCorrectNetwork && (
        <Banner type="warning" className="wallet-prompt">
          Your wallet is connected to the wrong network.
          <button className="text-button" type="button" onClick={wallet.switchNetwork}>Switch network</button>
        </Banner>
      )}

      <div className="register-grid">
        <form className="registration-form" onSubmit={handleSubmit} noValidate>
          <section className="form-section" aria-labelledby="event-section-heading">
            <div className="form-section__heading">
              <span className="form-section__number">01</span>
              <div><h2 id="event-section-heading">Event and reference</h2><p>Choose an open event and create a synthetic reference.</p></div>
            </div>
            {eventsLoading ? <div className="form-state"><Spinner label="Loading open events…" /></div> : null}
            {eventsError && <Banner type="error">{eventsError}</Banner>}
            {!eventsLoading && !eventsError && events.length === 0 && (
              <div className="empty-state">No events are currently open for registration.</div>
            )}
            {!eventsLoading && !eventsError && events.length > 0 && (
              <FormField id="eventId" label="Event" error={visibleErrors.eventId}>
                <select
                  id="eventId"
                  value={values.eventId}
                  onChange={(event) => updateValue("eventId", event.target.value)}
                  aria-invalid={Boolean(visibleErrors.eventId)}
                  aria-describedby={visibleErrors.eventId ? "eventId-error" : undefined}
                  onBlur={() => setShowErrors(true)}
                  required
                >
                  <option value="">Select an open event</option>
                  {events.map((chainEvent) => (
                    <option key={String(chainEvent.id)} value={String(chainEvent.id)}>
                      {chainEvent.name} · Event {chainEvent.id}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            <FormField
              id="participantId"
              label="Participant reference (bytes32)"
              error={visibleErrors.participantId}
              hint="Synthetic reference only. Keep it private and save it with the receipt."
            >
              <div className="input-action-row">
                <input
                  id="participantId"
                  type="text"
                  value={values.participantId}
                  onChange={(event) => updateValue("participantId", event.target.value)}
                  placeholder="0x…"
                  autoComplete="off"
                  spellCheck="false"
                  aria-invalid={Boolean(visibleErrors.participantId)}
                  aria-describedby={visibleErrors.participantId ? "participantId-error" : "participantId-hint"}
                  onBlur={() => setShowErrors(true)}
                  required
                />
                <button className="button button--outline" type="button" onClick={() => updateValue("participantId", generateParticipantId())}>
                  Generate synthetic reference
                </button>
              </div>
            </FormField>
          </section>

          <section className="form-section" aria-labelledby="participant-section-heading">
            <div className="form-section__heading">
              <span className="form-section__number">02</span>
              <div><h2 id="participant-section-heading">Participant details</h2><p>These details stay in this browser session and are not written on-chain.</p></div>
            </div>
            <div className="form-grid">
              <FormField id="fullName" label="Full name" error={visibleErrors.fullName}>
                <input id="fullName" type="text" autoComplete="name" value={values.fullName} onChange={(event) => updateValue("fullName", event.target.value)} aria-invalid={Boolean(visibleErrors.fullName)} aria-describedby={visibleErrors.fullName ? "fullName-error" : undefined} onBlur={() => setShowErrors(true)} required />
              </FormField>
              <FormField id="dateOfBirth" label="Date of birth" error={visibleErrors.dateOfBirth}>
                <input id="dateOfBirth" type="date" value={values.dateOfBirth} onChange={(event) => updateValue("dateOfBirth", event.target.value)} aria-invalid={Boolean(visibleErrors.dateOfBirth)} aria-describedby={visibleErrors.dateOfBirth ? "dateOfBirth-error" : undefined} onBlur={() => setShowErrors(true)} required />
              </FormField>
              <FormField id="gender" label="Gender" error={visibleErrors.gender}>
                <select id="gender" value={values.gender} onChange={(event) => updateValue("gender", event.target.value)} aria-invalid={Boolean(visibleErrors.gender)} aria-describedby={visibleErrors.gender ? "gender-error" : undefined} onBlur={() => setShowErrors(true)} required>
                  <option value="">Select gender</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </FormField>
            </div>
            <ImageUpload id="participantImage" label="Participant ID image" file={participantImage} onChange={handleParticipantImage} error={imageErrors.participant} />
          </section>

          <section className="form-section" aria-labelledby="affiliation-section-heading">
            <div className="form-section__heading">
              <span className="form-section__number">03</span>
              <div><h2 id="affiliation-section-heading">Affiliation</h2><p>Optional organization details for this registration.</p></div>
            </div>
            <FormField id="affiliationType" label="Affiliation type" error={visibleErrors.affiliationType}>
              <select id="affiliationType" value={values.affiliationType} onChange={(event) => updateValue("affiliationType", event.target.value)}>
                <option value="None">None</option>
                <option value="School">School</option>
                <option value="Club">Club</option>
                <option value="Academy">Academy</option>
                <option value="Other">Other</option>
              </select>
            </FormField>
            {values.affiliationType !== "None" && (
              <>
                <div className="form-grid">
                  <FormField id="organizationName" label="Organization name" error={visibleErrors.organizationName}>
                    <input id="organizationName" type="text" value={values.organizationName} onChange={(event) => updateValue("organizationName", event.target.value)} aria-invalid={Boolean(visibleErrors.organizationName)} aria-describedby={visibleErrors.organizationName ? "organizationName-error" : undefined} onBlur={() => setShowErrors(true)} required />
                  </FormField>
                  <FormField id="organizationReference" label="Organization reference" error={visibleErrors.organizationReference}>
                    <input id="organizationReference" type="text" value={values.organizationReference} onChange={(event) => updateValue("organizationReference", event.target.value)} aria-invalid={Boolean(visibleErrors.organizationReference)} aria-describedby={visibleErrors.organizationReference ? "organizationReference-error" : undefined} onBlur={() => setShowErrors(true)} required />
                  </FormField>
                </div>
                <ImageUpload id="organizationImage" label="Organization ID image" file={organizationImage} onChange={handleOrganizationImage} error={imageErrors.organization} />
              </>
            )}
          </section>

          {showErrors && !isFormValid(errors) && <Banner type="error">Review the highlighted fields before continuing.</Banner>}
          <div className="form-submit">
            <p>Only the event, participant reference, and cryptographic commitment are submitted to the contract.</p>
            <button className="button button--primary button--submit" type="submit" disabled={!canSubmit}>
              {txStatus.status === "pending" ? "Submitting…" : "Submit registration"}
            </button>
            {!wallet.isConnected && <small>Connect a wallet before submitting.</small>}
            {wallet.isConnected && !wallet.isCorrectNetwork && <small>Switch to the configured network before submitting.</small>}
          </div>
          <TxStatus {...txStatus} />
        </form>

        <aside className="privacy-aside">
          <span className="privacy-aside__mark" aria-hidden="true">01</span>
          <h2>Private by design</h2>
          <p>The contract receives an event ID, synthetic participant reference, and a one-way commitment. Names, date of birth, gender, affiliation details, and image files stay out of the transaction.</p>
          <div className="privacy-aside__line" />
          <p className="privacy-aside__small">Registration exists ≠ real-world identity verified</p>
        </aside>
      </div>

      {receipt && (
        <section className="receipt" aria-labelledby="receipt-heading">
          <div className="receipt__heading">
            <div><p className="eyebrow">TRANSACTION CONFIRMED</p><h2 id="receipt-heading">Registration receipt</h2></div>
            <span className="receipt__check" aria-hidden="true">✓</span>
          </div>
          <TxStatus status="confirmed" txHash={receipt.txHash} blockNumber={receipt.blockNumber} />
          <div className="receipt-fields">
            {[
              ["Event ID", receipt.eventId],
              ["Participant reference", receipt.participantId],
              ["Salt", receipt.salt],
              ["Commitment", receipt.commitment],
              ["Transaction hash", receipt.txHash],
            ].map(([label, value]) => (
              <div className="receipt-field" key={label}>
                <span>{label}</span>
                <code>{value}</code>
                <button className="button button--small button--outline" type="button" onClick={() => copyReceiptValue(label, value)}>Copy</button>
              </div>
            ))}
          </div>
          {copyMessage && <p className="copy-feedback" role="status">{copyMessage}</p>}
          <Banner type="warning" className="receipt__warning">
            Save the participant reference and salt now. Name, date of birth, and images were NOT stored anywhere and are lost on refresh. Phase 1 has no off-chain storage. Uploaded images are not verified or stored.
          </Banner>
        </section>
      )}
    </div>
  );
}