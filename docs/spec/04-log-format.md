# 04 — Log Format: Framing, Segments, Snapshots, Sidecars (DRAFT v0.1)

The physical durability layer. Derived from C4 (segments, snapshots, re-anchoring,
immutability) and C5 (fsync, torn-tail, single-writer, quarantine). Frozen-charter-driven.

## D-11 — On-disk framing: length-prefixed, checksummed records

A room session is one append-only file. Each record:

```
┌──────────┬──────────┬───────────────────────────┐
│ u32 len  │ u32 crc  │  KCF-1 bytes (len bytes)   │
└──────────┴──────────┴───────────────────────────┘
  len = byte length of the KCF-1 payload
  crc = CRC32C (Castagnoli) of the KCF-1 payload
  payload = KCF1(record)   // MatchRecord, AdmissionRecord, or a header (D-12)
```

CRC32C is for **torn-tail / corruption detection only** — it is not the integrity
mechanism (that is the SHA-256 hash chain, D-7). Cheap, hardware-accelerated, sufficient
to tell a clean boundary from a ripped one.

**Torn-tail recovery (C5):** scan from the last verified snapshot forward. A record is
*clean* iff `len` fits before EOF and `crc` matches. The first record that fails either
test is the torn tail; everything before it is the recoverable prefix. Recovery then
compares the recoverable prefix's last `eventSeq` against the last client-acked seq
(tracked out-of-band): if the persisted tail is **behind** the acked seq, the match is
**quarantined as an incident** — never silently resumed from the shorter prefix (C5).

## D-12 — Segment headers anchor version + fingerprint + re-anchor points

A `seg.header` record opens each segment and each mid-segment re-anchor (C4):

```ts
interface SegmentHeader {
  kind: 'seg.header';
  segmentIndex: number;
  anchorPrevLink: string;          // chain genesis for this segment (= prior verified
                                   // snapshot hash, or the previous segment's final link)
  versionRun: Array<{ fromEventSeq: number; logicVersion: string }>;
                                   // ordered; mid-segment re-anchoring appends entries (C4)
  fingerprint: EnvironmentFingerprint;   // D-5 in 02-determinism
}
```

Divergence classification (C4) reads `versionRun`: a hash mismatch inside a single
`logicVersion` span = **data divergence (bug)**; a mismatch across a version boundary =
**code-changed (expected)**. Never blended.

## D-13 — Snapshots: constitutional at every segment boundary, verified before use

```ts
interface Snapshot {
  kind: 'snapshot';
  atEventSeq: number;              // state AFTER this seq
  segmentIndex: number;
  stateHash: string;               // sha256(KCF1(state)) — must equal the postStateHash
                                   // of atEventSeq's record
  state: CanonicalJson;            // the full canonical state (Class A artifact, D-15)
}
```

- A verified snapshot at **every segment boundary is constitutional** (C4); cadence config
  adds mid-segment snapshots only.
- "Verified" = the snapshot's `stateHash` was confirmed equal to a fresh replay's
  `postStateHash` at `atEventSeq` **before** the snapshot is trusted for recovery,
  re-anchoring, or a cross-logicVersion deploy. No snapshot is used unverified (C4).
- Recovery/replay start = latest verified snapshot + suffix replay. Deploy of a reducer-
  semantics change: graceful shutdown forces a verified boundary snapshot, the orchestrator
  confirms it durable **before** binary swap, then the new logicVersion appends (C4).

## D-14 — Immutability and derived views (C4)

Original log bytes are **immutable forever**. A breaking schema change never rewrites them;
it produces a **derived view** (a separate materialized file) via a versioned migration
function. Tamper digests (C6 settlement digest) verify against **originals**, pinned as
`(schemaVersion, originalLogDigest)`. The migrated-corpus CI predicate (C4) is: migrated
events replay without error + invariants hold + terminal states match originals under a
semantics-preserving equivalence adapter. Hash-identity is explicitly **not** the cross-
migration predicate.

## D-15 — Two artifact classes, and the seal-release sidecar (C10/C3)

- **Class A** (sealed machine artifacts): snapshots, crash payloads, recovery state, repro
  exports. Full-fidelity, pseudonymized (opaque seat refs only), encrypted at rest,
  access-audited, never human-rendered except break-glass.
- **Class B** (rendered surfaces): replay views, inspector, alerts, viewing exports — always
  through `projectEvent`/`projectState` for an explicit viewer role; never a replay input.
- **Seal-release sidecar:** the `audit.sealRelease` record's `masterSeed` payload is stripped
  into an access-audited **sealed sidecar** at export time; a hash placeholder stays in the
  event body so the chain still verifies (D-7). Fairness-verification tooling is the
  sidecar's only consumer. This keeps repro exports payload-complete *without* distributing
  master seeds into the golden corpus / every CI runner.

## D-16 — Single writer, fencing, and the audit appendix (C5/C1)

- Exactly one writer per room log at a time; appends carry a room **epoch / fencing token**;
  stale-epoch appends fail loudly. v1 is single-node-per-room; multi-node = ownership
  handoff (epoch bump), never concurrency.
- The **audit appendix** (C1) is a *separate* append-only chain per session for post-terminal
  records (break-glass on archived sessions, repro-export creation, re-bless acceptances).
  Its genesis link = the emitted settlement digest, so it is anchored to the wallet-held
  digest. Written by a framework-level audit writer distinct from the room writer (which no
  longer exists once the session is terminal).

## Not in this document

Outbox framing, emission high-watermark, and execution-mode wiring (C6) → `05-runtime.md`.
Export/inspector/replay tooling surfaces (C10/C11) → `06-observability.md`.
