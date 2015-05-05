/**
* Ajax over websocket for jQuery
* @author Robin Verlangen
* @url https://github.com/RobinUS2/ajax-over-websocket
**/
console.log('aow init');

var exampleSocket = new WebSocket("ws://localhost/echo");

exampleSocket.onmessage = function (event) {
  console.log(event.data);
}

jQuery.get = function(param){
	exampleSocket.onopen = function (event) {
		console.log('connection opened');
		exampleSocket.send(param);
	}
}