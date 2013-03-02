Shopify Theme Sync for node
==================

A tool to automatically sync themes from your local file system to your hosted Shopify shops.

**This tool is still under development and may not be entirely stable. Use at your own peril.**

## Install and Configuration

 0. Clone or install me onto your local machine or Cloud9IDE environment

 1. rename `config-example.json` to `config.json`.

 2. edit the properties of config.json to match your Shopify shops' *private app* credentials (you can do this by going to https://{yourshop}.myshopify.com/admin/apps/private) then point the config files `directory` property to your themes' folders.

 3. Run the command `npm start` (or `node app`) and start editing your Shopify templates!

## To Actually Edit Templates:

You'll first need to install the template into your Shopify store then download and extract the zip file for the template.
For now, each template for your shop *must* be named after its template ID, e.g., `3981452` and  `4870543`.

If your config file's `directory` property is `/home/websites/shopname/` you should have directory tree similar to:


    /home/websites/shopname/3981452
                                  ./assets
                                  ./config
                                  ...etc
    /home/websites/shopname/4870543
                                  ./assets
                                  ./config
                                  ...etc
