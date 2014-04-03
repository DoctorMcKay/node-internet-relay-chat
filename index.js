var net = require('net');
var tls = require('tls');

module.exports = InternetRelayChat;

require('util').inherits(InternetRelayChat, require('events').EventEmitter);

function InternetRelayChat(options) {
	var defaultOptions = {
		"username": "nodejs",
		"realname": "node-internet-relay-chat IRC client",
		"nick": "nodejs",
		"server": "",
		"port": 6667,
		"password": false,
		"autoReconnect": 15000,
		"ssl": false,
		"localAddress": null,
		"floodDelay": 1000,
		"debug": false
	};
	
	for(var option in options) {
		defaultOptions[option] = options[option];
	}
	
	defaultOptions.nick = defaultOptions.nick.replace(/ /g, '');
	
	this.options = defaultOptions;
	this.registered = false;
	
	var self = this;
	this.on('irc-ping', function(line) {
		if(self.listeners('irc-ping').length > 1) {
			return;
		}
		
		this.sendLine({"command": "PONG", "args": line.args, "tail": line.tail});
	});
	
	this.on('irc-privmsg', function(line) {
		if(line.args[0] == self.myNick && line.tail.charAt(0) == '\u0001' && line.tail.charAt(line.tail.length - 1) == '\u0001') {
			var ctcp = parseLine(line.tail.substring(1, line.tail.length - 1));
			ctcp.sender = parseHostmask(line.prefix);
			self.emit('ctcp-' + ctcp.command.toLowerCase(), ctcp);
		} else if(line.args[0] == self.myNick) {
			self.emit('pm', parseHostmask(line.prefix), line.tail);
		} else {
			self.emit('message', parseHostmask(line.prefix), line.args[0], line.tail);
		}
	});
	
	this.on('irc-notice', function(line) {
		if(line.args[0] == self.myNick) {
			self.emit('notice', parseHostmask(line.prefix), line.tail);
		}
	});
	
	this.on('irc-invite', function(line) {
		this.emit('invite', parseHostmask(line.prefix), line.tail);
	});
	
	this.on('numeric4', function(line) {
		if(!self.registered && (line.command == '432' || line.command == '433')) {
			self.emit('badNickDuringRegistration', line.command);
		} else if(line.command == '432' || line.command == '433') {
			self.myNick = self._oldNick;
		}
	});
	
	this.on('irc-004', function(line) {
		if(self.registered) {
			return;
		}
		
		self.registered = true;
		self.emit('registered');
	});
	
	this.on('irc-376', function(line) {
		if(self.registered) {
			return;
		}
		
		self.registered = true;
		self.emit('registered');
	});
	
	this.on('badNickDuringRegistration', function(code) {
		if(self.listeners('badNickDuringRegistration').length > 1) {
			return;
		}
		
		if(code == 432) {
			self.nick('nodejs');
		} else {
			self.nick(self.myNick + '_');
		}
	});
	
	this.on('ctcp-ping', function(line) {
		if(self.listeners('ctcp-ping').length > 1) {
			return;
		}
		
		self.ctcpReply(line.sender.nick, "PING" + ((line.args && line.args.length > 0) ? ' ' + line.args.join(' ') : ''));
	});
	
	this.on('ctcp-time', function(line) {
		if(self.listeners('ctcp-time').length > 1) {
			return;
		}
		
		self.ctcpReply(line.sender.nick, "TIME " + new Date().toString());
	});
}

InternetRelayChat.prototype.connect = function() {
	var self = this;
	if(this.options.ssl) {
		this.secure = true;
		this.socket = tls.connect({"socket": net.connect({"host": this.options.server, "port": this.options.port, "localAddress": this.options.localAddress}), "rejectUnauthorized": false}, function() {
			self._handleConnect();
		});
	} else {
		this.secure = false;
		this.socket = net.connect({"host": this.options.server, "port": this.options.port, "localAddress": this.options.localAddress}, function() {
			self._handleConnect();
		});
	}
};

InternetRelayChat.prototype.quit = function(message) {
	this.registered = false;
	this.options.autoReconnect = 0;
	this.sendLine({"command": "QUIT", "tail": message});
	this.socket.destroy();
};

InternetRelayChat.prototype._handleConnect = function() {
	var self = this;
	this.emit('connect');
	
	if(self.options.debug) {
		console.log('== CONNECTED ==');
	}
	
	this.socket.setEncoding('utf8');
	this.socket.on('data', function(data) {
		if(self._splitPacket) {
			data = self._splitPacket + data;
			self._splitPacket = null;
		} else if(data.charAt(data.length - 1) != "\n") {
			self._splitPacket = data;
			return;
		}
		
		var lines = data.split("\r\n");
		for(var i = 0; i < lines.length; i++) {
			if(lines[i].trim().length != 0) {
				self._processLine(lines[i]);
			}
		}
	});
	
	this.socket.on('close', function(error) {
		self.emit('disconnect', error);
		
		if(self.options.debug) {
			console.log('== DISCONNECTED ==');
		}
		
		if(self.options.autoReconnect > 0) {
			setTimeout(function() {
				self.connect();
			}, self.options.autoReconnect);
			
			if(self.options.debug) {
				console.log('Delaying ' + self.options.autoReconnect + 'ms and reconnecting');
			}
		}
	});
	
	if(this.options.password) {
		this.sendLine({"command": "PASS", "args": [this.options.password]});
	}
	
	// TODO: http://nodejs.org/api/dns.html
	this.nick(this.options.nick);
	this.sendLine({"command": "USER", "args": [this.options.nick, this.socket.address().address, this.socket.address().address], "tail": this.options.realname});
};

InternetRelayChat.prototype.sendLine = function(line) {
	// TODO: Flood control
	var rawLine = makeLine(line, true);
	this.socket.write(rawLine);
	if(this.options.debug) {
		console.log("<< " + rawLine.substring(0, rawLine.length - 2));
	}
};

function makeLine(line, appendNewline) {
	return line.command.toUpperCase() + ((line.args && line.args.length > 0) ? ' ' + line.args.join(' ').trim() : '') + ((line.tail) ? ' :' + line.tail : '') + ((appendNewline) ? "\r\n" : '');
}

InternetRelayChat.prototype._processLine = function(rawLine) {
	if(this.options.debug) {
		console.log(">> " + rawLine);
	}
	
	var line = parseLine(rawLine);
	
	this.emit('rawline', line);
	this.emit('irc-' + line.command.toLowerCase(), line);
	if(line.command.length == 3 && !isNaN(line.command)) {
		this.emit('numeric', line);
		this.emit('numeric' + line.command.charAt(0), line);
	}
};

function parseLine(rawLine) {
	var line = {};
	
	// If the line has a prefix, grab it and strip it out
	if(rawLine.charAt(0) == ':') {
		var pos = rawLine.indexOf(' ');
		line.prefix = rawLine.substring(1, (pos == -1) ? null : pos);
		rawLine = (pos == -1) ? '' : rawLine.substring(rawLine.indexOf(' ', 1) + 1);
	}
	
	// If the line has a tail, grab it and strip it out
	if(rawLine.indexOf(':') != -1) {
		line.tail = rawLine.substring(rawLine.indexOf(':') + 1);
		rawLine = rawLine.substring(0, rawLine.indexOf(':'));
	}
	
	rawLine = rawLine.trim();
	var pos = rawLine.indexOf(' ');
	
	// At this point we should no longer have a prefix or a tail
	// If there is no space left, then the command has no args
	if(pos == -1) {
		line.command = rawLine;
		line.args = [];
	} else {
		line.command = rawLine.substring(0, pos);
		line.args = rawLine.substring(pos).trim().split(' ');
	}
	
	return line;
}

function parseHostmask(hostmask) {
	var user = {"hostmask": hostmask};
	if(hostmask.indexOf('!') == -1 || hostmask.indexOf('@') == -1) {
		user.nick = hostmask;
		user.username = hostmask;
		user.hostname = hostmask;
		return user;
	}
	
	user.nick = hostmask.substring(0, hostmask.indexOf('!'));
	user.username = hostmask.substring(hostmask.indexOf('!') + 1, hostmask.indexOf('@'));
	user.hostname = hostmask.substring(hostmask.indexOf('@') + 1);
	return user;
}

InternetRelayChat.prototype.nick = function(newNick) {
	this._oldNick = this.myNick;
	this.myNick = newNick;
	this.sendLine({"command": "NICK", "args": [newNick]});
};

InternetRelayChat.prototype.ctcp = function(nick, message) {
	this.message(nick, '\u0001' + message + '\u0001');
};

InternetRelayChat.prototype.ctcpReply = function(nick, message) {
	this.notice(nick, '\u0001' + message + '\u0001');
};

InternetRelayChat.prototype.message = function(recipient, message) {
	this.sendLine({"command": "PRIVMSG", "args": [recipient], tail: message});
};

InternetRelayChat.prototype.notice = function(recipient, message) {
	this.sendLine({"command": "NOTICE", "args": [recipient], tail: message});
};

InternetRelayChat.prototype.join = function(channel, key) {
	this.sendLine({"command": "JOIN", "args": [channel, key]});
};

InternetRelayChat.prototype.part = function(channel) {
	this.sendLine({"command": "PART", "args": [channel]});
};

