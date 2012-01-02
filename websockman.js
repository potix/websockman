//* カプセル化されたwebsocket上のデータ
//
// - heartbeatメッセージ
//   {"type":"heartbeat"}
//
// - テキストデータ
//   {"type":"textData", "payload":<data (object, string …etc)>}
//   - プロトコルを利用する場合のテキストデータフレーム
//     {"type":"textData", "protoName":<protocol name>, "payload":<data (object, string …etc)>}
//
// - バイナリデータ(chunk転送のイメージ)
//   (複数フレームで1つのデータを指す)
//   {"type":"binaryData", "length":<binary data length (string)>}
//   <binary data>
//   - プロトコルを利用する場合のバイナリデータフレーム
//     (複数フレームで1つのデータを指す)
//     {"type":"binaryData", "protoName":<protocol name>, "length":<binary data length (string)>}
//     <binary data>

var websockman = (function() {
	var wsmObject = {
		"socketId"  : 0,
		"wsmSockObjects" : {},
		"wsmProtoSockObjects" : {},
		"protocols" : {}
	};

	// ###################################
	// private functions
	// ###################################

	var setHeartbeat = function(wsmSockObject) {
		// すでに登録されている状態で再度heartbeatを登録した場合は
		// 前のタイマーをクリアして再度登録する
		if (wsmSockObject.heartbeatTimer != null) {
			clearInterval(wsmSockObject.heartbeatTimer);
		}
		var heartbeatSend = function() {
			wsmSockObject.socket.send('{"type":"heartbeat"}', false);
		};
		wsmSockObject.heartbeatTimer = setInterval(
		    heartbeatSend, wsmSockObject.options.heartbeatIntervalSec * 1000);
	};
	var clearHeartbeat = function(wsmSockObject) {
		if (wsmSockObject.heartbeatTimer != null) {
			clearInterval(wsmSockObject.heartbeatTimer);
		}
		wsmSockObject.heartbeatTimer = null;
	};
	var setHeartbeatTimeout = function(wsmSockObject) {
		// すでに登録されている状態で再度heartbeatTimeoutを登録した場合は
		// 前のタイマーをクリアして再度登録する
		if (wsmSockObject.heartbeatTimeoutTimer != null) {
			clearTimeout(wsmSockObject.heartbeatTimeoutTimer);
		}
		var heartbeatTimeout =  function() {
			if (wsmSockObject.options &&
			    typeof(wsmSockObject.options.onHeartbeatTimeout) == "function") {
				wsmSockObject.options.onHeartbeatTimeout(wsmSockObject);
			} else {
				wsmSockObject.close();
			}
		};
		wsmSockObject.heartbeatTimeoutTimer = setInterval(
		    heartbeatTimeout, wsmSockObject.options.heartbeatTimeoutSec * 1000);
	};
	var clearHeartbeatTimeout = function(wsmSockObject) {
		if (wsmSockObject.heartbeatTimeoutTimer != null) {
			clearTimeout(wsmSockObject.heartbeatTimeoutTimer);
		}
		wsmSockObject.heartbeatTimeoutTimer = null;
	};
	var sendData = function(wsmSockObject, data, byteArray, protocolName) {
		if (wsmSockObject.getReadyState() == 0) {
			console.log("Warning: failed send data, this socket is not yet open");
			return;
		}
		var newData = null;
		if (typeof(data) == "object") {
			if (data instanceof Array && byteArray) {
				// byteArrayは1バイトのデータの配列と仮定する
				// 配列をArrayBufferに変換 
				// そうでない配列が渡された場合は動作を保証しない 
				var ab = new ArrayBuffer(data.length);
				var a = new Uint8Array(ab);
				for(var i = 0; i < data.length; i++) {
					a[i] = data[i];
				}
				data = ab;
				newData = {"type":"binaryData", "length":data.byteLength.toString()};
			} else if (data instanceof Blob) {
				newData = {"type":"binaryData", "length":data.length.toString()};
			} else if (data instanceof ArrayBuffer) {
				newData = {"type":"binaryData", "length":data.byteLength.toString()};
			}
			if (newData != null) {
				if (protocolName) {
					newData.protoName = protocolName;
				}
				var newDataStr = JSON.stringify(newData);
				wsmSockObject.socket.send(newDataStr);
				wsmSockObject.socket.send(data);
				return;
			}
		}
		// その他のはよろず、json文字列に変換する
		newData = {"type":"textData", "payload":data};
		if (protocolName) {
			newData.protoName = protocolName;
		}
		var newDataStr = JSON.stringify(newData);
		wsmSockObject.socket.send(newDataStr);
	};
	var getOptParam = function(options, target) {
		var val = undefined;
		if (options && options[target]) {
			val = options[target];
		}
		return val;
	};
	var wsmProtoSockCreate = function(wsmSockObject, protocolName) {
		if (wsmSockObject.wsmObject.wsmProtoSockObjects[wsmSockObject.wsmSockObjectId] &&
		    wsmSockObject.wsmObject.wsmProtoSockObjects[wsmSockObject.wsmSockObjectId][protocolName]) {
			return wsmSockObject.wsmObject.wsmProtoSockObjects[wsmSockObject.wsmSockObjectId][protocolName];
		}
		if (!wsmSockObject.wsmObject.wsmProtoSockObjects[wsmSockObject.wsmSockObjectId]) {
			wsmSockObject.wsmObject.wsmProtoSockObjects[wsmSockObject.wsmSockObjectId] = {};
		}
		// オブジェクトの複製
		var wsmProtoSockObject = {};
		for (var key in wsmSockObject) {
			wsmProtoSockObject[key] = wsmSockObject[key];
		}
		wsmProtoSockObject.protocolName = protocolName;
		wsmSockObject.wsmObject.wsmProtoSockObjects[wsmSockObject.wsmSockObjectId][protocolName] = wsmProtoSockObject;
		return wsmProtoSockObject;
	}

	// ###########################################
	// public functions
	// ###########################################

	// モジュールを追加する
	// 失敗した場合はnullを返す
	// 成功した場合はモジュールオブジェクトを返す
	// プロトコル名は前後に空白文字を含んではいけない
	// 同一プロトコル名で多重に登録してはいけない
	// protocolName: protocol name
	// onopen: open callback function 
	//     func(wsmProtoSockObject, event)
	// onmessage: onmessge callback
	//     func(wsmProtoSockObject, data, event)
	// onerror: error callback
	//     func(wsmProtoSockObject, event)
	// onclose: close callback
	//     func(wsmProtoSockObject, event)
	// onmessage: onmessge callback
	wsmObject.addProtocol = function(protocolName, onopen, onmessage, onerror, onclose) {
		if (typeof(protocolName) != "string" || protocolName == "" ||
		    protocolName != protocolName.replace(/^\s*|\s*$/g, "") ||
		    this.protocols[protocolName]) {
			return null;
		} 
		var wsmProtoObject = { "wsmObject" : this };
		wsmProtoObject.onopen = onopen;
		wsmProtoObject.onmessage = onmessage;
		wsmProtoObject.onerror = onerror;
		wsmProtoObject.onclose = onclose;
		this.protocols[protocolName] = wsmProtoObject;
		return wsmProtoObject;
	};
	// websocketで接続する
	// 失敗するとnullを返す
	// 成功するとソケットオブジェクトを返す
	// url: websocket server url
	// protocols: subprotocols 追加するプロトコル名のリストかカンマ区切りの文字列
	//     addProtocolで追加されているものは自動的に反映される。
	// onopen: open callback function 
	//     func(wsmSockObject, event)
	// onmessage: onmessge callback
	//     func(wsmSockObject, data, event)
	// onerror: error callback
	//     func(wsmSockObject, event)
	// onclose: close callback
	//     func(wsmSockObject, event)
	// options: options parameters
	//     heartbeatIntervalSec: heartbet interval	
	//     heartbeatTimeoutSec: heartbet timeout	
	//     onHeartbeatTimeout: timeout callback
	wsmObject.connect = function(url, protocols, onopen, onmessage, onerror, onclose, options) {
		var protos = [];
		if (typeof(protocols) == "string") {
			protocols = protocols.split(",");
		}
		for (var i = 0; protocols && i < protocols.length; i++) {
			protocols[i] = protocols[i].replace(/^\s*|\s*$/g, "");
			if (typeof(protocols) == "string" && protocols[i] != "") {
				protos.push(protocols);
			}
		}
		for (var protocolName in this.protocols) {
			protos.push(protocolName)
		}
		var newSock = new WebSocket(url, protos);
		if (!newSock) {
			return null;
		}
		var d = new Date();
		this.socketId++;
		var wsmSockObjectId = this.socketId + '_' + d.getTime();
		var wsmSockObject = {
			"url"                   : url,
			"protocols"             : protocols,
			"wsmSockObjectId"       : wsmSockObjectId,
			"socket"                : newSock,
			"wsmObject"             : this,
			"heartbeatTimer"        : null,
			"heartbeatTimeoutTimer" : null,
			"onopen"                : onopen,
			"onmessage"             : onmessage,
			"onerror"               : onerror,
			"onclose"               : onclose,
			"options"               : options,
			"binaryReady"           : null,
			"protocolName"          : null
		};

		// ############################### 
		// private functions
		// ############################### 
		var wsmSockObjectOnOpen = function(wsmSockObject) {
			return function(event) {
				for (var protocolName in wsmSockObject.wsmObject.protocols) {
					if (typeof(wsmSockObject.wsmObject.protocols[protocolName].onopen) == "function") {
						var wsmProtoSockObject = wsmProtoSockCreate(wsmSockObject, protocolName);
						wsmSockObject.wsmObject.protocols[protocolName].onopen(wsmProtoSockObject, event);
					}
				}
				if (typeof(wsmSockObject.onopen) == "function") {
					wsmSockObject.onopen(wsmSockObject, event);
				}
			}
		};
		var wsmSockObjectOnMessage = function(wsmSockObject) {
			return function(event) {
				if (typeof(event.data) == "string") {
					var dataObject = JSON.parse(event.data);
					if (!dataObject.type) {
						return;
					}
					if (dataObject.type == "heartbeat") {
						if (wsmSockObject.options &&
						    wsmSockObject.options.heartbeatTimeoutSec &&
						    typeof(wsmSockObject.options.heartbeatTimeoutSec) == "number") {
							setHeartbeatTimeout(wsmSockObject);
						}
					} else if (dataObject.type == "textData" && dataObject.payload) {
						if (dataObject.protoName &&
						    wsmSockObject.wsmObject.protocols[dataObject.protoName] &&
						    typeof(wsmSockObject.wsmObject.protocols[dataObject.protoName].onmessage) == "function") {
							var wsmProtoSockObject = wsmProtoSockCreate(wsmSockObject, dataObject.protoName);
							wsmSockObject.wsmObject.protocols[dataObject.protoName].onmessage(wsmProtoSockObject, dataObject.payload, event);
						} else {
							if (typeof(wsmSockObject.onmessage) == "function") {
								wsmSockObject.onmessage(wsmSockObject, dataObject.payload, event);
							}
						}
					} else if (dataObject.type == "binaryData" && dataObject.length) {
						wsmSockObject.binaryReady = dataObject;
					}
					return;
				} else if (typeof(event.data) == "object") {
					if (wsmSockObject.binaryReady == null) {
						return;
					}
					if (event.data instanceof Blob) {
						wsmSockObject.binaryReady.length -= event.data.length;
					} else if (event.data instanceof ArrayBuffer) {
						wsmSockObject.binaryReady.length -= event.data.byteLength;
					}
					if (wsmSockObject.binaryReady.protoName &&
					    wsmSockObject.wsmObject.protocols[wsmSockObject.binaryReady.protoName] &&
					    typeof(wsmSockObject.wsmObject.protocols[wsmSockObject.binaryReady.protoName].onmessage) == "function") {
						var wsmProtoSockObject = wsmProtoSockCreate(wsmSockObject, wsmSockObject.binaryReady.protoName);
						wsmSockObject.wsmObject.protocols[wsmSockObject.binaryReady.protoName].onmessage(wsmProtoSockObject, event.data, event);
					} else {
						if (typeof(wsmSockObject.onmessage) == "function") {
							wsmSockObject.onmessage(wsmSockObject, event.data, event);
						}
					}
					if (wsmSockObject.binaryReady.length < 0) {
						console.log("Error: invalid data length");
						wsmSockObject.close(1000, "Error: invalid data length");
					}
					if (wsmSockObject.binaryReady.length <= 0) {
						wsmSockObject.binaryReady = null;
					}
				} else {
					// unsupport type
				}
				return;
			}
		};
		wsmSockObjectOnError = function(wsmSockObject) {
			return function(event) {
				for (var protocolName in wsmSockObject.wsmObject.protocols) {
					if (typeof(wsmSockObject.wsmObject.protocols[protocolName].onerror) == "function") {
						var wsmProtoSockObject = wsmProtoSockCreate(wsmSockObject, protocolName);
						wsmSockObject.wsmObject.protocols[protocolName].onerror(wsmProtoSockObject, event);
					}
				}
				if (typeof(wsmSockObject.onerror) == "function") {
					wsmSockObject.onerror(wsmSockObject, event);
				}
			}
		};
		wsmSockObjectOnClose = function(wsmSockObject) {
			return function(event) {
				for (var protocolName in wsmSockObject.wsmObject.protocols) {
					if (typeof(wsmSockObject.wsmObject.protocols[protocolName].onclose) == "function") {
						var wsmProtoSockObject = wsmProtoSockCreate(wsmSockObject, protocolName);
						wsmSockObject.wsmObject.protocols[protocolName].onclose(wsmProtoSockObject, event);
					}
				}
				if (typeof(wsmSockObject.onclose) == "function") {
					wsmSockObject.onclose(wsmSockObject, event);
				}
				delete wsmSockObject.wsmObject.wsmProtoSockObjects[wsmSockObject.wsmSockObjectId];
				clearHeartbeat(wsmSockObject);
				clearHeartbeatTimeout(wsmSockObject);
				delete wsmSockObject.wsmObject.wsmSockObjects[wsmSockObject.wsmSockObjectId];
			}
		};


		// ###############################
		// public functions
		// ###############################

		// heartbeatを有効にする
		wsmSockObject.enableHeartbeat = function(intervalSec) {
			if (typeof(intervalSec) != "number") {
				return;
			}
			if (!this.options) {
				this.options = {};
			}
			this.options.heartbeatIntervalSec = intervalSec;
			setHeartbeat(this);
		}
		// heartbeat タイムアウトを有効にする
		wsmSockObject.enableHeartbeatTimeout = function(timeoutSec) {
			if (typeof(timeoutSec) != "number") {
				return;
			}
			if (!(this.options &&
			    this.options.heartbeatIntervalSec &&
			    typeof(this.options.heartbeatIntervalSec) == "number")) {
				return;
			}
			setHeartbeat(this);
			this.options.heartbeatTimeoutSec = timeoutSec;
			setHeartbeatTimeout(this);
		}
		// heartbeat heartbeatを無効にする
		wsmSockObject.disableHeartbeat = function() {
			cleatHeartbeat(this);
			cleatHeartbeatTimeout(this);
		}
		// heartbeat heartbeat タイムアウトを無効にする
		wsmSockObject.disableHeartbeatTimeout = function() {
			cleatHeartbeatTimeout(this);
		}
		// ブロードキャストメッセージを送る
		// data: 送信するデータ
		// options: オプション
		//    byteArray: データがbyteArrayかどうか true|false
		//    excludeSelfSocket: 自分のソケットをブロードキャストに含めるかどうか
		wsmSockObject.broadcast = function(data, options) {
			var byteArray = getOptParam(options, "byteArray");
			var excludeSelfSocket = getOptParam(options, "excludeSelfSocket");
			for (var wsmSockObjectId in this.wsmObject.wsmSockObjects) {
				if (excludeSelfSocket &&
				    this.wsmSockObjectId == wsmSockObjectId) {
					continue;
				}
				sendData(this.wsmObject.wsmSockObjects[wsmSockObjectId], data, byteArray, this.protocolName);
			}
		};
		// マルチキャストメッセージを送る
		// wsmSockObjects: 送信するソケットのリスト
		// data: データ
		// options: オプション
		//     byteArray: データがbyteArrayかどうか true|false
		wsmSockObject.multicast = function(wsmSockObjects, data, options) {
			var byteArray = getOptParam(options, "byteArray");
			for (var i = 0; i < wsmSockObjects.length; i++) {
				sendData(wsmSockObjects[i], data, byteArray, this.protocolName);
			}
		};
		// ソケットに対しユニキャストメッセージを送る
		// data: データ
		// options: オプション
		//     byteArray: データがbyteArrayかどうか true|false
		wsmSockObject.unicast = function(data, options) {
			var byteArray = getOptParam(options, "byteArray");
			sendData(this, data, byteArray, this.protocolName);
		};
		// ソケットを閉じる
		wsmSockObject.close = function(code, reason) {
			if (!code || typeof(code) != "number") {
				code = 1000;
			}
			if (!reason || typeof(reson) != "string") {
				reson = "";
			}
			clearHeartbeat(this);
			clearHeartbeatTimeout(this);
			this.socket.close(code, reason);
		};
		// 現在のbinaryTypeを取得する
		wsmSockObject.getBinaryType = function() {
			return this.socket.binaryType;
		};
		// 現在のbinaryTypeを変更する
		wsmSockObject.setBinaryType = function(binaryType) {
			this.socket.binaryType = binaryType;
		};
		// ソケットのredyStateを取得する
		wsmSockObject.getReadyState = function() {
			return this.socket.readyState;
		};
		// ソケットのbuffeAmountを取得する
		wsmSockObject.getBufferedAmount = function() {
			return this.socket.bufferedAmount;
		};
		// ソケットのextensionsを取得する
		wsmSockObject.getExtensions = function() {
			return this.socket.extensions;
		};
		// ソケットのプロトコルを取得する
		wsmSockObject.getProtocol = function() {
			return this.socket.protocol;
		};
		newSock.onopen = wsmSockObjectOnOpen(wsmSockObject);
		newSock.onmessage = wsmSockObjectOnMessage(wsmSockObject);
		newSock.onerror = wsmSockObjectOnError(wsmSockObject);
		newSock.onclose = wsmSockObjectOnClose(wsmSockObject);
		this.wsmSockObjects[wsmSockObjectId] = wsmSockObject;
		if (options) {
			if (options.heartbeatIntervalSec &&
			    typeof(options.heartbeatIntervalSec) == "number") {
				setHeartbeat(wsmSockObject, options.heartbeatIntervalSec);
			}
			if (options.heartbeatIntervalSec &&
			    typeof(options.heartbeatIntervalSec) == "number" &&
			    options.heartbeatTimeoutSec &&
			    typeof(options.heartbeatTimeoutSec) == "number") {
				setHeartbeatTimeout(wsmSockObject, options.heartbeatTimeoutSec);
			}
		}
		return wsmSockObject;
	};
	return wsmObject;
})();
