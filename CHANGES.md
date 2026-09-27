# Changes

## Unreleased

* The variable difficulty is remembered per address and worker across reconnects (`poolServer.diffMemoryMinutes`, default 15): a miner whose connection is cut or renewed every half minute no longer restarts from the start difficulty each time. `test/test-qwc-vardiff.js`.

## 1.0.0

* First release: Qwertycoin v2 (Monero based, RandomX) pool derived from veil-nodejs-pool and epic-nodejs-pool. Stratum for `rx/0` (XMRig protocol), share checking with the
  RandomX helper `hasher/rxhash`, block templates and submission through `get_block_template` / `submit_block`, Monero style addresses (base58 with a Keccak-256 checksum),
  the unlocker reads the pool's real coinbase share from the wallet, payouts with the wallet's `transfer` (one transaction for all due miners, fee taken from the payouts).
* Tested against real mainnet blocks (`test/test-real-blocks.js`) and a simulated node and wallet (`test/test-qwc-pool.js`, `test/test-qwc-payments.js`).
* Not yet checked on a real block found by the pool: the exact answer of the wallet's `get_transfer_by_txid` for a coinbase (the code expects `transfer.amount`), and a real payout
  with `subtract_fee_from_outputs`.
