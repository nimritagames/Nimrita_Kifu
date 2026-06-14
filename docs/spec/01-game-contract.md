# 01 — The Game Contract (DRAFT v0.2)

The complete surface a game implements. Everything here is **pure**: no IO, no clocks,
no randomness sources, no identity lookups (C2/C3/C10 — lint-banned and replay-verified).
A game is this interface and nothing else; the framework owns everything impure.

Incorporates Contract Revision Set 1 (R1–R7, charter Amendment 2): R1 (materialize),
R2 (system grants), R3 (grant lifecycle), R4 (collect-all groups), R5 (standing grants),
R6 (grant delivery), R7 (validators as the admission surface).

Incorporates Contract Revision Set 2 (R8–R12, from the gate re-run — `docs/phase0/1-RERUN-VERDICT.md`):
R8 (grant order = emission order), R9 (SeatRef is per-occupancy), R10 (watchdog grant shape),
R11 (deadlines read state anchors, never a clock), R12 (settlement-touching covers boundary disposal).

```ts
// ---------- Foundation types ----------

/** Canonical state: objects, arrays, strings, integers, booleans, null.
 *  No floats, Map, Set, undefined, -0 — rejected at the contract boundary (C2). */
export type CanonicalJson =
  | string | number | boolean | null
  | CanonicalJson[] | { [key: string]: CanonicalJson };

/** Opaque per-OCCUPANCY reference — the ONLY player identifier game code ever sees (C10).
 *  R9: a SeatRef identifies one seating occupancy, NOT a seat position. Taking a vacated
 *  seat mints a FRESH SeatRef; refs are never recycled across occupants. Because projection
 *  keys on this ref, a new occupant's projectEvent owner-match fails for the prior occupant's
 *  records — a joiner can never decode a predecessor's hidden payloads. Games key state on
 *  SeatRef, not integer seat positions (maintain a SeatRef↔position map if positions matter). */
export type SeatRef = string & { readonly __brand: 'SeatRef' };

/** Server-assigned admission timestamp, integer ms — the sole time authority (C8). */
export type Timestamp = number;

/** Who a projection is computed for (C9). */
export type Viewer = { kind: 'seat'; seat: SeatRef } | { kind: 'observer' };

// ---------- Events ----------

/** A recorded game event as reducers and projections see it.
 *  The full envelope (eventSeq, incarnation, hashes, rngOffset) is framework-owned
 *  and specified in 03-event-model.md; game code receives this view of it. */
export interface GameEvent<TType extends string = string, P = CanonicalJson> {
  type: TType;
  seat: SeatRef | null;        // null: system event (R2) or external input (C8)
  payload: P;
  ts: Timestamp;               // == the injected clock's value while reducing this event
  segmentIndex: number;
}

// ---------- The contract ----------

export interface GameDefinition<S extends CanonicalJson, A extends ActionTypeMap> {
  meta: {
    gameId: string;            // stable identifier ('ludo', 'mahjong-riichi')
    logicVersion: string;      // semver or build hash; stamped on every event (C4)
    seats: { min: number; max: number };
  };

  /** Initial state. Randomness (initial shuffle etc.) does NOT happen here — it enters
   *  via materialized events (R1/C3), so setup is pure and trivially replayable. */
  setup(config: CanonicalJson, seats: SeatRef[]): S;

  /** R7: THE admission surface. The framework calls the matching validator for every
   *  inbound intent (grant responses AND nonGrantIntents). Verdict + reason code are
   *  recorded in the admission log (C1). Constraints inside grants are opaque hints
   *  for clients; validators are the law. */
  validators: { [K in keyof A]: (state: S, intent: Intent<A[K]>) => Verdict };

  /** Pure transitions. Receive ADMITTED events only (validation is ingestion-only, C4).
   *  Must tolerate redacted payloads when replayed client-side from projections (C9). */
  reducers: { [K in keyof A]: (state: S, event: GameEvent<string, A[K]>) => S };

  /** C7 + R2/R3/R4/R5: the single flow API — evaluated after every admitted event.
   *  See grant semantics below. */
  pendingGrants(state: S): Grant<A>[];

  /** R1: admission-time payload construction for events whose payload the actor cannot
   *  author — expiry defaults, forced reveals, system steps, and ALL structured
   *  randomness (deals, draws, shuffles). `rng` is the framework's deterministic
   *  per-segment stream (C3); the recorded event carries the result verbatim. */
  materialize?: { [K in keyof A]?: (state: S, actor: SeatRef | null, rng: RngStream) => A[K] };

  /** C9: the single derivation path for client knowledge. Live broadcast, resync, and
   *  per-seat replay ALL use exactly this. Stateless; past events never re-projected;
   *  time-varying visibility uses reveal-as-explicit-event. Return null = invisible. */
  projectEvent(event: GameEvent, viewer: Viewer): GameEvent | null;
  projectState(state: S, viewer: Viewer): CanonicalJson;

  /** Checked after every admitted event in dev/CI; shadow-replayed in prod (C11).
   *  R12: every SETTLEMENT-TOUCHING reducer MUST be covered by at least one redundant-
   *  recompute invariant — an independently written recomputation compared against the
   *  reducer's output. "Settlement-touching" includes reducers that move stakes at a
   *  SEGMENT or SESSION boundary (riichi-pot disposal at close, side-pot settlement),
   *  not only per-action payouts. The game declares which reducers are settlement-touching
   *  (see `settlementTouching` below). */
  invariants: Array<{ name: string; check(state: S, event: GameEvent): true | string }>;

  /** R12: action types whose reducers move stakes/score with external consequence. CI
   *  enforces that each is covered by a redundant-recompute invariant. */
  settlementTouching?: Array<keyof A>;

  /** R7: intent types admissible WITHOUT a grant (join-table, wallet callbacks,
   *  operator actions). Their validators carry full authorization responsibility. */
  nonGrantIntents?: Array<keyof A>;

  /** C8: session shape. */
  session: {
    termination: { kind: 'explicit-close' } | { kind: 'max-duration'; ms: number };
    /** Segment boundaries are ordinary events; this names which event types open/close
     *  segments so the framework can place snapshots, seed commits, and quarantine
     *  boundaries (C3/C4/C5). */
    segmentOpenTypes: Array<keyof A>;
    segmentCloseTypes: Array<keyof A>;
  };
}

// ---------- Grants (C7 with R1–R6) ----------

export interface Grant<A extends ActionTypeMap> {
  /** R2: null seat = system grant — the game's mechanism for framework-appended
   *  steps (deal, reveal, hand-start). With allowedActions: [] and deadline at-or-
   *  before now, it fires immediately on arming. */
  seat: SeatRef | null;

  /** Action types this grant permits, with opaque per-action constraint data the
   *  game's own validator interprets (R7) and clients render. May be empty (pure
   *  system step). */
  allowedActions: Array<{ type: keyof A; constraints?: CanonicalJson }>;

  /** R5: optional. Absent => STANDING grant (resign-anytime, sit-out, rebuy) — no
   *  deadline, no expiry, retired only by re-evaluation no longer returning it. */
  deadline?: Timestamp;

  /** Fires as a framework-appended admitted event when the deadline elapses; payload
   *  built by `materialize[action]` (R1). Required iff deadline is present. */
  onExpiry?: { action: keyof A };

  /** R4: grants sharing a groupId (within one evaluation) form a collect-all group:
   *  responses buffer outside the log, satisfy-and-disarm their grant on acceptance,
   *  and admit as one contiguous batch when the last member closes; re-evaluation
   *  defers until the batch completes; admitLimit bounds how many members may admit
   *  (multi-ron > 1; atamahane single-winner = admitLimit 1).
   *
   *  R8 — GRANT ORDER IS EMISSION ORDER: the batch (buffered responses + expiry
   *  defaults) admits in the order pendingGrants RETURNED the grants in the arming
   *  evaluation. This is distinct from the canonical action-type sort used for grant
   *  IDENTITY (lifecycle rule 1) — identity-sort is NOT admission-order. admitLimit:1
   *  admits the first emission-order member; later satisfied members are recorded as
   *  arbitration losers. Games encode priority (e.g. atamahane counterclockwise from
   *  discarder) purely by the order they emit grants.
   *
   *  Omitted => independent grant; overlapping independent responses arbitrate by
   *  `resolution`. */
  resolution?:
    | { kind: 'priority-order' }
    | { kind: 'first-come' }
    | { kind: 'collect-all'; groupId: string; admitLimit?: number };
}

// ---------- Grant lifecycle (R3 — normative, framework-owned) ----------
// 1. After every admitted event (or completed collect-all batch), pendingGrants(state)
//    REPLACES the armed set. Grant identity = (seat, sorted action types, deadline).
// 2. Identical grants re-arm idempotently; absent grants are disarmed and their expiry
//    never fires. Exactly one expiry event per UNSATISFIED grant whose deadline elapses.
// 3. An armed deadline D fences the log: no response to that grant timestamped > D is
//    admitted before D's expiry event; ties at D resolve to the expiry.
// 4. A deadline at-or-before the current admission timestamp fires immediately on arming.
// 5. Expiry events carry the ACTUAL server admission timestamp (>= D; late firing after
//    outages is legal and visible).
// 6. R6: grants are delivered only to their own seat, after projection; system grants
//    are delivered to no one. Grant existence itself can leak — flow helpers must offer
//    uniform-window modes for hidden-information games.
// 7. R11 — DEADLINES READ STATE, NEVER A CLOCK: pendingGrants(state) has no clock. Every
//    future deadline it returns is computed from an absolute timestamp a PRIOR reducer
//    recorded into state (received as that event's ts, C8) — e.g. windowOpenTs+claimMs,
//    turnTs+turnMs, the literal sessionDeadlineMs. This is why claim windows do NOT creep:
//    the anchor is frozen in state, so every re-evaluation recomputes the identical
//    deadline (and thus the identical grant identity, rule 1). Computing a deadline from
//    "now" or from the last event's ts is the anti-pattern this rule forbids.
// 8. R10 — TWO SYSTEM-GRANT SHAPES: (a) IMMEDIATE STEP — seat:null, allowedActions:[],
//    deadline <= now => fires on arming (deal, reveal, hand-start). (b) WATCHDOG —
//    seat:null, allowedActions:[], deadline a FUTURE timestamp, onExpiry an escalation
//    (wallet-close liveness, session max-duration). Both are legal; (b) is a liveness
//    fence whose only effect is its onExpiry if nothing satisfies it first.

// ---------- Supporting types ----------

export type Verdict =
  | { ok: true }
  | { ok: false; reason: string };   // machine-readable code, recorded in admission log

export interface Intent<P = CanonicalJson> {
  seat: SeatRef | null;              // null for external inputs (wallet callbacks)
  payload: P;
  ts: Timestamp;                     // admission timestamp (becomes the event ts)
}

/** C3: deterministic, admission-layer-only randomness. Game code touches this ONLY
 *  inside materialize. Draw counts are recorded as rngOffset in the envelope. */
export interface RngStream {
  int(maxExclusive: number): number;          // uniform [0, maxExclusive)
  shuffle<T extends CanonicalJson>(items: T[]): T[];
}

export type ActionTypeMap = Record<string, CanonicalJson>;
```

## What is deliberately NOT in the contract

- **No timers API** — deadlines derive from state via pendingGrants; there is no second
  mechanism (C7).
- **No RNG outside materialize** — reducers and projections are RNG-free by type and lint.
- **No identity** — SeatRef is opaque; the identity map lives outside the framework (C10).
- **No effects** — games never emit; settlement is an ordinary event type whose external
  consequences the framework's outbox owns (C6).
- **No framework event types** — seal-release, break-glass, incident-settlement never
  reach game code; the framework projects its own vocabulary (C9).

## Gate status on this document

The **hanchan-carryover** and **cash-rebuy** gates re-ran against v0.1 (`docs/phase0/reruns/`,
verdict `docs/phase0/1-RERUN-VERDICT.md`): 5/6 and 6/7 kill-shots survived; the two failures
(undefined "grant order"; undefined SeatRef occupancy semantics) are closed by R8 and R9 above,
now folded into this v0.2. A **confirmation gate pass** against v0.2 must return clean (6/6 and
7/7) before the C7/C8 freeze. Until then this contract is DRAFT and may still move.
