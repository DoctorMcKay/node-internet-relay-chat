# node-internet-relay-chat

This is a Node.js module that's designed to provide as complete of an IRC interface as is possible. This module is still in development; as such, many events and methods are missing.

# License

This module is licensed under the MIT license.

```text
Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies
or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

# Installation

After it is in a more complete state, the module will be released via `npm`. Until then, you may install it using the following command:

```text
npm install https://bitbucket.org/Doctor_McKay/node-internet-relay-chat/get/tip.tar.gz
```

# Example Usage

To quickly start an IRC bot, connect it to a server, and join it to channel #foo, you would want to do something like this.

```js
var IRC = require('internet-relay-chat');
var bot = new IRC({
	"server": "chat.freenode.net",
	"port": 6667
});

bot.on('connect', function() {
	console.log('Bot connected');
});

bot.connect();

bot.on('registered', function() {
	bot.join('#foo');
});
```

# Bot Configuration Options

The single parameter expected to be passed to the constructor is an object containing configuration options. The only one that's required is `server`, although there are many more. The default options are as follows:

```js
var defaultOptions = {
	"username": "nodejs", // The username for the IRC client, as displayed in the hostmask
	"realname": "node-internet-relay-chat IRC client", // The real name of the IRC client, as shown in the whois command
	"nick": "nodejs", // The nickname of the client
	"server": "", // The server to connect to
	"port": 6667, // The port to connect to
	"password": false, // The password to use to connect to the server, or false for none
	"autoReconnect": 15000, // If greater than zero, the client will wait this many milliseconds before reconnecting when the connection is lost (unless bot.quit is used)
	"ssl": false, // If true, the connection will use SSL
	"localAddress": null, // If specified, the client will bind to this local IP address
	"floodDelay": 1000, // If greater than zero, the client will impose this delay (in milliseconds) between messages sent to the server
	"debug": false // If true, the client will spew all network I/O to the console
};
```

# Properties

## registered

This property will be `true` if the client is currently connected to and registered with an IRC server.

## secure

This property will be `true` if the current connection is using SSL.

## myNick

The bot's current nickname.

## support

An object containing all features that the IRC server supports (as reported by the 005 message).

## options

An object representing the current connection's options, as defined in the constructor. The only properties that you should change are `autoReconnect` and `floodDelay`.

## socket

The connection's socket object. You can use this if you need to do something that isn't exposed in other methods or properties.

# Events

## connect

Emitted when a successful connection has been established to the server, but the IRC registration still needs to be negotiated.

## registered

Emitted when the client has been successfully registered with the IRC server.

## disconnect
- `error` - This parameter will be `true` if the disconnect was due to a connection error

Emitted when the client disconnects from the IRC server for any reason.

## rawline
- `line` - A `line` object (see `Line Object` section below)

Emitted when the client receives a line from the IRC server

## irc-<command>
- `line` - A `line` object (see `Line Object` section below)

Emitted when the client receives a command from the IRC server. `<command>` will be the command received. For example, `irc-privmsg` will be emitted when a `PRIVMSG` is received. You don't usually want to listen for these types of events since most important ones have their own events.

There is one important case to note:

- `irc-ping` will be automatically caught and an appropriate `PONG` response will be sent by `node-internet-relay-chat`, but this will be suppressed if you bind any listeners to this event. If you bind a listener to `irc-ping`, make sure that you send the appropriate `PONG` response using `bot.sendLine`.

## ctcp-<command>
- `line` - A `line` object (see `Line Object` section below), with an additional `sender` property which is a `Sender Object`

Emitted when the client receives a CTCP command from the IRC server. `<command>` will be the command received. For example, `ctcp-version` will be emitted when a `CTCP-VERSION` is received.

There are three important cases to note:

- `ctcp-ping` will be automatically caught and an appropriate response will be sent to the sender. If you bind a listener to this event, the automatic response will be suppressed. Make sure that you send a response if you desire.
- `ctcp-time` will be automatically caught and an appropriate response will be sent to the sender. If you bind a listener to this event, the automatic response will be suppressed. MAke sure that you send a response if you desire.
- Many IRC servers require clients to respond to `ctcp-version` requests. You may want to listen for this event and send an appropriate response (using `bot.ctcpReply`).

## numeric
- `line` - A `line` object (see `Line Object` section below)

Emitted when the client receives any numeric reply from the IRC server. See [RFC 1459](http://tools.ietf.org/html/rfc1459.html#section-6) for an enumeration. Most clients display numeric replies to the client in a similar format as a `NOTICE`.

## numeric<class>
- `line` - A `line` object (see `Line Object` section below)

Emitted when the client receives any numeric reply of a specific class from the IRC server. For example, a `433` reply will emit `numeric4`.

## badNickDuringRegistration
- `code` - One of `432` (indicating that the supplied nick contains invalid characters) or `433` (indicating that the supplied nick is already taken on the network)

Emitted when the client receives a `432` or `433` numeric reply while registering. If no listeners are bound to this event, `node-internet-relay-chat` will automatically retry a different nick (a `432` reply will change the nick to `nodejs`, a `433` reply will append a `_` to the nick).

## invite
- `inviter` - A `sender` object corresponding to the user that invited us
- `channel` - The channel we were invited to

Emitted when the client is invited to a channel.

## join
- `user` - A `sender` object corresponding to the user (possibly us) that joined the channel
- `channel` - The channel that the user joined

Emitted when a client joins a channel that we're in. Also emitted when we join a channel.

## part
- `user` - A `sender` object corresponding to the user (possibly us) that parted the channel
- `channel` - The channel that the user parted
- `message` - The part message, if any

Emitted when a user parts from a channel. This will not be emitted when a user in a channel that we're in quits from the server, is killed, or is kicked. Also emitted when we part a channel.

## kick
- `kicker` - A `sender` object corresponding to the user that did the kicking
- `user` - The nick of the user (possibly us) that was kicked from the channel
- `channel` - The channel that the user was kicked from
- `message` - The kick message, if any

Emitted when a user is kicked from a channel. This will not be emitted when a user in a channel that we're in quits from the server, is killed, or parts gracefully. Also emitted when we're kicked from a channel.

## quit
- `user` - A `sender` object corresponding to the user (possibly us) that quit the server
- `channels` - An array of channel names that we saw this user in
- `message` - The quit message, if any

Emitted when a user in one of the channels that we're in quits from the server. This will not be emitted when a user in a channel that we're in is killed, is kicked, or parts gracefully. This will not be emitted when we quit.

## mode
- `changer` - A `sender` object corresponding to the user that changed the mode
- `channel` - The channel (or user, if a user mode) that had its mode changed
- `mode` - The mode(s) that changed
- `args` - Any applicable arguments

Emitted when a user or channel mode is changed. Note that `args` may be an empty array (if no args are applicable) and that `mode` may contain multiple modes.

Examples:

- Multiple users 'foo' and 'bar' voiced: `mode = "+vv"`, `args = ["foo", "bar"]`
- User 'foo' voiced and user 'bar' deopped: `mode = "+v-o"`, `args = ["foo", "bar"]`

## names
- `channel` - Channel for which we just got updated names

Emitted when the full list of nicknames in a `channel` is received. The array (with nick prefixes) can be accessed via `bot.channels[channel].nicks`.

## pm
- `sender` - A `sender` object corresponding to the user that sent the message (see `Sender Object` section below)
- `message` - The message that was sent

Emitted when a private message is received (one that is sent directly to the bot, not to a channel).

## notice
- `Sender` - A `sender` object corresponding to the user that sent the message (see `Sender Object` section below)
- `message` - The message that was sent

Emitted when a notice is received (one that is sent directly to the bot, not to a channel).

## message
- `sender` - A `sender` object corresponding to the user that sent the message (see `Sender Object` section below)
- `channel` - The channel to which the message was sent
- `message` - The message that was sent

Emitted when a message is sent to a channel that the bot is in.

# Methods

## connect()

Connects to the IRC server using the options passed in the constructor.

## quit([message])

Quits (disconnects from) the IRC server with an optional message.

## sendLine(line, callback)

Sends a raw line to the server (parameter is a line object). Only use this if you know what you're doing.

## sendRawLine(line)

Sends a raw line string to the server. This will be appended with `\r\n` automatically. This will bypass flood control. Only use this if you know what you're doing.

## nick(newNick, [callback])

Changes your nickname to `newNick`. `callback` will be called, if provided, when the command has been sent to the server (may be late due to flood protection).

## ctcp(nick, message, [callback])

Sends a CTCP message to `nick`. `message` should be the CTCP message to be sent, followed by any arguments. `callback` will be called, if provided, when the command has been sent to the server (may be late due to flood protection).

An example of a `CTCP-PING` request:

```js
bot.ctcp('McKay', "PING");
```

## ctcpReply(nick, message, [callback])

Sends a CTCP reply to `nick`. `callback` will be called, if provided, when the command has been sent to the server (may be late due to flood protection).

An example reply to a `CTCP-VERSION` request:

```js
bot.on('ctcp-version', function(line) {
	bot.ctcpReply(line.sender.nick, "VERSION My Awesome IRC Bot v1.0.0");
});
```

## message(recipient, message, [callback])

Sends a message to a recipient. `recipient` should be either a nick (for a private message) or a channel (for a channel message) starting with the appropriate channel prefix. `callback` will be called, if provided, when the command has been sent to the server (may be late due to flood protection).

## notice(recipient, message, [callback])

Sends a notice to a recipient. `recipient` should be either a nick (for a private message) or a channel (for a channel notice) starting with the appropriate channel prefix. `callback` will be called, if provided, when the command has been sent to the server (may be late due to flood protection).

## join(channel, [key], [callback])

Joins a `channel`, optionally using the specified `key`. `callback` will be called, if provided, when the command has been sent to the server (may be late due to flood protection).

## part(channel, [callback])

Leaves a `channel`. `callback` will be called, if provided, when the command has been sent to the server (may be late due to flood protection).

## updateChannelNames(channel)

Sends a request to the IRC server for the full list of nicks in `channel`. The `names` event will be emitted when the response is received.

# Line Object

Many methods and events take or provide line objects. A line object is simply an object representing a line that is sent to or received from an IRC server. It has the following properties:

- `command` - The command to be performed
- `args` - An array of arguments
- `tail` - A message to go with the command

For example, here is a typical `PRIVMSG` line:

```text
PRIVMSG #channel :Hello, World!
```

This would parse into:

```js
{
	"command": "PRIVMSG",
	"args": ["#channel"],
	"tail": "Hello, World!"
}
```

# Sender Object

Many mehods and events take or provide sender objects when referring to users. Sender objects are created by parsing hostmasks.

Here is an example hostmask: `Nick!username@hostname.myisp.net`

This would parse into:

```js
{
	"hostmask": "Nick!username@hostname.myisp.net",
	"nick": "Nick",
	"username": "username",
	"hostname": "hostname.myisp.net"
}
```