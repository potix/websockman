var wsclient = (function() {
	var wsc = {};
	wsc.start = function(name) {
		var options = {};
		var protocol = websockman.addProtocol(name,
		function onopen(wsmProtoSockObject, event) {
			console.log("proto open");
			console.log(event);
			console.log("1");
			wsmProtoSockObject.unicast("test");
			console.log("2");
			wsmProtoSockObject.unicast({});
			console.log("3");
			wsmProtoSockObject.unicast({'a':'b'});
			console.log("4");
			wsmProtoSockObject.setBinaryType("arraybuffer");
			var ab = new ArrayBuffer(10);
			var bytes = new Uint8Array(ab);
			for (var i = 0; i < bytes.length; i++) {
				bytes[i] = 0x41;
			}
			console.log("5");
			wsmProtoSockObject.unicast(ab);
			console.log("6");
			wsmProtoSockObject.multicast([wsmProtoSockObject], ab);
			console.log("7");
			wsmProtoSockObject.broadcast(ab);
			console.log("8");
		},
		function onmessage(wsmProtoSockObject, data, event) {
			console.log("proto message");
			console.log(data);
			console.log(event);
		},
		function onerror(wsmProtoSockObject, event) {
			console.log("proto error");
			console.log(event);
		},
		function onclose(wsmProtoSockObject, event) {
			console.log("proto close");
			console.log(event);
		});
		if (protocol == null) {
			console.log("failed add protocol");
		}
		var socket = websockman.connect("ws://" + location.hostname + ":8080/websocket", ["test"],
		function onopen(wsmSockObject, event) {
			console.log("open");
			console.log(event);
			wsmSockObject.unicast("test");
			wsmSockObject.unicast({});
			wsmSockObject.unicast({'a':'b'});
			wsmSockObject.setBinaryType("arraybuffer");
			var ab = new ArrayBuffer(10);
			var bytes = new Uint8Array(ab);
			for (var i = 0; i < bytes.length; i++) {
				bytes[i] = 0x41;
			}
			wsmSockObject.unicast(ab);
			wsmSockObject.multicast([wsmSockObject], ab);
			wsmSockObject.broadcast(ab);
		},
		function onmessage(wsmSockObject, data, event) {
			console.log("message");
			console.log(data);
			console.log(event);
		},
		function onerror(wsmSockObject, event) {
			console.log("error");
			console.log(event);
		},
		function onclose(wsmSockObject, event) {
			console.log("close");
			console.log(event);
		}, {});
		if (socket == null) {
			console.log("failed in connect");
		}
		setTimeout(function() {
			socket.close(1000, "");
		}, 8000);
	}
	wsc.start2 = function(name) {
		var options = {};
		var protocol = websockman.addProtocol(name,
		function onopen(wsmProtoSockObject, event) {
			console.log("proto open");
			console.log(event);
			wsmProtoSockObject.unicast("test");
		},
		function onmessage(wsmProtoSockObject, data, event) {
			console.log("proto message");
			console.log(data);
			console.log(event);
		},
		function onerror(wsmProtoSockObject, event) {
			console.log("proto error");
			console.log(event);
		},
		function onclose(wsmProtoSockObject, event) {
			console.log("proto close");
			console.log(event);
		});
		if (protocol == null) {
			console.log("failed add protocol");
		}
		var socket = websockman.connect("ws://" + location.hostname + ":8080/websocket", ["test"],
		function onopen(wsmSockObject, event) {
			console.log("open");
			console.log(event);
			wsmSockObject.unicast("test");
		},
		function onmessage(wsmSockObject, data, event) {
			console.log("message");
			console.log(data);
			console.log(event);
		},
		function onerror(wsmSockObject, event) {
			console.log("error");
			console.log(event);
		},
		function onclose(wsmSockObject, event) {
			console.log("close");
			console.log(event);
		}, {"heartbeatIntervalSec":1, "heartbeatTimeoutSec":5, "onHeartbeatTimeout": function(wsmSockObject) {
			wsmSockObject.close();
		}});
		if (socket == null) {
			console.log("failed in connect");
		}
	}
	return wsc;
})();

wsclient.start("hoge");
wsclient.start("fuga");
wsclient.start2("aaaa");
