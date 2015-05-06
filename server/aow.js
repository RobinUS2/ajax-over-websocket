/**
* Ajax over websocket for jQuery
* @author Robin Verlangen
* @url https://github.com/RobinUS2/ajax-over-websocket
**/
var enabled = true;
if (enabled) {
	console.log('aow init');

	var exampleSocket = new WebSocket("ws://localhost/echo");

	exampleSocket.onmessage = function (event) {
		var split = event.data.split('\t');
		var reqId = split[0];
		var data = split[1];
		reqs[reqId].receiveTime = now();
		var latency = reqs[reqId].receiveTime - reqs[reqId].startTime;
		console.log(reqs[reqId]);
		console.log(data);
		console.log('latency ' + latency);

		if (typeof reqs[reqId].callback === 'function') {
			reqs[reqId].callback(data);
		}
	};

	var queue = [];
	var socketOpen = false;
	var reqId = 0;
	var reqs = [];

	exampleSocket.onopen = function (event) {
		socketOpen = true;
		console.log('connection opened');
		$(queue).each(function(i, record) {
			deliver(record);
		});
		console.log('flushed queue');
	}

	jQuery.get = function(param, callback) {
		// Get request ID
		reqId++;

		// Assemble record
		var record = { 
			id : reqId, 
			param : param, 
			startTime : now(), 
			sendTime : null, 
			receiveTime : null,
			callback: null
		};

		// Callback?
		if (typeof callback === 'function') {
			record.callback = callback;
		}

		// Track request
		reqs[reqId] = record;

		// Queue
		if (!socketOpen) {
			console.log('request queued for connecting socket')
			queue.push(record);
		} else {
			deliver(record);
		}
	};

	var deliver = function(record) {
		reqs[record.id].sendTime = now();
		console.log('sending', record);
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