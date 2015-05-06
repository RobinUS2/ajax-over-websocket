/**
* Ajax over websocket for jQuery
* @author Robin Verlangen
* @url https://github.com/RobinUS2/ajax-over-websocket
**/
console.log('aow init');

var exampleSocket = new WebSocket("ws://localhost/echo");

exampleSocket.onmessage = function (event) {
  console.log(event.data);
};

var queue = [];
var socketOpen = false;

exampleSocket.onopen = function (event) {
	socketOpen = true;
	console.log('connection opened');
	$(queue).each(function(i, record) {
		deliver(record);
	});
	console.log('flushed queue');
}

jQuery.get = function(param){
	var record = { param : param };
	if (!socketOpen) {
		console.log('request queued for connecting socket')
		queue.push(record);
	} else {
		deliver(record);
	}
};

var deliver = function(record) {
	exampleSocket.send(record.param);
};