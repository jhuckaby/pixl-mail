// Simple SMTP Email Sender
// Copyright (c) 2015 - 2024 Joseph Huckaby
// Released under the MIT License

const fs = require('fs');
const util = require('util');
const nodemailer = require('nodemailer');
const Tools = require('pixl-tools');

module.exports = class Mailer {
	
	constructor(host, port) {
		// class constructor
		this.options = {
			host: host || '127.0.0.1',
			port: port || 25
		};
	}
	
	setOption(key, value) {
		// set single option
		this.options[key] = value;
	}
	
	setOptions(opts) {
		// set multiple options
		for (var key in opts) {
			this.options[key] = opts[key];
		}
	}
	
	attachLogAgent(agent) {
		// attach pixl-logger compatible log agent
		this.logger = agent;
	}
	
	send(data, args, callback) {
		// send e-mail
		var self = this;
		
		// support 2-argument convention (data and callback only)
		if (!callback && (typeof(args) == 'function')) {
			callback = args;
			args = null;
		}
		
		// support buffers
		if (data instanceof Buffer) {
			data = data.toString();
		}
		
		// support loading files
		if (!data.match(/\n/)) {
			fs.readFile(data, { encoding: 'utf8' }, function (err, data) {
				if (err) callback(err);
				else self.send( data, args, callback );
			} );
			return;
		}
		
		// support null callback
		if (!callback) callback = function() {};
		
		// perform placeholder substitution on body
		if (args) data = Tools.sub( data, args );
		
		// fix line endings
		data = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
		
		// split out headers and body
		var parts = data.split(/\n\n/);
		var headers_raw = parts.shift();
		var body_raw = parts.join("\n\n");
		if (!body_raw.match(/\S/)) return callback( new Error("Cannot locate e-mail body."), data );
		
		// parse headers into key/value pairs
		var headers = {};
		headers_raw.replace(/([\w\-]+)\:\s*([^\n]*)/g, function(m_all, m1, m2) {
			headers[ m1 ] = m2;
			return '';
		} );
		
		// grab to, from and subject
		var to = headers['To'];
		var from = headers['From'];
		var subject = headers['Subject'];
		
		if (!to) return callback( new Error("Missing required header: 'To'"), data );
		if (!from) return callback( new Error("Missing required header: 'From'"), data );
		if (!subject) return callback( new Error("Missing required header: 'Subject'"), data );
		
		delete headers['To'];
		delete headers['From'];
		delete headers['Subject'];
		
		if (this.options.sendmail) {
			delete this.options.host;
			delete this.options.port;
		}
		
		// capture debug trace from nodemailer, and log if configured
		// also send it back with response, whatever the result
		this.options.debug = true;
		this.options.logger = {};
		var log = [];
		
		['trace', 'debug', 'info', 'warn', 'error', 'fatal'].forEach( function(level) {
			self.options.logger[level] = function(entry, message, ...args) {
				if (!entry) entry = {};
				message = util.format(message, ...args);
				self.logDebug(9, message, entry);
				log.push([ message, { date: Tools.timeNow(), level, ...entry } ]);
			};
		} );
		
		// setup transport
		var transport = nodemailer.createTransport(this.options);
		
		var opts = {
			from: from,
			to: to,
			subject: subject
		};
		
		// support cc and bcc
		if (headers['Cc']) { opts.cc = headers['Cc']; delete headers['Cc']; }
		if (headers['Bcc']) { opts.bcc = headers['Bcc']; delete headers['Bcc']; }
		
		// custom headers
		if (Tools.numKeys(headers)) opts.headers = headers;
		
		// attachments
		if (args && args.attachments) opts.attachments = args.attachments;
		
		// auto-detect html or text
		if (body_raw.match(/^\s*</)) opts.html = body_raw;
		else opts.text = body_raw;
		
		// send mail
		transport.sendMail( opts, function(err) {
			callback( err, data, log );
		} );
	}
	
	logDebug(level, msg, data) {
		// log if we have an attached agent
		if (this.logger) {
			this.logger.set( 'component', 'Mailer' );
			this.logger.debug( level, msg, data );
		}
	}
	
};
