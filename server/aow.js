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
			socket : 'ws://localhost/echo', // URI to websocket server
			openTimeout : 100, // Millisecond timeout to connect to the socket
			queueOnConnect: false, // Set into queue for the websocket channel, false will execute fallback until socket is available
			debug: false, // Debug logging
		};

		var exampleSocket = new WebSocket(options.socket);

		// Connection timeout
		setTimeout(function() {
			if (!socketOpen) {
				// Failed connection
				console.error('Failed to connect to websocket within openTimeout (' + options.openTimeout + '), disabling aow');
				aowEnabled = false;

				// Replay queue
				$(queue).each(function(i, record) {
					record.executeFallback();
				});
			}
		}, options.openTimeout);

		exampleSocket.onmessage = function (event) {
			var aowResp = JSON.parse(event.data);
			var reqId = aowResp.id;
			var rawData = aowResp.text;
			var data = aowResp.text;
			var req = reqs[reqId];
			req.receiveTime = now();
			var latency = req.receiveTime - req.startTime;
			if (options.debug) {
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
				// @todo Make jQuery compatible: object data - string text status - jqXHR
				// @url https://github.com/jquery/jquery/blob/9d1b989f20b550af3590691723b0620f6914626e/src/ajax.js#L419
				var xhr = new XMLHttpRequest();
				xhr.statusText = 'success'; // @todo Map
				xhr.status = 200; // @todo Map
				xhr.responseText = rawData;
				xhr.readyState = 4; // @todo Map
				reqs[reqId].callback(data, xhr.statusText, xhr);
			}
		};

		var queue = [];
		var socketOpen = false;
		var reqId = 0;
		var reqs = [];

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
			if (options.debug) {
				console.log('connection opened');
			}
			$(queue).each(function(i, record) {
				deliver(record);
			});
			if (options.debug) {
				console.log('flushed queue');
			}
		}

		var originalFunctions = {
			'get':     jQuery.get,
			'getJSON': jQuery.getJSON
		};
		if (options.debug) {
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

			if (!socketOpen) {
				opts.args = arguments;
			}

			sendRequest('get', 'GET', params[0], opts);
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

			if (!socketOpen) {
				opts.args = arguments;
			}

			sendRequest('getJSON', 'GET', params[0], opts);
		};

		var sendRequest = function(originalMethod, method, uri, opts) {
			// Get request ID
			reqId++;

			// Fix URI to become absolute URL
			if (uri.indexOf('http://') === -1 && uri.indexOf('https://') === -1) {
				var loc = window.location.pathname;
				var dir = loc.substring(0, loc.lastIndexOf('/'));
				uri = window.location.origin + dir + '/' + uri;
			}

			// Assemble record
			var record = { 
				id : reqId, 
				uri : uri, 
				startTime : now(), 
				sendTime : null, 
				receiveTime : null,
				callback: null,
				postDataFilters: null,
				originalMethod: originalMethod,
				args: null,
				executeFallback : function() {
					if (options.debug) {
						console.log('Fallback request ' + this.id);
					}
					originalFunctions[this.originalMethod].apply(this, this.args);
				}
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
				if (options.queueOnConnect) {
					if (options.debug) {
						console.log('request queued for connecting socket')
					}
					queue.push(record);
				} else {
					record.executeFallback();
				}
			} else {
				deliver(record);
			}
		};

		var deliver = function(record) {
			reqs[record.id].sendTime = now();
			if (options.debug) {
				console.log('sending', record);
			}
			var reqStr = JSON.stringify({
				id: record.id,
				uri : record.uri
			});
			exampleSocket.send(reqStr);
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