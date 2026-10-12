# Clarity — store voice concierge

A browser voice agent for Rite Cleaners and Don Royal Cleaners, grounded in `Rite_Don_Royal_Store_Guide_2.xlsx`.

- **Maya / Marin:** a warm primary agent who answers questions using store-specific tools.
- **Gus / Cedar:** a grumpy, dry-witted second AI. Transfers start a fresh voice session with recent conversation context.
- **Call controls:** the caller or agent can end the call; the caller can mute, type, or request a transfer. Agent-initiated actions wait for any farewell/handoff audio to finish playing.
- **Knowledge explorer:** searchable prices, cutoff-based turnaround schedules, kiosk answers, and store details with spreadsheet row references.
- **Observability:** live transcript, inspectable tool results, and a transcript download. The app keeps transcripts only in browser memory; audio is processed by OpenAI.

## Run

Requires Node.js 22+ (tested with Node 24) and npm.

```sh
cd /workspace/Phone-Clarity-AI-Agent
npm ci
# For local development, create .env from .env.example and enter your key securely.
npm run dev
```

The server listens on port 3000. Microphone access needs a secure browser context (HTTPS for a hosted app). The knowledge explorer and local checks work without an OpenAI key. Live calls do not.

| Variable | Purpose |
| --- | --- |
| `REALTIME_API_KEY` | Server-side OpenAI API key with Realtime access. Enter securely in cloud environment settings or local `.env`. Never prefix credentials with `VITE_`. |
| `OPENAI_API_KEY` | Optional existing local binding accepted as a fallback. For Codex cloud, use the non-reserved `REALTIME_API_KEY` name. |
| `REALTIME_MODEL` | Optional model override; defaults to `gpt-realtime`. |
| `PORT` | Optional HTTP port; defaults to `3000`. |

Cloud setup declares `REALTIME_API_KEY` for the HTTPS destination `api.openai.com`. The server supports the platform's HTTPS proxy with `EnvHttpProxyAgent`. Existing proxy bindings may appear as placeholders; they are used through the configured proxy, not copied into local files. Restart the server after changing its environment, then use **Agent setup → Check connection settings**. A configured key indicates presence, not validated model access.

For a production build:

```sh
npm run build
NODE_ENV=production npm start
```

This is a development/demo app. Put it behind your access-controlled hosting layer before exposing its paid call endpoint publicly. Session creation is rate-limited and rejects cross-origin browser POST requests; it is not a user authentication system.

## Voice architecture

```text
Browser microphone / speaker
         │ WebRTC audio + Realtime data channel
         ▼
OpenAI Realtime (Maya: Marin / Gus: Cedar)
         │ function calls over data channel
         ▼
Browser call controller → same-origin Node server → imported store guide
```

The server exchanges the browser's SDP offer with `POST https://api.openai.com/v1/realtime/calls`. The long-lived API key never goes to the browser. Audio then flows over WebRTC directly to OpenAI, with voice activity detection, interruption, and transcription enabled. The server uses the GA Realtime session schema. No Pipecat media bridge is needed for this browser-only transport.

Realtime does not allow changing a voice after a session has emitted audio. A handoff therefore closes Maya's peer connection, retains the microphone and mute setting, opens a fresh Cedar session, and seeds it with up to 16 recent transcript turns. The UI marks the handoff. It is not a phone-network or SIP transfer.

## Prompt versus tools

The initial prompt contains the agent's personality, selected store, reviewed company overview, and conversation rules. It does **not** contain the entire price list. Workbook text is reference material; formulas are not executed and arbitrary document instructions are not installed as system instructions.

| Tool | Data or action |
| --- | --- |
| `get_store_details` | Address, phone, public access hours, staffed hours, tailor hours; changes the active store when needed. |
| `search_prices` | Search only the chosen store group and applicable shared Rite entries. Returns prices, units, and source rows. |
| `get_turnaround` | Match drop-off day and time to the correct cutoff interval. Return selectable options, earliest first. |
| `search_kiosk` | Retrieve relevant answers for stores with a kiosk; guide the caller one step at a time. |
| `get_staff_availability` | Compute the 7am–9pm Eastern window, including daylight-saving time. Reports that live staff routing and callback delivery are unconfigured. |
| `transfer_call` | Handoff to Gus. Available to Maya only, and explicitly described as a demo AI transfer. |
| `end_call` | Close the browser call and release microphone tracks after the farewell plays. |

Both agents use the same grounded lookup tools. Gus's demeanor does not let him invent answers that Maya cannot confirm. Store IDs, tool names, and arguments are validated on the server.

## Workbook and data decisions

The original workbook and deterministic JSON import are in `data/`. The import contains **7 stores, 1,098 price entries, 73 schedule entries, and 27 kiosk answers**. Each row retains its sheet and row number. The JSON metadata records the source filename and SHA-256.

To deliberately refresh the data after replacing the workbook:

```sh
npm run import:guide
npm test
```

The importer expects the supplied workbook layout (including the directory at Store Guide rows 34–40). Review and commit both the workbook and the generated JSON when updating source data. Dependency installation does not regenerate or rewrite them.

The following ambiguity handling is intentional:

- Never quote zero, absent, specialty, or explicitly unconfirmed prices. Ask for staff confirmation instead.
- Keep Rite's location groups and Don Royal separate. Clarify item/category/size variants before quoting a single result.
- Shared rows labeled **“All Rite stores”** but described as **“Warren DC”** are withheld outside Warren because their scope conflicts.
- Don Royal has Sunday turnaround rows despite being closed Sunday without a kiosk. Sunday drop-off quotations are withheld for Don Royal and Warren. Specific times outside their public opening hours are also withheld, since neither has a kiosk or drop box.
- Cutoffs are inclusive: 08:45 belongs to “by 8:45”; 08:46 belongs to the later interval.
- The workbook provides weekly schedules but no holiday closure calendar. The app explains the holiday caveat and does not fabricate holiday-adjusted calendar dates.
- The workbook calls for real staff transfer, callback collection, and some automatic kiosk notifications. This demo implements none of those integrations and never promises it delivered a callback or alerted staff. A transfer goes to the second AI as requested, at any time, explicitly labeled as a demo. Published store phone numbers remain available.

## Validation

```sh
npm test              # data boundaries, grounding, tools, API and provider error handling
npm run build        # strict TypeScript + production frontend build
npm run test:e2e      # browser workflow and simulated Realtime transport
```

Browser tests use `/usr/bin/chromium` in the cloud environment. Elsewhere set `PLAYWRIGHT_CHROMIUM_PATH` to your Chromium executable, or adjust the Playwright config to use a browser installed with `npx playwright install chromium`.

The simulated transport tests run the actual frontend, real tool HTTP routes, and fake-device microphone tracks. They verify context handoff, changed session configuration, microphone cleanup, typed turns, and waiting for playback before disconnecting. They do **not** establish real OpenAI audio quality or account/model access. A live microphone call with an API key is the remaining integration check.

## Main files

- `server/agents.ts` — curated instructions, personalities, voices, Realtime session configuration.
- `server/knowledge.ts` — scoped retrieval, escalation rules, schemas, tool execution.
- `server/app.ts` — same-origin API, SDP negotiation, error handling and rate limits.
- `src/realtime.ts` — WebRTC lifecycle, transcription, tool execution, transfer and teardown.
- `src/App.tsx` — voice playground, store guide, agent setup.
- `scripts/import-guide.mjs` — reproducible spreadsheet import.

Each Codex cloud task already has an isolated environment. Reuse the existing checkout; do not create a Git worktree unless the user asks. Server processes must be started again after restoring a snapshot.
