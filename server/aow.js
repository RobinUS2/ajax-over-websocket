/**
* Ajax over websocket for jQuery
* @author Robin Verlangen
* @url https://github.com/RobinUS2/ajax-over-websocket
**/
jQuery.ajaxOverWebsocket = function(userOptions) {
	var options = {
		socket : 'ws://your-host/echo', // URI to websocket server
		openTimeout : 1000, // Millisecond timeout to connect to the socket
		queueOnConnect: false, // Set into queue for the websocket channel, false will execute fallback until socket is available
		debug: false, // Debug logging
		enabled: true, // Enable proxy features
		lazyConnect: true, // Connect on the first request
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
	var sock = null;
	var openSocket = function() {
		if (socketConnecting) {
			return;
		}
		if (options.debug) {
			console.log('opening aow socket');
		}
		socketConnecting = true;
		sock = new WebSocket(options.socket);

		// Receive messages on the socket
		sock.onmessage = function (event) {
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

			// Fix XHR
			req.xhr.state = 2;
			req.xhr.readyState = 4;
			req.xhr.statusCode(aowResp.status);
			//req.xhr.status = aowResp.status; // @todo based on response status
			req.xhr.statusText = aowResp.status <= 399 ? 'success' : 'error'; // @todo based on response status
			req.xhr.responseText = rawData;

			// Set headers in XHR object
			req.xhr.responseHeaders = {};
			req.xhr.responseHeadersString = '';
			for (var k in aowResp.headers) {
				var v = aowResp.headers[k][0];
				req.xhr.responseHeaders[k] = v;
				req.xhr.responseHeadersString += k + ': ' + v+ '\n';
			};
			req.xhr.getResponseHeader = function(k) {
				return typeof this.responseHeaders[k] === 'undefined' ? null : this.responseHeaders[k];
			};
			req.xhr.getAllResponseHeaders = function() {
				return this.responseHeadersString;
			};

			// Speculative data filters (mimic jQuery behavior, although this is kind of stupid)
			if (typeof req.postDataFilters === 'undefined' || req.postDataFilters === null || req.postDataFilters.length === 0) {
				// Auto JSON
				if (req.xhr.getResponseHeader('Content-Type').toLowerCase().indexOf('json') !== -1) {
					req.postDataFilters = [];
					req.postDataFilters.push({ method: jQuery.parseJSON });
				}
			}

			// Run data filters
			if (typeof req.postDataFilters !== 'undefined' && req.postDataFilters !== null && req.postDataFilters.length !== 0) {
				for (var k in req.postDataFilters) {
					// @todo has own prop
					var postDataFilter = req.postDataFilters[k];
					data = postDataFilter.method.apply(this, [data]);
				}
			}

			// Callbacks
			if (req.xhr.statusText === 'success' && typeof req.success === 'function') {
				// Success
				reqs[reqId].success(data, req);
			} else if (req.xhr.statusText !== 'success' && typeof req.error === 'function') {
				// Error
				reqs[reqId].error(req.xhr.statusText, req);
			}

			// Complete
			if (typeof req.complete === 'function') {
				reqs[reqId].complete(req);
			}
		};

		// Catch socket errors
		sock.onerror = function (event) {
			console.error('Websocket error, disabling aow');
			options.enabled = false;
		};

		// Catch socket close
		sock.onclose = function (event) {
			console.error('Websocket closed, disabling aow');
			options.enabled = false;
		};

		// Listen for open event
		sock.onopen = function (event) {
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
	};
	if (!options.lazyConnect) {
		openSocket();
	}

	// Connection timeout
	setTimeout(function() {
		if (!socketOpen) {
			// Failed connection
			console.error('Failed to connect to websocket within openTimeout (' + options.openTimeout + '), disabling aow');
			options.enabled = false;

			// Replay queue
			$(queue).each(function(i, record) {
				record.executeFallback();
			});
		}
	}, options.openTimeout);

	// Queue for replaying
	var queue = [];

	// Did we connect?
	var socketOpen = false;

	// Are we connecting?
	var socketConnecting = false;

	// Request ID
	var reqId = 0;

	// Requests (pending AND results)
	var reqs = [];

	// Keep original functions
	var originalFunctions = {
		'ajax':     jQuery.ajax
	};
	if (options.debug) {
		console.log('original functions', originalFunctions);
	}

	// Empty object
	var objEmpty = function(obj) {

	    // null and undefined are "empty"
	    if (obj == null) return true;

	    // Assume if it has a length property with a non-zero value
	    // that that property is correct.
	    if (obj.length > 0)    return false;
	    if (obj.length === 0)  return true;

	    // Otherwise, does it have any properties of its own?
	    // Note that this doesn't handle
	    // toString and valueOf enumeration bugs in IE < 9
	    for (var key in obj) {
	        if (hasOwnProperty.call(obj, key)) return false;
	    }

	    return true;
	};

	// Override jQuery ajax
	jQuery.ajax = function() {
		// Capture arguments
		var ajaxArgs = arguments;

		// Request method
		var requestMethod = ajaxArgs[0].type ? ajaxArgs[0].type.toUpperCase() : 'GET';

		// Lazy open
		if (!socketOpen && !socketConnecting && options.lazyConnect) {
			if (options.debug) {
				console.log('opening aow socket from lazy load');
			}
			openSocket();
		}

		// Data objects
		var url = ajaxArgs[0].url;
		if (requestMethod === 'GET' && !objEmpty(ajaxArgs[0].data)) {
			if (url.indexOf('?') === -1) {
				url += '?' + jQuery.param(ajaxArgs[0].data);
			} else {
				url += '&' + jQuery.param(ajaxArgs[0].data);
			}
			ajaxArgs[0].data = {};
		}
		// @todo Support data for POST/PUT/DELETE requests

		// Enabled and supported?
		if (!options.enabled || !socketOpen || options.methods.indexOf(requestMethod) === -1 || !objEmpty(ajaxArgs[0].data)) {
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
			console.log(xhr);

			// Dispatch our way
			var opts = {
				success: function(data, req) {
					// jQuery success callback
					if (typeof ajaxArgs[0].success === 'function') {
						ajaxArgs[0].success(data, req.xhr.statusText, req.xhr);
					}

					// jQuery .done() callback
					if (typeof xhr.done === 'function') {
						xhr.done(data, req.xhr.statusText, req.xhr);
					}
				},
				complete: function(req) {
					// jQuery complete callback (called AFTER success / error)
					if (typeof ajaxArgs[0].complete === 'function') {
						ajaxArgs[0].complete(req.xhr, req.xhr.statusText);
					}

					// @todo jQuery .always() callback (problem is that this has different order of params depending on success state)
				},
				error: function(err, req) {
					// jQuery error callback
					if (typeof ajaxArgs[0].error === 'function') {
						ajaxArgs[0].error(req.xhr, req.xhr.statusText, err);
					}

					// jQuery .fail() callback
					if (typeof xhr.fail === 'function') {
						xhr.fail(req.xhr, req.xhr.statusText, err);
					}
				},
				args : ajaxArgs,
				xhr: xhr,
				postDataFilters: []
			};

			// Cancel AJAX
			xhr.abort();

			// Headers
			if (typeof ajaxArgs[0].headers !== 'undefined') {
				opts.headers = ajaxArgs[0].headers;
			}

			// Post data filters
			if (typeof ajaxArgs[0].dataFilter === 'function') {
				opts.postDataFilters.push({ method : ajaxArgs[0].dataFilter });
			}

			// Data type
			if (typeof ajaxArgs[0].dataType !== 'undefined') {
				switch (ajaxArgs[0].dataType) {
					case 'json':
						opts.postDataFilters.push({ method : jQuery.parseJSON });
					break;
					case 'script':
						opts.postDataFilters.push({ method : window.eval });
					break;
					case 'xml':
						opts.postDataFilters.push({ method : jQuery.parseXML });
					break;
				}
			}

			// Send
			sendRequest('ajax', requestMethod, url, opts);
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
		sock.send(reqStr);
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