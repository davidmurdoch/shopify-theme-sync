var http = require("http"),
	url  = require("url"),
	path = require("path"),
	fs = require("fs"),
	https = require("https"),

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
				callback( null, data );
		  	});
		});

		// send the payload if we actually have some data to send.
		if ( payload && payload.length ) {
			request.write( payload );
		}

		request.on("error", function( error ) {
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
	 * @returns {http.request} The HTTP request sent to shopify
	 */
	"modify": function( filepath, callback ) {
		var shopifyUri = this._generateResourceUrl( filepath )
			payload = {
			"asset": {
				"key": shopifyUri.shopifyPath,
				"attachment": fs.readFileSync( filepath, "base64" )
			}
		};

		return this.sendRequest( shopifyUri, "PUT", payload, callback );
	}
};