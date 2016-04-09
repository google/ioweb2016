## Google I/O 2016 web app

### Setup

Prerequisites

* [Go 1.6](https://golang.org/dl/).
* [Google App Engine SDK for Go 1.9.35+](https://cloud.google.com/appengine/downloads).
  Once installed, make sure the SDK root dir is in `$PATH`. You can verify it's been setup
  correctly by running `goapp version`, which should output something like
  `go version go1.6 (appengine-1.9.35)`.

Setup

1. `git clone https://github.com/GoogleChrome/ioweb2016.git`
2. `cd ioweb2016`
3. `npm install`

If you plan on modifying source code, be a good citizen and:

1. Install [EditorConfig plugin](http://editorconfig.org/#download) for your favourite browser.
   The plugin should automatically pick up the [.editorconfig](.editorconfig) settings.
2. Obey the pre-commit hook that's installed as part of `gulp setup`.
   It will check for JavaScript and code style errors before committing to the `master` branch.

### Running

Run `gulp serve` to start the app.

Normally the app is running in "dev" environment but you can change that
by providing `--env` argument to the gulp task:

  ```
  # run in dev mode, default:
  gulp serve
  # set app environment to production:
  gulp serve --env prod
  # or run as if we were in staging:
  gulp serve --env stage
  ```

Not that this does not change the way the backend code is compiled
or the front-end is built. It merely changes a "environment" variable value,
which the app takes into account when rendering a page or responding to a request.

Running in `stage` or `prod` requires real credentials when accessing external services.
You'll need to run a one-off `gulp decrypt` which will decrypt a service account private key.

Other arguments are:

* `--no-watch` don't watch for file changes and recompile relative bits.
* `--open` open serving url in a new browser tab on start.
* `--reload` enable live reload. Always watches for file changes; `--no-watch` will have no effect.

### Building

Run `gulp`. This will create `dist` directory with both front-end and backend parts, ready for deploy.

**Note**: Build won't succeed if either `gulp jshint` or `gulp jscs` reports errors.

You can also serve the build from `dist` by running `gulp serve:dist`,
and navigating to http://localhost:8080.

`serve:dist` runs the app in `prod` mode by default. You can change that
by providing the `--env` argument as with other `serve` tasks. For instance:

    # run in stage instead of prod
    gulp serve:dist --env stage

### Deploying

To deploy complete application on App Engine:

1. Run `gulp serve:dist` which will build the app in `dist` directory
   and start local server.
2. Perform any necessary manual checks.
2. Run `GAE_SDK/goapp deploy -application <app-id> -version <v> dist/backend/`.

## Backend

Backend is written in Go, hosted on Google App Engine.

`go test ./backend` will run backend server tests. You'll need to make sure
there's a `server.config` file in `./backend` dir.

## Debugging

A list of tools to help in a debugging process.
**NOT available in prod**

### Proxy with the service account credentials

```
http://HOST/io2016/debug/srvget?url=<some-url>
```

The backend will GET `some-url` and respond back with the original
status code, content-type header and the content.

Useful for browsing original CMS data on staging GCS bucket:

[go/iowastaging/debug/srvget?url=https://storage.googleapis.com/io2015-data-dev.google.com.a.appspot.com/manifest_v1.json](http://go/iowastaging/debug/srvget?url=https://storage.googleapis.com/io2015-data-dev.google.com.a.appspot.com/manifest_v1.json)


### Configuring Firebase

#### Creating Databases/Shards and setting them up

When setting up your own version of the Google IO Web app you need to create new Firebase databases,
set them up and configure the app to use them.
First, create one or more (depending on how many shards you need) Firebase databases from
http://firebase.com and note their Databases URLs.
In the `backend/server.config` file list the Firebase Databases URLs in the `firebase.shards` attribute.

For each Firebase databases you need to configure configure Login and Auth:
 - Open the Auth settings page: `https://<firebase-app-id>.firebaseio.com/?page=Auth`
 - If the database is going to be used on prod enter `events.google.com` in the `Authorized Domains for OAuth Redirects` field or whichever domain your app will be served from in prod.
 - Below click on the `Google` tab then `Enable Google Authentication`
 - Provide the `Google Client ID` that you are using for auth.

#### Deploy Security rules to Firebase Databases

Run the following command to deploy the Firebase Security rules to all shards:

```
gulp deploy:firebaserules
```

> Note: You may be prompted to log in to Firebase if you haven't previously done so.

By default the above will deploy rules to the `dev` Firebase shards.
To deploy the rules to other environments' shards run:

```
gulp deploy:firebaserules --env {prod|stage}
```


### Send GCM push notifications

```
http://HOST/io2016/debug/push
```

Follow instructions on that page.

On staging server this is [go/iowastaging/debug/push](http://go/iowastaging/debug/push)


### Re-sync local datastore with remote

```
http://HOST/io2016/debug/sync
```

* dev server: [localhost:3000/io2016/debug/sync](http://localhost:3000/io2016/debug/sync)
* staging: [go/iowastaging/debug/sync](http://go/iowastaging/debug/sync)

## Frontend Testing

Frontend tests are run via https://github.com/Polymer/web-component-tester

Configuration is in wct.conf.js.

To run tests, install wct globally:

    npm install -g web-component-tester

and run:

    wct

