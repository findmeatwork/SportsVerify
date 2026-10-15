import { useEffect, useState } from "react";
import Banner from "../components/Banner.jsx";
import FormField from "../components/FormField.jsx";
import RegistrationResultCard from "../components/RegistrationResultCard.jsx";
import Spinner from "../components/Spinner.jsx";
import TxStatus from "../components/TxStatus.jsx";
import { useWallet } from "../hooks/useWallet.js";
import {
  createEvent,
  findRegistrationTx,
  getEvents,
  getEventRegistrationCount,
  getParticipant,
  verifyCommitment,
} from "../services/blockchain/contractService.js";
import { computeCommitment, isValidBytes32 } from "../utils/participant.js";

const zeroBytes32 = `0x${"0".repeat(64)}`;
const registrationStatusLabels = ["None", "Registered", "Withdrawn", "Suspended"];

function getRegistrationState(event) {
  const deadline = Number(event.registrationDeadline);
  if (event.registrationOpen !== true) return "Closed";
  if (deadline > 0 && deadline <= Math.floor(Date.now() / 1000)) return "Deadline passed";
  return "Open";
}

function formatDeadline(value) {
  const timestamp = Number(value);
  if (!timestamp) return "No deadline";
  if (!Number.isFinite(timestamp)) return "Unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp * 1000));
}

export default function OrganizerDashboard() {
  const wallet = useWallet();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadedAccount, setLoadedAccount] = useState(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookupValues, setLookupValues] = useState({ eventId: "", participantId: "", salt: "" });
  const [lookupErrors, setLookupErrors] = useState({});
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lookupResult, setLookupResult] = useState(null);
  const [eventName, setEventName] = useState("");
  const [registrationDeadline, setRegistrationDeadline] = useState("");
  const [createEventStatus, setCreateEventStatus] = useState({ status: "idle" });
  const [eventNameError, setEventNameError] = useState("");
  const [deadlineError, setDeadlineError] = useState("");

  useEffect(() => {
    let active = true;

    if (!wallet.account || !wallet.isCorrectNetwork || !wallet.isOrganizer) {
      return () => { active = false; };
    }

    getEvents(wallet.account)
      .then(async (chainEvents) => Promise.all(chainEvents.map(async (event) => ({
        ...event,
        registrationCount: await getEventRegistrationCount(event.id),
      }))))
      .then((organizerEvents) => {
        if (active) {
          setEvents(organizerEvents);
          setError("");
          setLoadedAccount(wallet.account);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError.message || "Unable to load events from the blockchain.");
          setLoadedAccount(wallet.account);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [wallet.account, wallet.isCorrectNetwork, wallet.isOrganizer, refreshKey]);

  const canViewEvents = wallet.isConnected && wallet.isCorrectNetwork && wallet.isOrganizer;
  const canCreateEvent = canViewEvents;
  const isLoadingEvents = canViewEvents && (loading || loadedAccount !== wallet.account);

  async function handleCreateEvent(event) {
    event.preventDefault();
    const trimmedName = eventName.trim();
    const parsedDeadline = registrationDeadline
      ? Date.parse(registrationDeadline)
      : 0;
    const nextNameError = trimmedName ? "" : "Event name is required.";
    const nextDeadlineError = registrationDeadline && !Number.isFinite(parsedDeadline)
      ? "Enter a valid registration deadline."
      : registrationDeadline && parsedDeadline <= Date.now()
        ? "Registration deadline must be in the future."
        : "";

    setEventNameError(nextNameError);
    setDeadlineError(nextDeadlineError);
    if (nextNameError || nextDeadlineError || !canCreateEvent) return;

    const deadlineInSeconds = registrationDeadline
      ? Math.floor(parsedDeadline / 1000)
      : 0;
    setCreateEventStatus({ status: "pending" });
    try {
      const result = await createEvent(trimmedName, deadlineInSeconds);
      setCreateEventStatus({ status: "confirmed", ...result });
      setEventName("");
      setRegistrationDeadline("");
      setLoading(true);
      setError("");
      setRefreshKey((current) => current + 1);
    } catch (createError) {
      const message = createError.message || "Event creation failed.";
      setCreateEventStatus({ status: "failed", error: message });
    }
  }

  function updateLookupValue(field, value) {
    setLookupValues((current) => ({ ...current, [field]: value }));
    setLookupErrors((current) => ({ ...current, [field]: "" }));
    setLookupResult(null);
    setLookupError("");
  }

  async function handleLookup(event) {
    event.preventDefault();
    const participantId = lookupValues.participantId.trim();
    const salt = lookupValues.salt.trim();
    const nextErrors = {};

    if (!events.some((chainEvent) => String(chainEvent.id) === lookupValues.eventId)) {
      nextErrors.eventId = "Select an event.";
    }
    if (!participantId) nextErrors.participantId = "Participant reference is required.";
    else if (!isValidBytes32(participantId)) {
      nextErrors.participantId = "Enter a 0x-prefixed 32-byte hexadecimal reference.";
    }
    if (salt && !isValidBytes32(salt)) {
      nextErrors.salt = "Enter a 0x-prefixed 32-byte hexadecimal salt, or leave it blank.";
    }

    setLookupErrors(nextErrors);
    setLookupResult(null);
    setLookupError("");
    if (Object.keys(nextErrors).length > 0) return;

    const selectedEvent = events.find((chainEvent) => String(chainEvent.id) === lookupValues.eventId);
    setLookupLoading(true);
    try {
      const registration = await getParticipant(lookupValues.eventId, participantId);
      const status = Number(registration.status);
      const found = status > 0 && registration.participantId?.toLowerCase() !== zeroBytes32;
      let transaction = null;
      let commitmentMatch = null;

      if (found) {
        transaction = await findRegistrationTx(lookupValues.eventId, participantId).catch(() => null);
        if (salt) {
          const commitment = computeCommitment(lookupValues.eventId, participantId, salt);
          commitmentMatch = await verifyCommitment(lookupValues.eventId, participantId, commitment);
        }
      }

      setLookupResult({
        event: selectedEvent,
        registration: {
          ...registration,
          statusLabel: registrationStatusLabels[status] || "Unknown",
        },
        transaction,
        commitmentMatch,
      });
    } catch (readError) {
      setLookupError(readError.message || "Unable to read this registration from the blockchain.");
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <div className="organizer-dashboard">
      <div className="page-intro">
        <div>
          <p className="eyebrow">ORGANIZER WORKSPACE</p>
          <h1>Events</h1>
          <p>Review your events and current registration activity.</p>
        </div>
      </div>

      {!wallet.isConnected && (
        <Banner type="info" className="organizer-dashboard__notice">
          Connect the organizer wallet to view its events.
          <button className="text-button" type="button" onClick={wallet.connect}>Connect wallet</button>
        </Banner>
      )}
      {wallet.isConnected && !wallet.isCorrectNetwork && (
        <Banner type="warning" className="organizer-dashboard__notice">
          Switch to the configured network to view organizer events.
          <button className="text-button" type="button" onClick={wallet.switchNetwork}>Switch network</button>
        </Banner>
      )}
      {wallet.isConnected && wallet.isCorrectNetwork && !wallet.isOrganizer && (
        <Banner type="warning" className="organizer-dashboard__notice">
          This wallet does not have organizer access.
        </Banner>
      )}

      <section className="create-event" aria-labelledby="create-event-heading">
        <div className="create-event__heading">
          <p className="eyebrow">ORGANIZER ACTION</p>
          <h2 id="create-event-heading">Create an event</h2>
        </div>
        {!canCreateEvent && (
          <Banner type={!wallet.isConnected ? "info" : "warning"} className="create-event__notice">
            {!wallet.isConnected && "Connect MetaMask to create an event. "}
            {wallet.isConnected && !wallet.isCorrectNetwork && "Switch MetaMask to the configured network to create an event. "}
            {wallet.isConnected && wallet.isCorrectNetwork && !wallet.isOrganizer && "The connected wallet does not have organizer permission. "}
            {!wallet.isConnected && <button className="text-button" type="button" onClick={wallet.connect}>Connect wallet</button>}
            {wallet.isConnected && !wallet.isCorrectNetwork && <button className="text-button" type="button" onClick={wallet.switchNetwork}>Switch network</button>}
          </Banner>
        )}
        <form className="create-event__form" onSubmit={handleCreateEvent} noValidate>
          <FormField id="new-event-name" label="Event name" error={eventNameError}>
            <input
              id="new-event-name"
              type="text"
              value={eventName}
              onChange={(change) => {
                setEventName(change.target.value);
                setEventNameError("");
              }}
              aria-invalid={Boolean(eventNameError)}
              aria-describedby={eventNameError ? "new-event-name-error" : undefined}
              maxLength={120}
              autoComplete="off"
              required
            />
          </FormField>
          <FormField
            id="new-event-deadline"
            label="Registration deadline (optional)"
            error={deadlineError}
            hint="Leave blank to create an event with no deadline."
          >
            <input
              id="new-event-deadline"
              type="datetime-local"
              value={registrationDeadline}
              onChange={(change) => {
                setRegistrationDeadline(change.target.value);
                setDeadlineError("");
              }}
              aria-invalid={Boolean(deadlineError)}
              aria-describedby={deadlineError ? "new-event-deadline-error" : undefined}
            />
          </FormField>
          <button
            className="button button--primary"
            type="submit"
            disabled={!canCreateEvent || createEventStatus.status === "pending"}
          >
            {createEventStatus.status === "pending" ? "Creating event…" : "Create event"}
          </button>
        </form>
        {!canCreateEvent && <p className="create-event__disabled-note">Event creation is unavailable until the wallet is connected, on the configured network, and authorized as an organizer.</p>}
        {createEventStatus.status !== "idle" && (
          <TxStatus
            status={createEventStatus.status}
            txHash={createEventStatus.txHash}
            blockNumber={createEventStatus.blockNumber}
            error={createEventStatus.error}
            pendingLabel="Submitting event creation…"
            failedLabel="Event creation failed."
            confirmedLabel="Event created"
          />
        )}
      </section>

      <section className="event-list" aria-labelledby="event-list-heading">
        <div className="event-list__heading">
          <div>
            <h2 id="event-list-heading">Your events</h2>
            <p>On-chain event records for the connected organizer.</p>
          </div>
          <button
            className="button button--quiet button--small"
            type="button"
            onClick={() => {
              setError("");
              setLoading(true);
              setRefreshKey((current) => current + 1);
            }}
            disabled={isLoadingEvents || !canViewEvents}
            aria-label="Refresh events"
          >
            Refresh
          </button>
        </div>

        {isLoadingEvents && <div className="form-state"><Spinner label="Loading events…" /></div>}
        {!isLoadingEvents && error && canViewEvents && <Banner type="error">{error}</Banner>}
        {!isLoadingEvents && !error && canViewEvents && events.length === 0 && (
          <div className="empty-state">No events have been created by this organizer yet.</div>
        )}
        {!isLoadingEvents && !error && canViewEvents && events.length > 0 && (
          <div className="event-list__table-wrap">
            <table className="event-list__table">
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Registrations</th>
                  <th scope="col">Registration status</th>
                  <th scope="col">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const registrationState = getRegistrationState(event);
                  return (
                    <tr key={String(event.id)}>
                      <td>
                        <strong>{event.name}</strong>
                        <span className="event-list__id">Event {String(event.id)}</span>
                      </td>
                      <td>{String(event.registrationCount)}</td>
                      <td>
                        <span className={`event-list__status event-list__status--${registrationState === "Open" ? "open" : "closed"}`}>
                          {registrationState}
                        </span>
                      </td>
                      <td>{formatDeadline(event.registrationDeadline)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="participant-lookup" aria-labelledby="participant-lookup-heading">
        <div className="participant-lookup__heading">
          <p className="eyebrow">ON-CHAIN RECORD</p>
          <h2 id="participant-lookup-heading">Look up a participant</h2>
          <p>Search with the synthetic reference supplied for registration. Personal identity details are not stored here.</p>
        </div>
        <form className="participant-lookup__form" onSubmit={handleLookup} noValidate>
          <FormField id="lookup-event" label="Event" error={lookupErrors.eventId}>
            <select
              id="lookup-event"
              value={lookupValues.eventId}
              onChange={(changeEvent) => updateLookupValue("eventId", changeEvent.target.value)}
              aria-invalid={Boolean(lookupErrors.eventId)}
              aria-describedby={lookupErrors.eventId ? "lookup-event-error" : undefined}
              disabled={!canViewEvents || isLoadingEvents || events.length === 0}
              required
            >
              <option value="">Select an event</option>
              {events.map((chainEvent) => (
                <option key={String(chainEvent.id)} value={String(chainEvent.id)}>
                  {chainEvent.name} · Event {String(chainEvent.id)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            id="lookup-participant-id"
            label="Synthetic participant reference (bytes32)"
            error={lookupErrors.participantId}
            hint="Use the reference from the participant’s registration receipt."
          >
            <input
              id="lookup-participant-id"
              type="text"
              value={lookupValues.participantId}
              onChange={(changeEvent) => updateLookupValue("participantId", changeEvent.target.value)}
              aria-invalid={Boolean(lookupErrors.participantId)}
              aria-describedby={lookupErrors.participantId ? "lookup-participant-id-error" : undefined}
              autoComplete="off"
              spellCheck="false"
              required
            />
          </FormField>
          <FormField
            id="lookup-salt"
            label="Salt (optional)"
            error={lookupErrors.salt}
            hint="A valid salt lets the contract check whether it matches the stored commitment. It is only used in this browser."
          >
            <input
              id="lookup-salt"
              type="password"
              value={lookupValues.salt}
              onChange={(changeEvent) => updateLookupValue("salt", changeEvent.target.value)}
              aria-invalid={Boolean(lookupErrors.salt)}
              aria-describedby={lookupErrors.salt ? "lookup-salt-error" : undefined}
              autoComplete="off"
              spellCheck="false"
            />
          </FormField>
          <button
            className="button button--primary"
            type="submit"
            disabled={!canViewEvents || isLoadingEvents || events.length === 0 || lookupLoading}
          >
            {lookupLoading ? "Checking…" : "Check registration"}
          </button>
        </form>
        {lookupLoading && <div className="form-state"><Spinner label="Reading registration…" /></div>}
        {!lookupLoading && lookupError && <Banner type="error">{lookupError}</Banner>}
        {lookupResult && <RegistrationResultCard result={lookupResult} />}
      </section>
    </div>
  );
}