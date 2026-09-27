/**
 * Kevacoin Pool (mining side based on cryptonote-nodejs-pool, GPL-2.0 -- Kevacoin's getblocktemplate/submitblock/get_info
 * are genuine Cryptonote RPCs; payments/wallet side is plain Bitcoin Core, since kevacoind IS the wallet, no separate
 * wallet-rpc process, unlike Qwertycoin/C64). One endpoint for everything: config.node {host, port, user, password |
 * passwordFile}. The {wallet: true} option some callers pass (kept for source compatibility with the QWC-derived
 * pool.js/blockUnlocker.js) is a no-op here -- there is nothing else to route to.
 **/
let http = require('http');
let fs = require('fs');

let nodeConfig = config.node || {};

function password () {
	if (nodeConfig.password) return String(nodeConfig.password);
	if (nodeConfig.passwordFile) return fs.readFileSync(nodeConfig.passwordFile, 'utf8').trim();
	return '';
}

/**
 * call(method, params, callback(err, result), options). err is {code, message} for an RPC error (the node said no), an
 * Error for a transport problem (outcome unknown). options: {wallet: true} accepted but ignored (see above), timeout in ms.
 **/
exports.call = function (method, params, callback, options) {
	options = options || {};
	let body = JSON.stringify({jsonrpc: '1.0', id: 'pool', method: method, params: params || []});
	let auth = Buffer.from((nodeConfig.user || '') + ':' + password()).toString('base64');
	let done = false;
	let finish = function (err, result) {
		if (done) return;
		done = true;
		callback(err, result);
	};

	let req = http.request({
		host: nodeConfig.host || '127.0.0.1',
		port: nodeConfig.port || 9332,
		path: '/',
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(body),
			'Authorization': 'Basic ' + auth
		}
	}, function (res) {
		let data = '';
		res.on('data', function (chunk) { data += chunk; });
		res.on('end', function () {
			let parsed;
			try { parsed = JSON.parse(data); }
			catch (e) { return finish(new Error('invalid JSON from the node: ' + e.message)); }
			if (parsed.error) return finish(parsed.error);
			finish(null, parsed.result);
		});
	});

	req.on('error', function (e) { finish(e); });
	if (options.timeout) req.setTimeout(options.timeout, function () { req.destroy(new Error('RPC timeout: ' + method)); });
	req.end(body);
};
