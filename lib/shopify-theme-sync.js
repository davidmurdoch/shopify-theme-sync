var http = require("http"),
	url  = require("url"),
	path = require("path"),
	fs = require("fs"),
	https = require("https"),
	UglifyJS = require("uglify-js"),

	rJsonType = /(?:^|;\s*)application\/json(?:\s*;|$)/;

module.exports = ShopifySyncer;

/**
 * A Shopify Syncer
 *
 * @param {String} siteUrl
 * @returns {ShopifySyncer}
 */
function ShopifySyncer( config ) {

	if ( !config ) {
		throw new Error("You must supply a valid config object.");
	}
	if ( config.apiKey && typeof config.apiKey !== "string" ) {
		throw new Error("config object missing valid apiKey");
	}
	if ( config.password && typeof config.password !== "string" ) {
		throw new Error("config object missing valid password");
	}
	if ( config.name && typeof config.name !== "string" ) {
		throw new Error("config object missing valid name");
	}
	if ( config.directory && typeof config.directory !== "string" ) {
		throw new Error("config object missing valid directory");
	}

	this.siteUrl = "https://" + config.apiKey + ":" + config.password + "@" + config.name + ".myshopify.com/admin/";
	this.config = config;
	this.directory = config.directory;

	return this;
}

ShopifySyncer.prototype = {

	/**
	 * Sens a request to the site's url.
	 *
	 * @param {Object} uri The URI object
	 * @param {String} method The HTTP method (defaults to GET).
	 * @param {Object|String} payload The payload to send to the server, can be null.
	 * @param {Function} callback
	 */
	"sendRequest": function( uri, method, payload, callback ){

		// convert the payload into a string
		if ( payload != null && typeof payload !== "string" ) {
			payload = JSON.stringify( payload );
		}

		// make sure we always have a callback function.
		if ( !callback || typeof callback !== "function" ) {
			callback = function(){};
		}

		var options = {
			"auth": uri.auth,
			"hostname": uri.hostname,
			"method": method || "GET",
			"path": uri.path,
			"port": 443,
			"headers": {
				"content-type": "application/json",
				// shopify requires `content-length`, even for DELETE requests
				"content-length": payload ? payload.length : 0
			}
		};

		// TODO: make sure we reuse our https connection
		var request = https.request( options, function( response ) {
			var buffer = [],
				isJSON = rJsonType.test( response.headers["content-type"] );

			response.on( "data", function( data ) {
				buffer.push( data );
		  	});
		  	response.on( "end", function() {
		  		var data = buffer.join("");

		  		// if the content type says we are JSON
		  		if ( isJSON ) {
		  			// ignore any JSON parse errors.
		  			try {
		  				data = JSON.parse( data );
		  			}
		  			catch(e){}
		  		}
				callback( response.statusCode !== 200 ? "StatusCode: " + response.statusCode : null, data );
		  	});
		});

		// send the payload if we actually have some data to send.
		if ( payload && payload.length ) {
			request.write( payload );
		}

		request.on( "error", function( error ) {
			callback( error );
		});

		request.end();

		return request;
	},

	/**
	 * Generates the url for the resource.
	 *
	 * @param {String} filepath The path of the file.
	 * @returns {Object} A URI object with an additional property: `shopifyPath`, representing the siteUrl-relative
	 * 	path of the asset.
	 */
	"_generateResourceUrl": function( filepath, appendAssetKey ) {
		var rootRelativePath = path.relative( this.directory, filepath ),
			pathParts = rootRelativePath.split( path.sep );
			theme_id = pathParts.shift(),
			search = "",
			shopifyPath = pathParts.join("/");

		// app
		if ( appendAssetKey ) {
			search = "?asset[key]=" + encodeURIComponent( shopifyPath );
		}
		var shopifyUri = url.parse( this.siteUrl + "themes/" + theme_id + "/assets.json" + search );

		// replace everything but the last
		shopifyUri.shopifyPath = shopifyPath;

		return shopifyUri;
	},

	/**
	 * Gets the file contents from from the filepath, in base64 encoding.
	 *
	 * If the shop config specifies the files of this type should be compressed before uploading, then the return
	 * value will be the *compressed* file contents. The file itself is NOT modified.
	 *
	 * @param {String} The path of the file.
	 * @returns {String} The contents of the file, compressed if allowed and possible, and base64 encoded.
	 */
	"_getFileContents": function( filepath ) {
		var extname = path.extname( filepath ),
			originalContents = fs.readFileSync( filepath ),
			compressedContents = null,
			outMethod = {},
			ret = {
				"original": new Buffer( originalContents ).toString("base64")
			};
		if ( this.shouldCompressFile( extname, outMethod ) ) {
			compressedContents = this.compressContents( originalContents.toString(), outMethod.method );
			ret.compressed = new Buffer( compressedContents ).toString("base64");
		}
		return ret;
	},

	/**
	 * Compresses the contents with the specified method.
	 *
	 * Warning: This function will throw an exception if the supplied "method" is not supported.
	 *
	 * @param {String} contents The contents to compress.
	 * @param {String} method The method to use for compression.
	 * @returns {String} The compressed file.
	 */
	"compressContents" : function( contents, method ) {
		var compressed;

		switch ( method ) {
			// "js" includes JSON
			case "js":
				try {
					compressed = CompressJS( contents );
				}
				catch ( e ) {
					// the JS code is probably invalid or unparseable by our compresspr.
					// Warn the user then upload the uncompressed code instead.
					// TODO: figure out if this the best approach? If the code isn't valid should we just not upload it?
					console.warn( e );
					compressed = contents;
				}
			break;
			default:
				throw new Error("Compression method " + method + " does not exist.");
			break;
		}

		// make sure the "compressed" version is actually smaller than the original
		return compressed.length <= contents.length ? compressed : contents;
	},

	/**
	 * Determines from the shop config and extname if a file with the extname should be compressed before uploading.
	 *
	 * @param {String} extname The file extension of the file to check.
	 * @param {Object} outMethod The method used to compress the supplied.
	 * @returns {Boolean} True if a file with the supplied extension should be compressed.
	 */
	"shouldCompressFile": function( extname, outMethod ) {
		 switch ( extname ) {
		 	case ".js":
		 	case ".json":
		 		outMethod.method = "js";
		 		return this.config.options.compress.js === true;
	 		default:
	 			return false;
		 	break;
		 }
	},

	/**
	 * Creates the file at the Shopify store.
	 *
	 * This method will overwrite existing files with the same filename.
	 *
	 * @param {String} filepath The path of the file.
	 * @param {Function} callback fn( error, data )
	 * @returns {http.request} The HTTP request sent to shopify
	 */
	"create": function( filepath, callback ) {

		// sure, technically we should be using an HTTP POST request for this REST call, but Shopfiy doesn't care.
		return this.modify( filepath, callback );
	},

	/**
	 * Deletes the file from the Shopify store, if it exists.
	 *
	 * @param {String} filepath The path of the file.
	 * @param {Function} callback fn( error, data )
	 * @returns {http.request} The HTTP request sent to shopify
	 */
	"delete": function( filepath, callback ) {
		var shopifyUri =  this._generateResourceUrl( filepath, true );

		return this.sendRequest( shopifyUri, "DELETE", null, callback );
	},

	/**
	 * Modifies the file from the Shopify store.
	 *
	 * This method will create the file if it doesn't exist.
	 *
	 * @param {String} filepath The path of the file.
	 * @param {Function} callback fn( error, data )
	 * @returns {http.request} The HTTP request sent to Shopify
	 */
	"modify": function( filepath, callback ) {
		var shopifyUri = this._generateResourceUrl( filepath ),
			attachments = this._getFileContents( filepath ),
			payload;

		payload = {
			"asset": {
				"key": shopifyUri.shopifyPath,
				"attachment": attachments.compressed ? attachments.compressed : attachments.original
			}
		};

		var result = this.sendRequest( shopifyUri, "PUT", payload, callback );

		if ( this.config.options.uploadOriginal === true && attachments.compressed ) {
			var shopifyUri2 = this._generateResourceUrl( filepath + ".orig" ),
				payload2 = {
					"asset": {
						"key": shopifyUri2.shopifyPath,
						"attachment": attachments.original
					}
				};
			this.sendRequest( shopifyUri2, "PUT", payload2 );
		}

		return result;
	}
};

/**
 * Compresses the supplied JavaScript/JSON code.
 *
 * Multiline comment blocks beginning with "!" are preserved as are JSDoc-style comments that contain "@preserve",
 * "@license" or "@cc_on" (conditional compilation for IE).
 *
 * Warning: If the supplied JavaScript/JSON is invalid this code may throw an exception.
 *
 * @param {String} code The JavaScript code to compress.
 * @returns {String} The compressed code.
 */
function CompressJS( code ) {
	var toplevel_ast = UglifyJS.parse( code );
	toplevel_ast.figure_out_scope();
	var compressed_ast = toplevel_ast.transform( UglifyJS.Compressor() );
	compressed_ast.figure_out_scope();
	compressed_ast.compute_char_frequency();
	compressed_ast.mangle_names();

	// outputs the compressed ast to a string while preserving comments that start with a "!"
	return compressed_ast.print_to_string({
		"comments": function( node, comment ) {
			var text = comment.value,
            	type = comment.type;

        	// comment2 means multiline comment
            if ( type === "comment2" ) {

				// keep comments that start with a "!" (or "*!") or comments that contain "@license" or "@preserve"
				// and IE's conditional compilation comment, "@cc_on"
				return /(^\*?!|@preserve|@license|@cc_on)/i.test( text );
			}
		}
	});
}
