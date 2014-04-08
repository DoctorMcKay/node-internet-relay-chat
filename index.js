var net = require('net');
var tls = require('tls');
var dns = require('dns');

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
		"secure": false,
		"localAddress": null,
		"vhost": null,
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
		self.emit('invite', parseHostmask(line.prefix), line.tail);
	});
	
	this.on('irc-join', function(line) {
		var joiner = parseHostmask(line.prefix);
		var channel = line.args[0];
		if(!channel) {
			channel = line.tail;
		}
		
		self._addToChannel(joiner.nick, channel);
		self.emit('join', joiner, channel);
	});
	
	this.on('irc-part', function(line) {
		var user = parseHostmask(line.prefix);
		var channel = line.args[0];
		if(!channel) {
			channel = line.tail;
		}
		
		self._removeFromChannel(user.nick, channel);
		self.emit('part', user, channel);
	});
	
	this.on('irc-kick', function(line) {
		var kicker = parseHostmask(line.prefix);
		self._removeFromChannel(line.args[1], line.args[0]);
		self.emit('kick', kicker, line.args[1], line.args[0], line.tail);
	});
	
	this.on('irc-quit', function(line) {
		var quitter = parseHostmask(line.prefix);
		var channels = [];
		for(var channel in self.channels) {
			if(self.channels[channel].nicks.indexOf(quitter.nick) != -1) {
				channels.push(channel);
				self._removeFromChannel(quitter.nick, channel);
			}
		}
		
		self.emit('quit', quitter, channels, line.tail);
	});
	
	this.on('irc-mode', function(line) {
		var changer = parseHostmask(line.prefix);
		if(!line.args[1] && line.tail) {
			line.args[1] = line.tail;
		}
		
		self.emit('mode', changer, line.args[0], line.args[1], line.args.slice(2));
		
		if(line.args.length > 2) {
			var prefixModes = self.support.prefix.match(/\([a-zA-Z]+\)/)[0];
			for(var i = 1; i < prefixModes.length - 1; i++) {
				if(line.args[1].indexOf(prefixModes.charAt(i))) {
					// Prefixes changed!
					self.updateChannelNames(line.args[0]);
					break;
				}
			}
		}
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
	
	this.on('irc-005', function(line) {
		for(var i = 0; i < line.args.length; i++) {
			if(line.args[i] == self.myNick) {
				continue;
			}
			
			var arg = line.args[i].split('=');
			self.support[arg[0].toLowerCase()] = arg[1];
		}
	});
	
	this.on('irc-353', function(line) {
		// NAMES list
		var channel = line.args[line.args.length - 1];
		if(!self.channels[channel].updatingNames) {
			self.channels[channel].updatingNames = true;
			self.channels[channel].nicks = line.tail.split(' ');
		} else {
			self.channels[channel].nicks.concat(line.tail.split(' '));
		}
	});
	
	this.on('irc-366', function(line) {
		// End of /NAMES list
		var channel = line.args[line.args.length - 1];
		self.channels[channel].updatingNames = false;
		self.emit('names', channel);
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
	var sockOptions = {"host": this.options.server, "port": this.options.port, "localAddress": this.options.localAddress};
	if(this.options.secure) {
		this.secure = true;
		this.socket = tls.connect({"socket": net.connect(sockOptions), "rejectUnauthorized": false}, function() {
			self._handleConnect();
		});
	} else {
		this.secure = false;
		this.socket = net.connect(sockOptions, function() {
			self._handleConnect();
		});
	}
	
	this.socket.on('error', function(e) {
		self.emit('error', e);
	});
};

InternetRelayChat.prototype.quit = function(message) {
	this.registered = false;
	this.options.autoReconnect = 0;
	var self = this;
	this.sendLine({"command": "QUIT", "tail": message}, function() {
		self.socket.destroy();
	});
};

InternetRelayChat.prototype._handleConnect = function() {
	var self = this;
	this.emit('connect');
	
	if(self.options.debug) {
		console.log('== CONNECTED ==');
	}
	
	this.channels = {};
	this.support = {};
	this._nextFloodSend = 0;
	
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
	
	this.nick(this.options.nick);
	if(this.options.vhost) {
		this.sendLine({"command": "USER", "args": [this.options.nick, this.options.vhost, this.socket.address().address], "tail": this.options.realname});
	} else {
		dns.reverse(this.socket.address().address, function(err, domains) {
			// Silently ignore errors
			var hostname = domains[0] || self.socket.address().address;
			if(domains.indexOf(self.options.localAddress) != -1) {
				hostname = self.options.localAddress;
			}
			
			self.sendLine({"command": "USER", "args": [self.options.nick, hostname, self.socket.address().address], "tail": self.options.realname});
		});
	}
};

InternetRelayChat.prototype.sendLine = function(line, callback) {
	var delay = this._nextFloodSend - Date.now();
	if(delay < 0) {
		delay = 0;
		this._nextFloodSend = Date.now();
	}
	
	this._nextFloodSend = this._nextFloodSend + this.options.floodDelay;
	
	var self = this;
	setTimeout(function() {
		self.sendRawLine(makeLine(line));
		if(callback) {
			callback();
		}
	}, delay);
};

InternetRelayChat.prototype.sendRawLine = function(line) {
	this.socket.write(line + "\r\n");
	if(this.options.debug) {
		console.log("<< " + line);
	}
};

function makeLine(line) {
	return line.command.toUpperCase() + ((line.args && line.args.length > 0) ? ' ' + line.args.join(' ').trim() : '') + ((line.tail) ? ' :' + line.tail : '');
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

InternetRelayChat.prototype._addToChannel = function(nick, channel) {
	var self = this;
	if(nick == this.myNick) {
		this.channels[channel] = {"nicks": [self.myNick]};
		return;
	}
	
	var index = this._isInChannel(nick, channel);
	if(index != -1) {
		return;
	}
	
	this.channels[channel].nicks.push(nick);
};

InternetRelayChat.prototype._removeFromChannel = function(nick, channel) {
	if(nick == this.myNick) {
		delete this.channels[channel];
		return;
	}
	
	var index = this._isInChannel(nick, channel);
	if(index == -1) {
		return;
	}
	
	this.channels[channel].nicks.splice(index, 1);
};

InternetRelayChat.prototype._nickHasPrefix = function(nick) {
	var prefixes;
	if(!this.support.prefix) {
		prefixes = ['~', '&', '@', '%', '+'];
	} else {
		prefixes = this.support.prefix.substring(this.support.prefix.indexOf(')') + 1).split('');
	}
	
	return prefixes.indexOf(nick.charAt(0)) != -1;
};

InternetRelayChat.prototype._isInChannel = function(nick, channel) {
	if(this._nickHasPrefix(nick)) {
		nick = nick.substring(1);
	}
	
	for(var i = 0; i < this.channels[channel].nicks.length; i++) {
		var buffer = this.channels[channel].nicks[i];
		if(this._nickHasPrefix(buffer)) {
			buffer = buffer.substring(1);
		}
		
		if(nick == buffer) {
			return i;
		}
	}
	
	return -1;
};

InternetRelayChat.prototype.nick = function(newNick, callback) {
	this._oldNick = this.myNick;
	this.myNick = newNick;
	this.sendLine({"command": "NICK", "args": [newNick]}, callback);
};

InternetRelayChat.prototype.ctcp = function(nick, message, callback) {
	this.message(nick, '\u0001' + message + '\u0001', callback);
};

InternetRelayChat.prototype.ctcpReply = function(nick, message, callback) {
	this.notice(nick, '\u0001' + message + '\u0001', callback);
};

InternetRelayChat.prototype.message = function(recipient, message, callback) {
	this.sendLine({"command": "PRIVMSG", "args": [recipient], tail: message}, callback);
};

InternetRelayChat.prototype.notice = function(recipient, message, callback) {
	this.sendLine({"command": "NOTICE", "args": [recipient], tail: message}, callback);
};

InternetRelayChat.prototype.join = function(channel, key, callback) {
	this.sendLine({"command": "JOIN", "args": [channel, key]}, callback);
};

InternetRelayChat.prototype.part = function(channel, callback) {
	this.sendLine({"command": "PART", "args": [channel]}, callback);
};

InternetRelayChat.prototype.updateChannelNames = function(channel) {
	this.sendLine({"command": "NAMES", "args": [channel]});
};