/*
 * cli.js
 * Copyright (C) 2015 Kovid Goyal <kovid at kovidgoyal.net>
 *
 * Distributed under terms of the BSD license.
 */
"use strict;"

var path = require('path');

// Utilities {{{
function repeat(str, num) {
    return new Array( num + 1 ).join( str );
}

function wrap(lines, width) {
	var ans = [];
	var prev = ''
	lines.forEach(function (line) {
		line = prev + line;
		prev = '';
		if (line.length > width) {
			prev = line.substr(width);
			line = line.substr(0, width - 1);
			if (line.substr(line.length - 1 !== ' ')) line += '-';
		} 
		ans.push(line);
	});
	if (prev) ans = ans.concat(wrap([prev]));
	return ans;
}  // }}}

function print_usage() {  // {{{
	console.log('Usage:', path.basename(process.argv[1]), "input1.pyj [input2.pyj ...] \n\n" +
"Compile RapydScript files into javascript. You can either \n" +
"specify the input files on the command line or pipe a single\n" +
"file into stdin.\n\n" +

"If you specify no files and stdin is a terminal, a RapydScript\n" +
"REPL will be started.");
	console.log('\nOptions:');

	var COL_WIDTH = 79;
	var OPT_WIDTH = 23;

	Object.getOwnPropertyNames(options['alias']).forEach(function (name) {
		var optstr = '  --' + name.replace('_', '-');
		options['alias'][name].forEach(function (alias) {
			optstr += ', ' + ((alias.length > 1) ? '--' : '-') + alias.replace('_', '-');
		});
		var ht = wrap(help[name].split('\n'), COL_WIDTH - OPT_WIDTH);

		if (optstr.length > OPT_WIDTH) console.log(optstr);
		else {
			console.log((optstr + repeat(' ', OPT_WIDTH)).slice(0, OPT_WIDTH), ht[0]);
			ht = ht.splice(1);
		}
		ht.forEach(function (line) {
			console.log(repeat(' ', OPT_WIDTH), line);
		});
		console.log();
	});

}  // }}}

// Process options {{{
var help = {};

var options = {
	'string': {},
	'boolean': {},
	'alias': {},
	'default': {},
	'unknown': function(opt) {
		print_usage();
		console.error('\n', opt, 'is not a recognized option');
		process.exit(1);
	}
};

var seen = {};
var comment_contents = /\/\*!?(?:\@preserve)?[ \t]*(?:\r\n|\n)([\s\S]*?)(?:\r\n|\n)[ \t]*\*\//;

function opt(name, aliases, type, default_val, help_text) {
	var match = comment_contents.exec(help_text.toString());
	if (!match) {
		throw new TypeError('Multiline comment missing for: ' + name);
	}
	var help_text = match[1];

	if (!type || type == 'bool') options['boolean'][name] = true;
	else if (type == 'string') options['string'][name] = true;
	
	if (default_val !== undefined) options['default'][name] = default_val;

	if (aliases && aliases.length) {
		aliases.split(',').forEach(function(alias) {
			if (seen.hasOwnProperty(alias)) throw "The option name:" + alias + " has already been used.";
			seen[alias] = true;
		});
		options['alias'][name] = aliases.split(',');
	} else options['alias'][name] = [];

	if (seen.hasOwnProperty(name)) throw "The option name:" + name + " has already been used.";
	seen[name] = true;

	help[name] = help_text;
}
// }}}

function parse_args() {  // {{{
	var ans = {'files':[]};
	var name_map = {};
	var state = undefined;

	function plain_arg(arg) {
		if (state !== undefined) ans[state] = arg;
		else ans['files'].push(arg);
		state = undefined;
	}

	function handle_opt(arg) {
		if (arg[0] === '-') arg = arg.substr(1);
		if (state !== undefined) ans[state] = '';
		state = undefined;
		var val = arg.indexOf('=');
		if (val > -1) {
			var t = arg.substr(val + 1);
			arg = arg.substr(0, val);
			val = t;
		} else val = undefined;

		name = name_map[arg.replace('-', '_')];

		if (options['boolean'].hasOwnProperty(name)) {
			if (!val) val = 'true';
			if (val === 'true' || val === '1') ans[name] = true;
			else if (val === 'false' || val === '0') ans[name] = false;
			else { console.error('The value:', val, 'is invalid for the boolean option:', name); process.exit(1); }
			ans[name] = val;
		} else {
			if (val !== undefined) ans[name] = val;
			else state = name;
		}
	}

	Object.getOwnPropertyNames(options['default']).forEach(function(name) { ans[name] = options['default'][name]; });

	Object.getOwnPropertyNames(options['alias']).forEach(function(name) { 
		name_map[name] = name;
		options['alias'][name].forEach(function (alias) { name_map[alias] = name; });
	});

	process.argv.slice(2).forEach(function(arg) {
		if (arg === '-') plain_arg(arg);

		else if (arg[0] === '-') handle_opt(arg.substr(1));

		else plain_arg(arg);
	});
	if (state !== undefined) plain_arg('');
	return ans;
} // }}}

opt('help', 'h', 'bool', false, function(){/*
show this help message and exit
*/});

opt('version', 'V', 'bool', false, function(){/*
show the version and exit
*/});

opt("output", 'o', 'string', '', function(){/*
Output file (default STDOUT)
*/});

opt("bare", 'b', 'bool', false, function(){/*
Remove the module wrapper that prevents RapydScript 
scope from bleeding into other JavaScript logic 
*/});

opt("auto_bind", 'i', 'bool', false, function(){/*
Automatically bind function methods to functions 
themselves instead of using @bound decorator 
[experimental].
*/});

opt("beautify", 'p,prettify', 'bool', false, function(){/*
Pretty print the generated javascript instead of 
minifying it.
*/});

opt("omit_baselib", 'm', 'bool', false, function(){/*
Omit baselib functions. Use this if you have a 
different way of ensuring they're imported. Note
that simply including baselib.js is no longer
sufficient, as the polyfill functions have to be
executed and their result assigned to an appropriately
named variable.
*/});

opt("test", 't', 'bool', false, function(){/*
Run RapydScript tests and exit. You can specify the
name of individual test files to only run tests 
from those files. For example:
--test baselib functions
*/});

opt("self", undefined, 'bool', false, function(){/*
Compile the compiler itself. It will only actually 
compile if something has changed since the last time 
it was called. To force a recompilation, simply 
delete lib/signatures.json
*/});

opt("comments", undefined, 'string', '', function(){/*
Preserve copyright comments in the output.
By default this works like Google Closure, keeping 
JSDoc-style comments that contain "@license" or 
"@preserve". You can optionally pass one of the 
following arguments to this flag:
- "all" to keep all comments
- a valid JS regexp (needs to start with a slash) to 
keep only comments that match.

Note that currently not *all* comments can be kept 
when compression is on, because of dead code removal 
or cascading statements into sequences.
*/});

opt("stats", undefined, 'bool', false, function(){/*
Display operations run time on STDERR.
*/});

var argv = module.exports.argv = parse_args();

if (argv.help) {
	print_usage();
	process.exit(0);
}

if (argv.version) {
    var json = require("../package.json");
    console.log(json.name + ' ' + json.version);
    process.exit(0);
}