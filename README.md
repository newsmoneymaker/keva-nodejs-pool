# keva-nodejs-pool

Mining pool software for **Kevacoin (KVA)**, written in Node.js. Kevacoin is a hybrid: its mining RPC (`getblocktemplate`/`submitblock`/`get_info`) is genuine Cryptonote, wrapping a real
Bitcoin Core block and coinbase inside a CryptoNote header carrier for the proof of work, while its wallet and payouts are plain Bitcoin Core (`sendmany`, `gettransaction`, one RPC endpoint,
no separate wallet-rpc process). This pool is built from two families accordingly: the mining/stratum side is adapted from
[qwc-nodejs-pool](https://github.com/newsmoneymaker/qwc-nodejs-pool) (itself based on [cryptonote-nodejs-pool](https://github.com/dvandal/cryptonote-nodejs-pool) by Dvandal, GPL-2.0), and the
payment processor / block unlocker are adapted from [scash-nodejs-pool](https://github.com/newsmoneymaker/scash-nodejs-pool)'s plain Bitcoin-RPC code. Live example: <https://keva.pool-pay.com>.

## What it does

* **Stratum server** (plain TCP and TLS, the standard XMRig Cryptonote protocol: `login`/`job`/`submit`): the pool asks the node for a template (`getblocktemplate`), builds the RandomX
  hashing input itself (see below), and gives every miner a job with a share target that follows their hashrate (vardiff). A share that meets the real network target is spliced into the
  full template and sent back with `submitblock`.
* **RandomX input, the one real gotcha of this coin:** Kevacoin's `getblocktemplate` has no `blockhashing_blob` (unlike genuine Cryptonote coins) -- only the full `blocktemplate_blob`. The
  actual proof-of-work hashes a *reconstructed* header: the same prefix (major_version, minor_version, timestamp, prev_id, nonce) plus `merkle_root` (cn_fast_hash of the coinbase transaction
  bytes) and `nTxes` (a varint, 1 for a template with no extra transactions) -- fields the node computes on submission, not something already sitting at a fixed byte offset. `lib/pool.js`
  computes this itself for every new template. This was found and proved wrong the hard way, against a real node, before it was fixed -- see `newJobFromTemplate` for the full explanation.
* **RandomKeva** (`rx/keva`): a RandomX variant with its own Argon2 salt (`RandomKV\x01`) and a smaller L2/L3 scratchpad (128 KiB / 1 MiB instead of the reference 256 KiB / 2 MiB); every other
  RandomX parameter is the stock configuration. Block time 2 minutes.
* **Block acceptance is plain Bitcoin, not Cryptonote:** the actual consensus check is `arith_uint256::SetCompact(nBits)` plus a direct `hash <= target` comparison (`pow.cpp`
  `CheckProofOfWork`), *not* the `hash * difficulty < 2^256` convention genuine Cryptonote coins use. `getblocktemplate` does not expose `bits` directly; the pool reads the current tip's
  `bits` via the ordinary `getblockheader` RPC (retargeting only changes at window boundaries, so the tip's bits is also the next block's target).
* **Share hashing:** a small C++ helper (`hasher/rxhash`, generic across our RandomX-family pools) linked against a static RandomX library built from **Kevacoin's own vendored `cn_utils/randomx`
  sources** (`hasher/librandomx-keva.a`) -- not a generic external RandomX build -- so it is byte-identical to what the node itself computes, and a second tiny helper
  (`hasher/cnhash_helper`) built from the node's own `cn_utils/crypto/hash.c` + `keccak.c` for the `cn_fast_hash` merkle-root step. Neither is committed (build them with `make -C hasher`,
  see below); the sources and Makefile are.
* **Accounts** are Kevacoin addresses: native SegWit only (bech32, hrp `kva`, 42 characters).
* **Rewards:** PROP with time weighting (slush) or SOLO.
* **Block unlocker:** a block is settled after `depth` blocks (Kevacoin's `COINBASE_MATURITY` is 100). The reward is read from the block's own coinbase via `gettransaction`; a block no
  longer on the chain is marked orphaned and nothing is credited.
* **Payment processor:** everyone who is due is paid in one `sendmany` transaction per round. The balance is debited before sending; a batch whose outcome is unknown (crash, timeout) is
  matched against the wallet's own transaction history and never sent twice; refused or stuck batches go back to the balances. Dry-run mode, a whitelist for rehearsals and an emergency
  brake (`STOP_PAYMENTS`).
* **Website and API:** the standard cryptonote-nodejs-pool front end (dashboard, blocks, payments, top miners, worker stats, a "Getting started" page with a config generator) and the public
  read-only JSON API.
* **Protection against connection floods:** limits per IP, a login deadline, an optional IP allow list, banning of miners with many invalid shares.

## Developer donation

The pool can take a developer donation from the reward of every block it finds, before miners' shares are computed (`blockUnlocker.donations`, a table `Kevacoin address -> percent`; **empty
by default in `config_examples/keva.json`**). It's your pool and the license is the GPL: set what you want and tell your miners the truth about your pool's fees. This has nothing to do with
the miner poolpayminer (a separate project with its own, independent fee).

## Installation

Requirements: Linux, Node.js 18 or newer, Redis, a synchronised Kevacoin node (`kevacoind`/`kevacoin-cli`) with a wallet loaded, a C++ compiler for the hasher helpers, a web server for the
website and a TLS certificate for the TLS stratum ports.

```
npm install
make -C hasher            # builds hasher/rxhash and hasher/cnhash_helper against Kevacoin's own RandomX/hash sources
cp config_examples/keva.json config.json   # then fill in node RPC credentials, poolServer.poolAddress (your own wallet address) and the redis/api passwords
node init.js               # all modules in one process, or -module=pool|api|unlocker|payments|chartsDataCollector separately (see deployment/ for systemd templates)
```

## Miners

poolpayminer 1.1.18 and newer supports `-a rx/keva` out of the box; see <https://github.com/newsmoneymaker/poolpayminer>. Any Stratum miner implementing this exact RandomX variant
(RandomKeva) works too.

## Money warning

The payment processor moves real coins. Rehearse first: `"dryRun": true`, then a whitelist (`onlyAccounts`) with a few small payouts of your own, then enable it. A transaction sent to the
network cannot be cancelled. Keep the wallet backup and the RPC password private.

## License and credits

GNU GPL v2 (see LICENSE), like the original. Based on cryptonote-nodejs-pool by Dvandal and contributors, and on this project's own qwc-nodejs-pool and scash-nodejs-pool. The Kevacoin-specific
RandomX job construction, the hasher helpers and the Kevacoin RPC adaptation are new in this repository.
