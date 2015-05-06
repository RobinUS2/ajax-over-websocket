/**
* Ajax over websocket for jQuery
* @author Robin Verlangen
* @url https://github.com/RobinUS2/ajax-over-websocket
**/
jQuery.ajaxOverWebsocket = function(userOptions) {
	var options = {
		socket : 'ws://localhost/echo', // URI to websocket server
		openTimeout : 100, // Millisecond timeout to connect to the socket
		queueOnConnect: false, // Set into queue for the websocket channel, false will execute fallback until socket is available
		debug: false, // Debug logging
		enabled: true, // Enable proxy features
		methods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'], // Enabled methods
	};
	// Merge options
	if (typeof userOptions === 'object') {
		for (var k in userOptions) {
			// @todo has own prop
			var userOption = userOptions[k];
			options[k] = userOption;
		}
	}

	if (options.debug) {
		console.log('aow init');
	}

	// Create socket
	// @todo Rename
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

	// Receive messages on the socket
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

		// Fix XHR
		req.xhr.readyState = 4;
		req.xhr.status = aowResp.status; // @todo based on response status
		req.xhr.statusText = aowResp.status <= 399 ? 'success' : 'error'; // @todo based on response status
		req.xhr.responseText = rawData;

		// Callbacks
		if (req.xhr.statusText === 'success' && typeof req.success === 'function') {
			// Success
			reqs[reqId].success(data, req);
		} else if (req.xhr.statusText !== 'success' && typeof req.error === 'function') {
			// Error
			// @todo Forward error
			reqs[reqId].error('err here', req);
		}

		// Complete
		if (typeof req.complete === 'function') {
			reqs[reqId].complete(req);
		}
	};

	// Queue for replaying
	var queue = [];

	// Did we connect?
	var socketOpen = false;

	// Request ID
	var reqId = 0;

	// Requests (pending AND results)
	var reqs = [];

	// Catch socket errors
	exampleSocket.onerror = function (event) {
		console.error('Websocket error, disabling aow');
		aowEnabled = false;
	};

	// Catch socket close
	exampleSocket.onclose = function (event) {
		console.error('Websocket closed, disabling aow');
		aowEnabled = false;
	};

	// Listen for open event
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
	};

	// Keep original functions
	var originalFunctions = {
		'ajax':     jQuery.ajax
	};
	if (options.debug) {
		console.log('original functions', originalFunctions);
	}

	// Override jQuery ajax
	jQuery.ajax = function() {
		// Capture arguments
		var ajaxArgs = arguments;

		// Request method
		var requestMethod = ajaxArgs[0].type ? ajaxArgs[0].type.toUpperCase() : 'GET';

		// Enabled and supported?
		if (!aowEnabled || !socketOpen || options.methods.indexOf(requestMethod) === -1) {
			// Regular ajax call
			return originalFunctions['ajax'].apply(this, arguments);
		}

		// Capture the old before hook in order to cancel this one
		var oldBefore = arguments[0].beforeSend;
		arguments[0].beforeSend = function(xhr) {
			// Apply old before
			if (typeof oldBefore !== 'undefined') {
				oldBefore.apply(this, arguments);
			}

			// Dispatch our way
			var opts = {
				success: function(data, req) {
					// jQuery success callback
					if (typeof ajaxArgs[0].success === 'function') {
						ajaxArgs[0].success(data, req.xhr.statusText, req.xhr);
					}
				},
				complete: function(req) {
					// jQuery complete callback (called AFTER success / error)
					if (typeof ajaxArgs[0].complete === 'function') {
						ajaxArgs[0].complete(req.xhr, req.xhr.statusText);
					}
				},
				error: function(err, req) {
					// jQuery error callback
					if (typeof ajaxArgs[0].error === 'function') {
						ajaxArgs[0].error(req.xhr, req.xhr.statusText, err);
					}
				},
				args : ajaxArgs,
				xhr: xhr
			};

			// Cancel AJAX
			xhr.abort();

			// Headers
			if (typeof ajaxArgs[0].headers !== 'undefined') {
				opts.headers = ajaxArgs[0].headers;
			}

			// Send
			sendRequest('ajax', requestMethod, ajaxArgs[0].url, opts);
		};

		// Execute as if we were jquery ajax, although we are cancelling this anyway
		return originalFunctions['ajax'].apply(this, arguments);
	};

	// Prepare request for transmision over socket
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
			method: method,
			id : reqId, 
			uri : uri, 
			startTime : now(), 
			sendTime : null, 
			receiveTime : null,
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

	// Send message over socket
	var deliver = function(record) {
		reqs[record.id].sendTime = now();
		reqs[record.id].xhr.readyState = 1; // Started
		if (options.debug) {
			console.log('sending', record);
		}
		var reqStr = JSON.stringify({
			id: record.id,
			uri : record.uri,
			method: record.method,
			headers: record.headers
		});
		exampleSocket.send(reqStr);
	};

	// Current timer
	var now = function() { 
		try {
			return window.performance.now();
		} catch (e) {
			return new Date().getTime();
		}
	};
};