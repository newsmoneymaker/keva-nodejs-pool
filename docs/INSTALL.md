# Installing a Qwertycoin pool

Paths below are examples: the pool in `/opt/qwc-nodejs-pool`, the node and wallet in `/opt/qwc`, all run by the user `qwcpool`
(the systemd templates in `deployment/systemd/` use these paths).

## 1. Qwertycoin node and wallet

Qwertycoin v2 is a new network (Monero 0.18 code base). Build the node and the wallet from the release tag (the project also publishes binaries
in <https://github.com/qwertycoin-org/qwertycoin/releases>: verify `SHA256SUMS`, or build):

```
git clone --branch v2.0.2 --depth 1 --recursive --shallow-submodules https://github.com/qwertycoin-org/qwertycoin && cd qwertycoin
# Debian/Ubuntu: build-essential cmake pkg-config git python3 libboost-all-dev libssl-dev libzmq3-dev libpgm-dev libunbound-dev libsodium-dev
#   libhidapi-dev libusb-1.0-0-dev libunwind-dev liblzma-dev libreadline-dev libexpat1-dev
mkdir build && cd build && cmake -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTS=OFF -DUSE_DEVICE_TREZOR=OFF ..
make -j4 daemon simplewallet wallet_rpc_server        # binaries in build/bin: qwertycoind, qwertycoin-wallet-cli, qwertycoin-wallet-rpc
```

Run the node (`deployment/systemd/qwc-node.service`): `qwertycoind --data-dir /opt/qwc/data --rpc-bind-ip 127.0.0.1 --rpc-bind-port 8197 --p2p-bind-port 8196 --no-zmq`.
It finds its peers by itself (built-in seed nodes) and synchronises in minutes: `curl -s 127.0.0.1:8197/json_rpc -d '{"jsonrpc":"2.0","id":"0","method":"get_info"}'`
shows `"synchronized": true`. Open the P2P port 8196 in your firewall if you want incoming peers.

Create the pool wallet (the 25 words are printed once: **write them down and keep them offline**, do not let the output land in a log):

```
qwertycoin-wallet-cli --generate-new-wallet /opt/qwc/wallet/pool --password-file /opt/qwc/wallet/password --daemon-address 127.0.0.1:8197
```

Then run the wallet RPC (`deployment/systemd/qwc-wallet-rpc.service`): `qwertycoin-wallet-rpc --wallet-file /opt/qwc/wallet/pool --password-file /opt/qwc/wallet/password
--rpc-bind-ip 127.0.0.1 --rpc-bind-port 8198 --disable-rpc-login --daemon-address 127.0.0.1:8197 --trusted-daemon`. It listens on the local machine only and pays
without a password: keep only the coins that are about to be paid out in this wallet. The wallet's main address (`QWC1...`) is the pool address (`poolServer.poolAddress`):
every block template pays its coinbase there.

## 2. RandomX helper

The helper must use the same RandomX as the node: use the library the node build made (`build/external/randomx/librandomx.a`) or build tevador/RandomX v1.2.x.

```
mkdir -p /opt/randomx/include /opt/randomx/lib
cp /path/to/qwertycoin/external/randomx/src/randomx.h /opt/randomx/include && cp /path/to/qwertycoin/build/external/randomx/librandomx.a /opt/randomx/lib
cd /opt/qwc-nodejs-pool/hasher && make RANDOMX=/opt/randomx
```

The helper needs about 2.3 GB of RAM (RandomX dataset, fast mode; `"hasher": {"light": true}` uses 256 MB and is much slower). Check it against the chain:
`node test/test-real-blocks.js`.

## 3. Redis

Use a dedicated instance with a password and AOF (`deployment/redis-pool.conf.example`, unit `qwc-pool-redis`, port 6382).

## 4. The pool

```
cd /opt/qwc-nodejs-pool && npm install --production
cp config_examples/qwc.json config.json      # then edit it
```

Edit `config.json`: `poolHost`, `poolServer.poolAddress`, the ports and the certificate for TLS (`poolServer.sslCert/sslKey`), `redis`, `api.password`,
`blockUnlocker.poolFee` and `donations`, `payments`. **Keep `payments.dryRun: true` until the rehearsal below.**

```
cp deployment/systemd/*.service /etc/systemd/system/ && systemctl daemon-reload
systemctl enable --now qwc-pool-redis qwc-node qwc-wallet-rpc
systemctl enable --now qwc-pool qwc-pool-api qwc-pool-unlocker qwc-pool-payments qwc-pool-charts
```

The pool runs as separate modules (`init.js -module=pool|api|unlocker|payments|chartsDataCollector`), each in its own unit. The pool module keeps one hasher process
(and its RandomX dataset), so run it as one process. Until payouts are proven, restrict the stratum ports with `poolServer.allowIPs`.

## 5. Website

Copy `website_example/` to the web root, set `poolHost`, the contact and links in `config.js`, and proxy `/api` to the pool API on 127.0.0.1:8120
(`deployment/apache-vhost.conf.example` exposes only the read-only methods).

## 6. Rehearse the payments

1. `payments.dryRun: true`: the log of `qwc-pool-payments` shows what would be paid.
2. Fund the pool wallet with a few coins (or wait for the first block), credit a small balance in Redis to your own test addresses
   (`<coin>:workers:<address>`, field `balance`), set `payments.onlyAccounts` to them, `dryRun: false`, and watch the payout confirm.
3. Remove the test accounts from Redis and set `onlyAccounts` to `[]`.

Good to know: block rewards can be spent after 60 blocks (plus the wallet's usual 10 confirmations for change); `deployment/pause-payments.sh` stops new payouts
at once; a wallet cannot abandon a transaction, so a payout that stays unconfirmed for `pendingTimeoutHours` is only reported in the log and must be checked by hand.
