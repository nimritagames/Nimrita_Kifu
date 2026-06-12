# 02 — Determinism: Canonical Form, Hashing, Randomness (DRAFT v0.1)

The concrete algorithm choices behind C2/C3. Each is a tagged decision (D-n); changing
one later is an ADR against that tag, and every one of these lands in the environment
fingerprint so logs are self-describing.

## D-1 — Canonical serialization: KCF-1 (Kifu Canonical Form), not JCS

Why not RFC 8785 (JCS): most of JCS exists to canonicalize IEEE-754 floats — which C2
**bans** — and importing the rest of its complexity buys nothing. KCF-1 is small enough
to re-implement bit-identically in any language (the language-neutral promise):

1. Value domain: objects, arrays, strings, **integers** (safe range ±2^53−1), booleans,
   null. Anything else (floats incl. -0, Map/Set, undefined, BigInt) is **rejected at
   the contract boundary** — serialization never coerces.
2. Object keys sorted by Unicode code point, recursively.
3. No whitespace; UTF-8 bytes; string escaping exactly per JSON minimal escaping
   (control chars, `"` and `\` only — no `\uXXXX` for printable characters).
4. Integers serialized in plain decimal, no exponent, no leading zeros, `-0` impossible
   (rejected as float).

## D-2 — Hash: SHA-256, hex-encoded

Boring on purpose: universal, hardware-accelerated, available in Node's crypto and every
other ecosystem (language-neutral). The per-event post-apply hash (C2) is
`sha256(KCF1(state))`. The chain digest and snapshot hashes use the same primitive.
Performance is a non-issue at turn-based event rates; if profiling ever disagrees, the
fingerprint pins the algorithm id so a migration is an explicit version event, not drift.

## D-3 — PRNG: PCG32 (XSH-RR 64/32), reference constants

Chosen over xoshiro128**: tiny state (64-bit state + 64-bit increment), bit-exact
reference implementations in every language, and integer-only arithmetic that needs no
float paths anywhere. Seeds and internal state are serialized as **decimal strings**
(64-bit values do not survive JSON numbers). The framework records the cumulative draw
count per randomness-consuming event (`rngOffset`, C3) so recovery fast-forwards and
fairness verification checks outcomes at recorded offsets without knowing the game's
consumption pattern. `RngStream.int(n)` uses Lemire-style rejection sampling (no modulo
bias); `shuffle` is Fisher-Yates over `int`.

## D-4 — KDF: HKDF-SHA-256

`segmentSeed_i = HKDF-SHA-256(ikm = masterSeed, salt = matchId, info = "kifu-seg-" || i)`,
output 16 bytes → two 64-bit PCG32 init values (state seed, stream id). Standard,
audited, in Node crypto. The per-segment commit is `sha256(segmentSeed_i)` recorded in
the segment-open event; segment-close reveals `segmentSeed_i` (C3).

## D-5 — Environment fingerprint (pinned per chain anchor, C2/C4)

```jsonc
{
  "frameworkVersion": "0.1.0",
  "gameId": "ludo", "logicVersion": "1.2.0",
  "gameBuildHash": "<commit/build hash>",
  "node": "22.17.0", "v8": "12.4",
  "lockfileHash": "<sha256 of package-lock.json>",
  "schemaVersions": { "envelope": 1, "game": 3 },
  "canonicalForm": "KCF-1", "hash": "sha256", "prng": "pcg32-xsh-rr", "kdf": "hkdf-sha256"
}
```

## D-6 — Enforcement of record (C2: detected, not enforced)

- ESLint flat-config bans in reducer/projection/materialize modules: `Date`,
  `Math.random`, `Intl`, `toLocale*`, `localeCompare`, `crypto.getRandomValues`,
  `process`, dynamic `import`, `fetch`/network, `fs`.
- Dev mode: frozen-state double-execution per event + KCF-1 hash compare.
- The hash-verified replay gate (CI + recovery + shadow) is the final authority: a
  divergence hard-fails at its exact eventSeq, never completes silently.
