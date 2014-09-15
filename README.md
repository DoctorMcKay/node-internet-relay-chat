# node-internet-relay-chat

This is a Node.js module that's designed to provide as complete of an IRC interface as is possible.

# License

This module is licensed under the MIT license.

```text
Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies of the Software, and
to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all copies
or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

# Installation

Install it via npm:

```text
npm install internet-relay-chat
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
	"secure": false, // If true, the connection will use SSL/TLS
	"localAddress": null, // If specified, the client will bind to this local IP address
	"vhost": null, // If specified, the client will report this vhost to the IRC server, otherwise it will be autodetected (via reverse DNS)
	"floodDelay": 1000, // If greater than zero, the client will impose this delay (in milliseconds) between messages sent to the server
	"debug": false // If true, the client will spew all network I/O to the console
};
```

# Colors

Colors are accessed directly through the required `IRC` object, not through any instantiated bots or clients. There are two ways to access colors:

## IRC.colors

Contains color codes that can be concatenated directly into strings.

- white
- black
- darkBlue
- darkGreen
- lightRed
- darkRed
- magenta
- orange
- yellow
- lightGreen
- cyan
- lightCyan
- lightBlue
- lightMagenta
- gray
- lightGray
- bold
- reverse
- italic
- underline
- reset

## IRC.rawColors

Contains only the numbers for the colors listed above (except bold, reverse, italic, underline, and reset). You can turn these into IRC-ready color codes by prepending a '\u0003' character. To add a highlight, append a second color code separated by a comma.

For example, to send the message "Hello, World!" in white with a black background, you would want to use something like this:

    "\u0003" + IRC.rawColors.white + "," + IRC.rawColors.black + "Hello, World!"

# Properties

## connected

This property will be `true` if the client is currently connected to an IRC server.

## registered

This property will be `true` if the client is currently connected to and registered with an IRC server.

## secure

This property will be `true` if the current connection is secure.

## myNick

The bot's current nickname.

## support

An object containing all features that the IRC server supports (as reported by the 005 message).

## channels

An object containing the channels that the bot is currently in. It looks like this:

```js
{
	"#channel" {
		"nicks": ["@Op1", "@Op2", "+Voice1", "+Voice2", "User1", "User2"],
		"users": {
			"Op1": {
				"prefix": "@",
				"access": ["o", "v"]
			},
			"Op2": {
				"prefix": "@",
				"access": ["o"]
			},
			"Voice1": {
				"prefix": "+",
				"access": ["v"]
			},
			"Voice2": {
				"prefix": "+",
				"access": ["v"]
			},
			"User1": {
				"prefix": "",
				"access": []
			},
			"User2": {
				"prefix": "",
				"access": []
			}
		},
		"updatingNames": false,
		"modes": ["n", "t", "k foo", "l 5"],
		"created": 1396133159,
		"topic": "Channel Topic",
		"dataLoaded": true
	}
}
```

The `nicks` array is only present for backwards-compatibility, you should use the `users` object instead of it. The nicks and access arrays have no guaranteed order.

The `updatingNames` property will be `true` if we have received at least one `353` numeric and no finishing `366` numeric.

The `modes` property is an array of channel modes. Modes which have a parameter (such as +k) include their parameter after a space.

The `created` property contains the UNIX timestamp of when the channel was created.

The `topic` property contains the channel's topic. It may be `false` if the channel has no topic.

The `dataLoaded` property is `true` if all channel data has been received from the server. This is used internally, although you may wish to check it to see if a channel's data is fully loaded yet.

The `channel` event will be emitted when this data has been populated. You shouldn't try to access a channel's data before this event is emitted.

## options

An object representing the current connection's options, as defined in the constructor. The only properties that you should change are `autoReconnect` and `floodDelay`.

## socket

The connection's socket object. You can use this if you need to do something that isn't exposed in other methods or properties.

# Events

## error
- `e` - Error object

Same as [net.Socket](http://nodejs.org/api/net.html#net_event_error_1) error event.

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

## irc-[command]
- `line` - A `line` object (see `Line Object` section below)

Emitted when the client receives a command from the IRC server. `[command]` will be the command received. For example, `irc-privmsg` will be emitted when a `PRIVMSG` is received. You don't usually want to listen for these types of events since most important ones have their own events.

There are two important cases to note:

- `irc-ping` will be automatically caught and an appropriate `PONG` response will be sent, but this will be suppressed if you bind any listeners to this event. If you bind a listener to `irc-ping`, make sure that you send the appropriate `PONG` response using `bot.sendLine`.
- `irc-error` will be emitted before the IRC server terminates the connection.

## ctcp-[command]
- `line` - A `line` object (see `Line Object` section below), with an additional `sender` property which is a `Sender Object`

Emitted when the client receives a CTCP command from the IRC server. `[command]` will be the command received. For example, `ctcp-version` will be emitted when a `CTCP-VERSION` is received.

There are three important cases to note:

- `ctcp-ping` will be automatically caught and an appropriate response will be sent to the sender. If you bind a listener to this event, the automatic response will be suppressed. Make sure that you send a response if you desire.
- `ctcp-time` will be automatically caught and an appropriate response will be sent to the sender. If you bind a listener to this event, the automatic response will be suppressed. Make sure that you send a response if you desire.
- Many IRC servers require clients to respond to `ctcp-version` requests. You may want to listen for this event and send an appropriate response (using `bot.ctcpReply`).

## numeric
- `line` - A `line` object (see `Line Object` section below)

Emitted when the client receives any numeric reply from the IRC server. See [RFC 1459](http://tools.ietf.org/html/rfc1459.html#section-6) for an enumeration. Most clients display numeric replies to the client in a similar format as a `NOTICE`.

## numeric[class]
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

Emitted when a user in one of the channels that we're in quits from the server or is killed. This will not be emitted when a user in a channel that we're in is kicked, or parts gracefully. This will not be emitted when we quit.

## mode
- `changer` - A `sender` object corresponding to the user that changed the mode
- `channel` - The channel (or user, if a user mode) that had its mode changed
- `mode` - The mode(s) that changed
- `args` - Any applicable arguments

Emitted when a user or channel mode is changed. Note that `args` may be an empty array (if no args are applicable) and that `mode` may contain multiple modes.

Examples:

- Multiple users 'foo' and 'bar' voiced: `mode = "+vv"`, `args = ["foo", "bar"]`
- User 'foo' voiced and user 'bar' deopped: `mode = "+v-o"`, `args = ["foo", "bar"]`

## access
- `changer` - A `sender` object corresponding to the user that changed the access
- `channel` - The channel in which access was granted or revoked
- `nick` - The nick of the user whose access was changed
- `granted` - `true` if access was granted, `false` if it was revoked
- `mode` - The access mode that was granted or revoked

Emitted when a user's access (voice, halfop, op, admin, etc) is changed.

Examples:

- User 'foo' voiced in '#channel': `channel = "#channel"`, `nick = "foo"`, `granted = true`, `mode = "v"`
- User 'bar' deopped in '#channel': `channel = "#channel"`, `nick = "bar"`, `granted = false`, `mode = "o"`

If multiple users' access is changed in a single MODE change, this will be emitted once for each user. Crazy stuff like +o-o foo foo will emit two identical events, although `granted` will be `true` and then `false`.

## names
- `channel` - Channel for which we just got updated names

Emitted when the full list of nicknames in a `channel` is received. The array (with nick prefixes) can be accessed via `bot.channels[channel].nicks`.

## channel
- `channel` - The channel for which we now have data

Emitted when a channel's full data is now available at `bot.channels[channel]`. See the `channels` property in the **Properties** section above for more information.

## topic
- `changer` - A `sender` object corresponding to the user that just changed the topic (see `Sender Object` section below)
- `channel` - Channel whose topic just changed
- `topic` - The channel's new topic

Emitted when a channel's topic is changed. `topic` will be `false` if the topic was removed. The `topic` property of `bot.channels[channel]` will be updated after this is emitted, so you can get it from there to compare the old and new topics.

## whois
- `nick` - The nick of the user we received data for

Emitted when numeric 318 (End of /WHOIS list) is received from the IRC server. The user's information may be accessed via bot.whoisData[nick]. It will contain the following properties, although some may be missing depending on what the server sends back:

- `away` - False if the user is not away (or the server doesn't support 301) or a string containing the user's away message
- `ircop` - False if the user is not an IRCOp, or true otherwise
- `nick` - The user's nickname
- `username` - The user's username
- `hostname` - The user's address
- `realname` - The user's real name
- `server` - The address of the server they're on
- `serverinfo` - Any information about the server that was sent
- `idle` - Number of seconds the user has been idle (measured from last message sent)
- `signon` - A timestamp representing when the user joined IRC
- `channels` - An array of channel names. On most servers, the user's prefix will be prepended to the channel name (for example, if the user is an op on channel #foo, the entry will be @#foo)

## pm
- `sender` - A `sender` object corresponding to the user that sent the message (see `Sender Object` section below)
- `message` - The message that was sent

Emitted when a private message is received (one that is sent directly to the bot, not to a channel).

## notice
- `sender` - A `sender` object corresponding to the user that sent the message (see `Sender Object` section below), possibly `null` if it's a notice from the server
- `recipient` - The recipient of the notice, either our nick or a channel
- `message` - The message that was sent

Emitted when a notice is received, either directly to us or to a channel we're in.

## message
- `sender` - A `sender` object corresponding to the user that sent the message (see `Sender Object` section below)
- `channel` - The channel to which the message was sent
- `message` - The message that was sent

Emitted when a message is sent to a channel that the bot is in.

## action
- `sender` - A `sender` object corresponding to the user that sent the message (see `Sender Object` section below)
- `recipient` - The recipient of the action, whether our nick or a channel
- `message` - The text of the action

Emitted when an action (/me) is received, either directly to us in PM or to a channel we're in.

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

## action(recipient, message, [callback])

Sends an action (/me) to a recipient. `recipient` should be either a nick (for a private message) or a channel (for a channel message) starting with the appropriate channel prefix. `callback` will be called, if provided, when the command has been sent to the server (may be late due to flood protection).

## join(channel, [key], [callback])

Joins a `channel`, optionally using the specified `key`. `callback` will be called, if provided, when the command has been sent to the server (may be late due to flood protection).

## part(channel, [callback])

Leaves a `channel`. `callback` will be called, if provided, when the command has been sent to the server (may be late due to flood protection).

## mode(channel, modes, [callback])

Sets or unsets `modes` on a `channel`. `callback` will be called, if provided, when the command has been sent to the server (may be late due to flood protection).

`modes` should be a string representing the modes to +set or -unset, followed by any applicable args with appropriate spacing.

Examples:

- Set a channel's key to "foo" and unset it as moderated: `modes = "+k-m foo"`
- Op a user named "foo": `modes = "+o foo"
- Disable colors in a channel: `modes = "+c"`

## topic(channel, topic, [callback])

Changes the `topic` of a `channel`. `callback` will be called, if provided, when the command has been sent to the server (may be late due to flood protection).

## updateChannelNames(channel)

Sends a request to the IRC server for the full list of nicks in `channel`. The `names` event will be emitted when the response is received.

## whois(nick)

Sends a request to the IRC server for a user's information. The `whois` event will be emitted when the full response is received.

## userHasMode(channel, nick, mode)

Returns `true` if a `nick` has an access `mode` in a `channel`, or `false` if we're not in that channel, the nick in question is not in that channel, or it doesn't have the access mode.

For example, to check if a user named "foo" is an op in #channel, you'd pass `channel = "#channel"`, `nick = "foo"`, `mode = "o"`

**Note:** If the user received this access mode before we entered the channel and their highest mode when we last got NAMES (which was when we entered the channel unless you called `updateChannelNames`) was higher, this will return `false`.

For example, user "foo" received +ov before we entered the channel, so they were a voiced op. When we entered, we only saw @ so we only know them as an op. If they have since been set -o, we don't know about the +v mode so we think that they have no access at all.

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