var watch = require("watch"),
	domain = require("domain"),
	fs = require("fs"),
	path = require("path"),
	util = require("util"),
	ShopifySyncer = require('./lib/shopify-theme-sync'),
	config = require("./config.json"),

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
		"filter": filter,
		"ignoreDotFiles": true
	};

if ( config && Array.isArray( config.shops ) && config.shops.length > 0 ) {
	// todo: spin up
	config.shops.forEach(function( shopConfig ) {
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

			var shopify = new ShopifySyncer( shopConfig );

			console.log( util.format( "Walking directory tree: %s\n", directory) );

			watch.watchTree( directory, options, function sync( f, curr, prev ) {
				if ( typeof f == "object" && prev === null && curr === null ) {
					// we're done walking!

					console.log( util.format( "Now watching directory tree: %s\n", directory ) );
				}

				// we can't actually delete the root (at Shopify), so don't try.
				else if ( f !== directory ) {

					// `walk` sometimes lets filtered files through (usually on creation), so we need to double check.
					if ( filter( f, curr, blacklist ) ){
						console.log( "filtered file ignored: %s\n", f );
						return;
					}

					if ( prev === null ) {
						// f is a new file or directory

						// if we are a file, we can be synced with Shopify (probably)
						if ( curr.isFile() ) {
				    		console.log( util.format( "creating: %s\n", f ) );

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
						console.log( util.format( "deleting: %s\n", f ) );

						shopify.delete( f, wrap( handleResponse, f + " deleted" ) );
					}
					else {
						// f was changed.

						// We *should* never need to deal with directories here, as renamed directories
						// are treated as delete oldname + create newname

						console.log( util.format( "modifying: %s\n", f ) );

						shopify.modify( f, wrap( handleResponse, f + " modified" ) );
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
	if ( error ) {
		console.error( error );
	}
	else if ( data ){
		console.log( data, message + " successfully" );
	}
	else {
		console.log( "No data returned", message );
	}
}