# Manual Browser Test Checklist

Status: every item below is **NOT YET RUN**. Do not mark an item complete until a person performs the browser test and records the result.

- [ ] NOT YET RUN — Open the app without MetaMask installed; confirm public event browsing is available and wallet-dependent submission is unavailable with a clear message.
- [ ] NOT YET RUN — Open the app with MetaMask installed but disconnected; confirm browsing remains available and submission prompts for connection.
- [ ] NOT YET RUN — Connect to a network other than the configured chain; confirm the wrong-network notice and network switch action.
- [ ] NOT YET RUN — Reject a MetaMask transaction prompt; confirm a rejected-transaction error is displayed and the page remains usable.
- [ ] NOT YET RUN — Cause a transaction to fail (for example, submit a duplicate registration reference); confirm the mapped error is shown.
- [ ] NOT YET RUN — Register successfully for an open event; confirm the transaction receipt and generated participant reference, salt, and commitment are displayed.
- [ ] NOT YET RUN — Attempt to register the same participant reference twice for one event; confirm the duplicate is rejected and the original record is unchanged.
- [ ] NOT YET RUN — As an organizer, look up a registered participant with the saved event and reference; confirm the on-chain registration is found and verify the commitment with the saved salt.
- [ ] NOT YET RUN — As an organizer, look up an unknown reference; confirm the result is NOT FOUND and identity remains pending.
- [ ] NOT YET RUN — Connect Hardhat Local Account #2 and attempt to create an event; confirm organizer access is denied.
- [ ] NOT YET RUN — Connect Hardhat Local Account #1 to the public Register page; confirm an active event created by Account #0 is visible.

Registration and commitment results do not establish real-world identity. In-person identity comparison remains an organizer responsibility.