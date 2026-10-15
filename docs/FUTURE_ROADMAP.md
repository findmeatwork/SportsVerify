# Future Roadmap

1. **Authentication and authorization:** add real user identity and role-management flows; preserve contract-enforced organizer permissions.
2. **Backend API:** introduce an Express service with server-side validation, authorization, and controlled access to off-chain records.
3. **MongoDB records:** persist participant and team metadata off-chain, with a deliberate retention and access policy.
4. **Protected document storage:** store identity images outside the public chain with authenticated, time-limited access; define consent and deletion rules.
5. **Team rosters:** support organizer-managed teams and event roster assignments.
6. **Approval and revocation:** design explicit review, approval, withdrawal, suspension, and audit behavior before exposing transitions in the UI or contract.
7. **QR verification:** provide a secure event-side lookup mechanism without embedding personal information in a public QR code.
8. **Privacy improvements:** review identifier linkability, commitment guessing risk, data minimization, key handling, and retention.
9. **Audit history:** record authorized changes to off-chain records and relevant on-chain actions with actor, time, and reason.

These are future directions, not implemented Phase 1 features.