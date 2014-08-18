var _ = require("lodash"),
	colors = require("colors"),
	watch = require("watch"),
	domain = require("domain"),
	fs = require("fs"),
	path = require("path"),
	util = require("util"),

	ShopifySyncer = require('./lib/shopify-theme-sync'),

	config = require("./config.json"),

	defaults = {
		"compress": {
			// do not compress JavaScript or JSON by default.
			"js": false
		},
		"ignoreDotFiles": true,
		"interval": 500
	},

	// Merge the base options in config.json with our `defaults` object.
	// Note: We can't use `_.defaults` here directly because it will not perform a "deep" merge. The _.merge method
	// below was suggested by @jdalton himself: https://github.com/bestiejs/lodash/issues/154#issuecomment-12310052
	configOptions = _.merge( {}, config.options, defaults, _.defaults ),

	/**
	 * A black list of file/directory names.
	 *
	 * Shopify's filesystem is case insensitive, so our filter function is too.
	 * Make sure all filenames in this list are lowercase since `filter` only checks against lowercase.
	 */
	blacklist = [
		"thumbs.db"
	],

	/**
	 * A whitelist of all valid shopify directories.
	 *
	 * Shopify's filesystem is case insensitive, so our filter function is too.
	 * Make sure all filenames in this list are lowercase since `filter` only checks against lowercase.
	 */
	validDirectories = [
		"assets",
		"config",
		"layout",
		"snippets",
		"templates"
	],

	/**
	 * walk options. We want to apply our blacklist filter and always ignore dot files.
	 */
	options = {
		"filter": filter
	},

	appTitle = "Shopify Theme Syncer";

process.title = appTitle;

_.extend( options, configOptions );

if ( config && Array.isArray( config.shops ) && config.shops.length > 0 ) {
	config.shops.forEach(function( shopConfig ) {

		// set `options` on our shopConfig and make sure defaults are applied (deep).
		_.merge( shopConfig.options = shopConfig.options || {}, options, _.defaults );

		var shopDomain = domain.create();
		shopDomain.on( "error", function( error ) {
			console.error( ( "An error occurred in shop: %s. Details below:", shopConfig.name ) );
			console.error( util.inspect( error ) );
			console.error( "\n" );
		});
		shopDomain.run(function() {
			// TODO: Investigate any potential optimizations by spinning these up on separate workers.
			watchShop( shopConfig );
		});
	});
}
else {
	console.log("No shops to watch. :-(\n");
}

/**
 * Sets up the methods to watch and sync to a Shopify shop.
 *
 * @param {Object} shopConfig The config object for the Shopify shop.
 */
function watchShop ( shopConfig ) {
	var directory = shopConfig.directory;
	if ( directory ) {
		if ( fs.existsSync( directory ) ) {

			var shopify = new ShopifySyncer( shopConfig ),
				shopOptions = shopConfig.options;

			console.log( util.format( "Walking directory tree: %s\n", directory) );

			watch.watchTree( directory, shopOptions, function sync( f, curr, prev ) {
				if ( typeof f == "object" && prev === null && curr === null ) {
					// we're done walking!

					console.log( util.format( "Now watching directory tree: %s\n", directory ).rainbow );
				}

				// we can't actually delete the root (at Shopify), so don't try.
				else if ( f !== directory ) {

					// `walk` sometimes lets dot files through (usually on creation), so we need to double check.
					if ( shopOptions.ignoreDotFiles && path.basename(f)[0] === "." ) {
						console.log( util.format( "dotFile file ignored: %s\n", f ) );
						return;
					}

					// `walk` sometimes lets filtered files through (usually on creation), so we need to double check.
					if ( filter( f, curr, blacklist ) ){
						console.log( util.format( "filtered file ignored: %s\n", f ) );
						return;
					}
					if ( filter( f, curr, blacklist ) ){
						console.log( util.format( "filtered file ignored: %s\n", f ) );
						return;
					}

					if ( prev === null ) {
						// f is a new file or directory

						// if we are a file, we can be synced with Shopify (probably)
						if ( curr.isFile() ) {
				    		updateTitle( util.format( "Creating: %s\n", f ) );

							shopify.create( f, wrap( handleResponse, f + " created" ) );
						}

						// only some directories can be synced, make sure we are one of these before trying.
						else if ( curr.isDirectory() && filter( f, curr, validDirectories ) ) {

							// a directory was created (or just renamed), sync its files.
							watch.walk( f, options, function( err, files ) {
								for ( var _f in files ){
									if ( _f !== f ) {
										sync( _f, files[_f], null );
									}
								}
							});
						}
					}
					else if ( curr.nlink === 0 ) {
						// f was removed

						updateTitle( util.format( "Deleting: %s\n", f ) );

						shopify.delete( f, wrap( handleResponse, f + " deleted\n" ) );
					}
					else {
						// f was changed.

						// We *should* never need to deal with directories here, as renamed directories
						// are treated as delete oldname + create newname

						updateTitle( util.format( "Modifying: %s\n", f ) );

						shopify.modify( f, wrap( handleResponse, f + " modified\n" ) );
					}
				}
			});
		}
		else {
			console.error( util.format( "Specified directory %s does not exist.\n", directory ) );
		}
	}
	else {
		console.error("You must specify a directory.\n");
	}
}

/**
 * Checks if a file/directory name is in an array.
 *
 * @param {String} f The pathname of the file being walked.
 * @param {Object} stat Not used, but required.
 * @param {Array} arr The array to filter on (optional, defaults to blacklist). All entries should be lowercased.
 *
 * @return {Boolean} True if the file was found in the list, false if it wasn't.
 */
function filter( f, stat, arr ) {
	return (arr || blacklist).indexOf( path.basename( f ).toLowerCase() ) !== -1;
}

/**
 * Applies all arguments after the first to the passed `fn`, appending those arguments on the end.
 * arguments.
 *
 * e.g. wrap( function(){ return arguments; }, "3", "4" )( "1", "2" ) returns [ 1, 2, 3, 4 ] (as an `arguments` object)
 *
 * @param {Function} fn
 * @return {Function} The wrapped fn.
 */
function wrap( fn ) {
	var args = [].slice.call( arguments, 0 );
	args.shift();
	return function(){
		fn.apply( this, [].slice.call(arguments, 0).concat( args ) );
	};
}

/**
 * Handles a shopify response
 *
 * @param {Object} error
 * @param {Object} data
 * @param {String} message
 */
function handleResponse ( error, data, message ) {

	var titleMsg = "",
		consoleMsg = "",
		consoleData = null;

	if ( error || data.errors ) {
		titleMsg = "Failed: " + message;
		consoleMsg = titleMsg.red;

		consoleData = error || data.errors;
	}
	else if ( data ){
		titleMsg = "Success: " + message;
		consoleMsg = titleMsg.green;

		consoleData = data;
	}
	else {
		titleMsg = "Failed?: " + message;
		consoleMsg = titleMsg.yellow;

		consoleData = "[No data]";
	}

	updateTitle( titleMsg, consoleMsg );

	console.log( consoleData );
}

/**
 * Updates the node process' title to `titleMsg` and then blinks it, also writes to the console.
 *
 * After blinking for 5 times the title is reset to its original value.
 *
 * @param {String} titleMsg The message to display as the title.
 * @param {String} consoleMsg The message to write to the console. Defaults to `titleMsg` (optional).
 */
function updateTitle( titleMsg, consoleMsg ) {

	// make sure we aren't running multiple timeouts
	clearTimeout( updateTitle.interval );

	console.log( consoleMsg || titleMsg );

	// now, blink the title!
	process.title = titleMsg;
	(function blink(i){
		if ( i > 4 ) {
			// reset the title to its orginal value
			updateTitle.interval = setTimeout(function(){
				process.title = appTitle;
			}, 5000);
			return;
		}

		updateTitle.interval = setTimeout(function(){
			process.title = "";
			updateTitle.interval = setTimeout(function(){
				process.title = titleMsg;
				blink(++i);
			}, 200);
		}, 1250);
	}(0));
}
