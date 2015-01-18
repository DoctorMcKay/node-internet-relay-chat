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
	this.connected = false;
	this.registered = false;
	
	var self = this;
	this.on('irc-ping', function(line) {
		if(self.listeners('irc-ping').length > 1) {
			return;
		}
		
		this.sendLine({"command": "PONG", "args": line.args, "tail": line.tail});
	});
	
	this.on('irc-privmsg', function(line) {
		if(line.tail.indexOf('\u0001ACTION ') == 0 && line.tail.charAt(line.tail.length - 1) == '\u0001') {
			self.emit('action', parseHostmask(line.prefix), line.args[0], line.tail.substring(8, line.tail.length - 1));
		} else if(line.args[0] == self.myNick && line.tail.charAt(0) == '\u0001' && line.tail.charAt(line.tail.length - 1) == '\u0001') {
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
		self.emit('notice', line.prefix ? parseHostmask(line.prefix) : null, line.args[0], line.tail);
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
		
		if(joiner.nick == self.myNick) {
			self.channels[channel] = {
				"nicks": [],
				"users": {},
				"updatingNames": false
			};
			
			self.sendLine({"command": "MODE", "args": [channel]});
			self.sendLine({"command": "TOPIC", "args": [channel]});
		} else {
			// Don't call _addToChannel for ourselves, as we'll get our data once we get NAMES
			self._addToChannel(joiner.nick, channel);
		}
		
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
	
	this.on('irc-topic', function(line) {
		var changer = parseHostmask(line.prefix);
		var channel = line.args[0];
		var topic = line.tail;
		
		if(topic.length == 0) {
			topic = false;
		}
		
		self.emit('topic', changer, channel, topic);
		
		self.channels[channel].topic = topic;
	});
	
	this.on('irc-mode', function(line) {
		var changer = parseHostmask(line.prefix);
		if(!line.args[1] && line.tail) {
			line.args[1] = line.tail;
		}
		
		var channel = line.args[0];
		self.emit('mode', changer, channel, line.args[1], line.args.slice(2));
		
		var chan = self.channels[channel];
		
		if(channel != self.myNick) {
			var prefixes = self._getPrefixes();
			var modes = self._getChanModes();
			
			var currentArg = 2;
			var isSetting = true;
			for(var i = 0; i < line.args[1].length; i++) {
				var mode = line.args[1].charAt(i);
				if(mode == '+') {
					isSetting = true;
				} else if(mode == '-') {
					isSetting = false;
				} else if(modes.alwaysParam.indexOf(mode) != -1 || modes.paramWhenSet.indexOf(mode) != -1) {
					if(chan.modes != undefined) {
						if(isSetting) {
							var exists = false;
							for(var j = 0; j < chan.modes.length; j++) {
								if(chan.modes[j].charAt(0) == mode) {
									exists = true;
									chan.modes[j] = mode + ' ' + line.args[currentArg];
									break;
								}
							}
							
							if(!exists) {
								chan.modes.push(mode + ' ' + line.args[currentArg]);
							}
						} else {
							for(var j = 0; j < chan.modes.length; j++) {
								if(chan.modes[j].charAt(0) == mode) {
									chan.modes.splice(j, 1);
									break;
								}
							}
						}
					}
					
					if(isSetting || modes.paramWhenSet.indexOf(mode) == -1) {
						// Only increment arg if it's being set or it's not a param-when-set
						currentArg++;
					}
				} else if(modes.list.indexOf(mode) == -1) {
					// This isn't a list mode, which we want to ignore entirely
					
					// Check if this mode is a prefix mode
					var prefix = false;
					for(var j = 0; j < prefixes.length; j++) {
						if(prefixes[j].mode == mode) {
							prefix = prefixes[j];
							break;
						}
					}
					
					if(!prefix) {
						// We need to update the channel modes
						if(chan.modes != undefined) {
							if(isSetting && chan.modes.indexOf(mode) == -1) {
								chan.modes.push(mode);
							} else if(!isSetting) {
								var index = chan.modes.indexOf(mode);
								if(index != -1) {
									chan.modes.splice(index, 1);
								}
							}
						}
						
						continue;
					}
					
					// This is a prefix mode
					var nick = line.args[currentArg];
					currentArg++;
					if(!self.channels[channel] || !self.channels[channel].users[nick]) {
						continue; // This shouldn't happen!
					}
					
					var user = self.channels[channel].users[nick];
					if(isSetting && user.access.indexOf(mode) == -1) {
						self.emit('access', changer, channel, nick, true, mode);
						user.access.push(mode);
					} else if(!isSetting && user.access.indexOf(mode) != -1) {
						self.emit('access', changer, channel, nick, false, mode);
						var index = user.access.indexOf(mode);
						user.access.splice(index, 1);
					}
					
					// Recalculate the user's prefix
					var highestMode = false;
					for(var j = 0; j < prefixes.length; j++) {
						if(user.access.indexOf(prefixes[j].mode) != -1) {
							highestMode = prefixes[j].prefix;
							break;
						}
					}
					
					if(highestMode) {
						user.prefix = highestMode;
						var index = self._isInChannel(nick, channel);
						if(index != -1) {
							self.channels[channel].nicks[index] = highestMode + nick;
						}
					} else {
						user.prefix = '';
					}
				}
			}
		}
	});
	
	this.on('numeric3', function(line) {
		var whoisNumerics = [301, 311, 312, 313, 317, 318, 319];
		if(whoisNumerics.indexOf(parseInt(line.command, 10)) != -1) {
			// It's a WHOIS reply
			if(line.args[0] == self.myNick) {
				line.args.splice(0, 1);
			}
			
			var data;
			if(self.whoisData[line.args[0]]._updating) {
				data = {"_updating": false, "away": false, "ircop": false, "channels": []};
			} else {
				data = self.whoisData[line.args[0]];
			}
			
			switch(line.command) {
				case 301:
					// Is away
					data.away = line.tail;
					break;
				case 311:
					// User info
					data.nick = line.args[0];
					data.username = line.args[1];
					data.hostname = line.args[2];
					data.realname = line.tail;
					break;
				case 312:
					// Server they're on
					data.server = line.args[1];
					data.serverinfo = line.tail;
					break;
				case 313:
					// IRC operator
					data.ircop = true;
					break;
				case 317:
					data.idle = line.args[1];
					data.signon = line.args[2];
					break;
				case 318:
					// End of WHOIS
					self.whoisData[line.args[0]] = data;
					self.emit('whois', line.args[0]);
					break;
				case 319:
					// Channel list, may be repeated for large numbers of channels
					data.channels = data.channels.concat(line.tail.trim().split(' '));
					break;
			}
			
			self.whoisData[line.args[0]] = data;
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
		// Support
		for(var i = 0; i < line.args.length; i++) {
			if(line.args[i] == self.myNick) {
				continue;
			}
			
			var arg = line.args[i].split('=');
			self.support[arg[0].toLowerCase()] = arg[1];
		}
	});
	
	this.on('irc-324', function(line) {
		// Channel modes
		var channel = line.args[1];
		var currentArg = 3;
		var data = [];
		
		var modes = self._getChanModes();
		for(var i = 1; i < line.args[2].length; i++) { // 1 to skip over the +
			var mode = line.args[2].charAt(i);
			if(modes.list.indexOf(mode) != -1 || modes.alwaysParam.indexOf(mode) != -1 || modes.paramWhenSet.indexOf(mode) != -1) {
				data.push(mode + ' ' + line.args[currentArg]);
				currentArg++;
			} else {
				data.push(mode);
			}
		}
		
		self.channels[channel].modes = data;
		self._checkChannel(channel);
	});
	
	this.on('irc-329', function(line) {
		// Channel created time
		var channel = line.args[1];
		self.channels[channel].created = parseInt(line.args[2]);
		self._checkChannel(channel);
	});
	
	this.on('irc-331', function(line) {
		// No topic is set
		var channel = line.args[1];
		self.channels[channel].topic = false;
		self._checkChannel(channel);
	});
	
	this.on('irc-332', function(line) {
		// Channel topic
		var channel = line.args[1];
		self.channels[channel].topic = line.tail;
		self._checkChannel(channel);
	});
	
	this.on('irc-353', function(line) {
		// NAMES list
		var channel = line.args[line.args.length - 1];
		var names = line.tail.split(' ');
		var prefixes = self._getPrefixes();
		if(!self.channels[channel].updatingNames) {
			self.channels[channel].updatingNames = true;
			self.channels[channel].nicks = names;
			self.channels[channel].users = {};
		} else {
			self.channels[channel].nicks.concat(names);
		}
		
		for(var i = 0; i < names.length; i++) {
			if(self._nickHasPrefix(names[i])) {
				var access;
				for(var j = 0; j < prefixes.length; j++) {
					if(names[i].charAt(0) == prefixes[j].prefix) {
						access = prefixes[j].mode;
						break;
					}
				}
				
				self.channels[channel].users[names[i].substring(1)] = {
					"prefix": names[i].charAt(0),
					"access": [access]
				};
			} else {
				self.channels[channel].users[names[i]] = {
					"prefix": '',
					"access": []
				};
			}
		}
	});
	
	this.on('irc-366', function(line) {
		// End of /NAMES list
		var channel = line.args[line.args.length - 1];
		self.channels[channel].updatingNames = false;
		self.emit('names', channel);
		self._checkChannel(channel);
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

InternetRelayChat.colors = {
	white: '\u000300',
	black: '\u000301',
	darkBlue: '\u000302',
	darkGreen: '\u000303',
	lightRed: '\u000304',
	darkRed: '\u000305',
	magenta: '\u000306',
	orange: '\u000307',
	yellow: '\u000308',
	lightGreen: '\u000309',
	cyan: '\u000310',
	lightCyan: '\u000311',
	lightBlue: '\u000312',
	lightMagenta: '\u000313',
	gray: '\u000314',
	lightGray: '\u000315',
	
	bold: '\u0002',
	reverse: '\u0016',
	italic: '\u001d',
	underline: '\u001f',
	
	reset: '\u000f'
};

InternetRelayChat.rawColors = {
	white: '00',
	black: '01',
	darkBlue: '02',
	darkGreen: '03',
	lightRed: '04',
	darkRed: '05',
	magenta: '06',
	orange: '07',
	yellow: '08',
	lightGreen: '09',
	cyan: '10',
	lightCyan: '11',
	lightBlue: '12',
	lightMagenta: '13',
	gray: '14',
	lightGray: '15'
};

InternetRelayChat.banFlags = {
	nick: (1 << 0),
	user: (1 << 1),
	host: (1 << 2),
	kick: (1 << 3)
};

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
		self.connected = false;
		self.registered = false;
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
	this.connected = true;
	this.emit('connect');
	
	if(self.options.debug) {
		console.log('== CONNECTED ==');
	}
	
	this.channels = {};
	this.support = {};
	this.whoisData = {};
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
		self.connected = false;
		self.registered = false;
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
		this.sendLine({"command": "USER", "args": [this.options.username, this.options.vhost, this.socket.address().address], "tail": this.options.realname});
	} else {
		dns.reverse(this.socket.address().address, function(err, domains) {
			// Silently ignore errors
			var hostname = (domains && domains[0]) || self.socket.address().address;
			self.sendLine({"command": "USER", "args": [self.options.username, hostname, self.socket.address().address], "tail": self.options.realname});
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
		if(!self.connected) {
			return;
		}
		
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
	if(rawLine.indexOf(' :') != -1) {
		line.tail = rawLine.substring(rawLine.indexOf(' :') + 2);
		rawLine = rawLine.substring(0, rawLine.indexOf(' :'));
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
	var match = hostmask.match(/([^!]+)!([^@]+)@(.+)/);
	if(!match) {
		return {
			"hostmask": hostmask,
			"nick": hostmask,
			"username": hostmask,
			"hostname": hostmask
		};
	}
	
	return {
		"hostmask": hostmask,
		"nick": match[1],
		"username": match[2],
		"hostname": match[3]
	};
}

InternetRelayChat.prototype._addToChannel = function(nick, channel) {
	if(!this.channels[channel].users[nick]) {
		this.channels[channel].users[nick] = {
			"prefix": '',
			"access": []
		}
		
		this.channels[channel].nicks.push(nick);
	}
};

InternetRelayChat.prototype._removeFromChannel = function(nick, channel) {
	if(nick == this.myNick) {
		delete this.channels[channel];
		return;
	}
	
	if(this.channels[channel].users[nick]) {
		delete this.channels[channel].users[nick];
		this.channels[channel].nicks.splice(this._isInChannel(nick, channel), 1);
	}
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

InternetRelayChat.prototype._getPrefixes = function() {
	var prefixSupport = this.support.prefix || "(qaohv)~&@%+";
	var prefixes = []; // We're using an array since order is important, the highest mode determines the prefix
	
	var letters = prefixSupport.substring(1, prefixSupport.indexOf(')'));
	var symbols = prefixSupport.substring(prefixSupport.indexOf(')') + 1);
	
	for(var i = 0; i < letters.length; i++) {
		prefixes.push({
			"mode": letters.charAt(i),
			"prefix": symbols.charAt(i)
		});
	}
	
	return prefixes;
};

InternetRelayChat.prototype._getChanModes = function() {
	var modeSupport = this.support.chanmodes;
	var modes =	{
		"list": [], // Modes that add an item to a list and always have a parameter
		"alwaysParam": [], // Modes that always have a parameter
		"paramWhenSet": [], // Modes that have a parameter when set
		"noParam": [] // Modes that never have a parameter
	};
	
	var parts = modeSupport.split(',');
	modes.list = parts[0].split('');
	modes.alwaysParam = parts[1].split('');
	modes.paramWhenSet = parts[2].split('');
	modes.noParam = parts[3].split('');
	
	return modes;
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

// Checks if all of a channel's data has been received so we can emit the "channel" event
InternetRelayChat.prototype._checkChannel = function(channel) {
	var chan = this.channels[channel];
	if(!chan.dataLoaded && chan.users[this.myNick] && chan.modes != undefined && chan.created != undefined && chan.topic != undefined) {
		chan.dataLoaded = true;
		this.emit('channel', channel);
	}
};

InternetRelayChat.prototype.userHasMode = function(channel, nick, mode) {
	var chan = this.channels[channel];
	if(!chan) {
		return false;
	}
	
	var user = chan.users[nick];
	if(!user) {
		return false;
	}
	
	return user.access.indexOf(mode) != -1;
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

InternetRelayChat.prototype.action = function(recipient, message, callback) {
	this.sendLine({"command": "PRIVMSG", "args": [recipient], tail: "\u0001ACTION " + message + "\u0001"}, callback);
};

InternetRelayChat.prototype.join = function(channel, key, callback) {
	this.sendLine({"command": "JOIN", "args": [channel, key]}, callback);
};

InternetRelayChat.prototype.part = function(channel, message, callback) {
	if(typeof message == 'function') {
		callback = message;
	}
	
	if(typeof message != 'string') {
		message = undefined;
	}
	
	this.sendLine({"command": "PART", "args": [channel], "tail": message}, callback);
};

InternetRelayChat.prototype.updateChannelNames = function(channel) {
	this.sendLine({"command": "NAMES", "args": [channel]});
};

InternetRelayChat.prototype.whois = function(nick) {
	if(!this.whoisData[nick]) {
		this.whoisData[nick] = {};
	}
	
	this.whoisData[nick]._updating = true;
	this.sendLine({"command": "WHOIS", "args": [nick]});
};

InternetRelayChat.prototype.mode = function(channel, modes, callback) {
	var args = [channel].concat(modes.split(' '));
	this.sendLine({"command": "MODE", "args": args}, callback);
};

InternetRelayChat.prototype.kick = function(channel, nick, message, callback) {
	if(typeof message === 'function') {
		callback = message;
	}
	
	if(typeof message !== 'string') {
		message = undefined;
	}
	
	this.sendLine({"command": "KICK", "args": [channel, nick], "tail": message}, callback);
};

InternetRelayChat.prototype.ban = function(channel, user, flags, message, callback) {
	if(typeof flags === 'function') {
		message = undefined;
		callback = flags;
		flags = 0;
	} else if(typeof flags === 'string') {
		message = flags;
		callback = undefined;
		flags = 0;
	} else if(typeof message === 'function') {
		callback = message;
		message = undefined;
	}
	
	flags = flags || (InternetRelayChat.banFlags.host | InternetRelayChat.banFlags.kick);
	
	var hostmask = (flags & InternetRelayChat.banFlags.nick ? user.nick : '*') + '!' + (flags & InternetRelayChat.banFlags.user ? user.username : '*') + '@' + (flags & InternetRelayChat.banFlags.host ? user.hostname : '*');
	this.mode(channel, '+b ' + hostmask, (flags & InternetRelayChat.banFlags.kick ? undefined : callback));
	
	if(flags & InternetRelayChat.banFlags.kick) {
		this.kick(channel, user.nick, message, callback);
	}
};

InternetRelayChat.prototype.topic = function(channel, topic, callback) {
	this.sendLine({"command": "TOPIC", "args": [channel], "tail": topic}, callback);
};