Shopify Theme Sync for node (v 0.0.6)
==================

A command line tool to monitor and sync themes from your local file system to your hosted Shopify shops.


## Install and Configuration

 0. Clone (then run `npm install`) or just `npm install` me onto your local machine or Cloud9IDE environment

 1. rename `config-example.json` to `config.json`.

 2. edit the properties of `config.json` to match your Shopify shops' *private app* credentials (you can do this by going to https://{yourshop}.myshopify.com/admin/apps/private) then point the config file's `directory` property to your themes' folders.

 3. Run the command `npm start` (or `node app`) and start editing your Shopify templates!

*If you have any questions about these steps, or don't know how to use a command line tool like this one, feel free to open an issue here and/or ask about it on StackOverflow.*

## Options

Check `config-example.json` for examples on applying these options. The defaults are:

```
 {
 	"compress": {
 		// Enable this option for automatic file compression with Uglify.js
 		// Note: minification will only be applied to the uploaded file, the local file will not be modified.
 		"js": false // do not compress/minify JavaScript/JSON by default.
 	},
 	"uploadOriginal": false, // for compressed files, upload the original version also (with a .orig extension)
 	"ignoreDotFiles": true, // ignore dotfiles by default.
 	"interval": 500 // the default interval used when checking files for modification (in milliseconds)
 }
```

## To Actually Edit Templates:

You'll first need to install the template into your Shopify store then download and extract the zip file for the template.
For now, *each template for your shop *must* be named after its template ID, e.g., `3981452` and `4870543`.*

If your config file's `directory` property is `/home/websites/shopname/` you should have directory tree similar to:


    /home/websites/shopname/3981452
                                  ./assets
                                  ./config
                                  ...etc
    /home/websites/shopname/4870543
                                  ./assets
                                  ./config
                                  ...etc

## TODO

 1. Add config option to automatically minify ~~JavaScript~~ (done), CSS, and/or HTML (w/liquid), and optimize asset images on the fly.
 2. Allow sub-directories within theme folders for better file organization. We can "fake" sub directories by replacing the "/" (forward slash) character with a magic string, like "_DIR_" (Shopify doesn't allow special characters in filenames, otherwise I'd just use a solidus `/`), i.e., the resource `assets/css/main.css` would be referenced and uploaded as `assets__DIR__css__DIR__main.css`
 3. Add config option to automatically download themes from a Shopify store to local disk.
