/**
* Ajax over websocket for jQuery
* @author Robin Verlangen
* @url https://github.com/RobinUS2/ajax-over-websocket
**/
var aowInit = true;
var aowEnabled = true;
var aow = function() {
	if (aowInit) {
		console.log('aow init');

		var options = {
			socket : 'ws://localhost/echo',
			openTimeout : 500
		};

		var exampleSocket = new WebSocket(options.socket);

		// Connection timeout
		setTimeout(function() {
			if (!socketOpen) {
				// Failed connection
				console.error('Failed to connect to websocket within openTimeout (' + options.openTimeout + '), disabling aow');
				aowEnabled = false;
			}
		}, options.openTimeout);

		exampleSocket.onmessage = function (event) {
			var split = event.data.split('\t');
			var reqId = split[0];
			var data = split[1];
			var req = reqs[reqId];
			req.receiveTime = now();
			var latency = req.receiveTime - req.startTime;
			if (debug) {
				console.log(req);
				console.log(data);
				console.log('latency ' + latency);
			}

			if (typeof req.postDataFilters !== 'undefined' && req.postDataFilters !== null && req.postDataFilters.length != 0) {
				for (var k in req.postDataFilters) {
					// @todo has own prop
					var postDataFilter = req.postDataFilters[k];
					data = postDataFilter.method.apply(this, [data]);
				}
			}

			if (typeof req.callback === 'function') {
				reqs[reqId].callback(data);
			}
		};

		var queue = [];
		var socketOpen = false;
		var reqId = 0;
		var reqs = [];
		var debug = false;

		exampleSocket.onerror = function (event) {
			console.error('Websocket error, disabling aow');
			aowEnabled = false;
		};

		exampleSocket.onclose = function (event) {
			console.error('Websocket closed, disabling aow');
			aowEnabled = false;
		};

		exampleSocket.onopen = function (event) {
			socketOpen = true;
			if (debug) {
				console.log('connection opened');
			}
			$(queue).each(function(i, record) {
				deliver(record);
			});
			if (debug) {
				console.log('flushed queue');
			}
		}

		var originalFunctions = {
			'get':     jQuery.get,
			'getJSON': jQuery.getJSON
		};
		if (debug) {
			console.log('original functions', originalFunctions);
		}

		jQuery.get = function() {
			// Params
			var params = arguments;

			// Only if we support this type of request
			var supported = false;
			if (params.length == 1 && typeof params[0] === 'string') {
				supported = true;
			} else if (params.length == 2 && typeof params[0] === 'string' && typeof params[1] === 'function') {
				supported = true;
			}

			// Did we support this?
			if (!supported || !aowEnabled) {
				return originalFunctions['get'].apply(this, arguments);
			}

			var opts = {};
			if (typeof params[1] === 'function') {
				opts.callback = params[1];
			}

			sendRequest(params[0], opts);
		};

		jQuery.getJSON = function() {
			// Params
			var params = arguments;

			// Only if we support this type of request
			var supported = false;
			if (params.length == 2 && typeof params[0] === 'string' && typeof params[1] === 'function') {
				supported = true;
			}

			// Did we support this?
			if (!supported || !aowEnabled) {
				return originalFunctions['getJSON'].apply(this, arguments);
			}

			var opts = {};
			if (typeof params[1] === 'function') {
				opts.callback = params[1];
			}
			opts.postDataFilters = [];
			opts.postDataFilters.push({ method : JSON.parse });

			sendRequest(params[0], opts);
		};

		var sendRequest = function(req, opts) {
			// Get request ID
			reqId++;

			// Assemble record
			var record = { 
				id : reqId, 
				param : req, 
				startTime : now(), 
				sendTime : null, 
				receiveTime : null,
				callback: null,
				postDataFilters: []
			};
			if (opts !== null) {
				for (var k in opts) {
					// @todo has own prop
					record[k] = opts[k];
				}
			}

			// Track request
			reqs[reqId] = record;

			// Queue
			if (!socketOpen) {
				if (debug) {
					console.log('request queued for connecting socket')
				}
				queue.push(record);
			} else {
				deliver(record);
			}
		};

		var deliver = function(record) {
			reqs[record.id].sendTime = now();
			if (debug) {
				console.log('sending', record);
			}
			exampleSocket.send(record.id + '\t' + record.param);
		};

		var now = function() { 
			try {
				return window.performance.now();
			} catch (e) {
				return new Date().getTime();
			}
		};
	}
}();