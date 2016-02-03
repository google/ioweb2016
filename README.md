## Google I/O 2016 web app

### Setup

Prerequisites

* [Go 1.4](https://golang.org/dl/).
* Optional: [Google App Engine SDK for Go](https://cloud.google.com/appengine/downloads).
  Once installed, make sure the SDK root dir is in `$PATH`. You can verify it's been setup
  correctly by running `goapp version`, which should output something like
  `go version go1.4.2 (appengine-1.9.30) darwin/amd64`.

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

Run `gulp serve` to start a standalone backend, while still enjoying live-reload.
You'll need Go for that.

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

You can also use GAE dev appserver by running `gulp serve:gae`. This is closer to what
we're using in our webapp environment but a bit slower on startup.
You'll need Google App Engine SDK for Go to do this.

To change the app environment when using GAE SDK, provide `--env` argument:

    # run in dev mode, default:
    gulp serve:gae
    # set app environment to production:
    gulp serve:gae --env prod
    # or run as if we were in staging:
    gulp serve:gae --env stage

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

1. Run `gulp` which will build both frontend and backend in `dist` directory.
2. Run `GAE_SDK/goapp deploy -application <app-id> -version <v>`.

## Backend

Backend is written in Go. It can run on either Google App Engine or any other platform as a standalone
binary program.

`gulp backend` will build a self-sufficient backend server and place the binary in `backend/bin/server`.

`gulp backend:test` will run backend server tests. If, while working on the backend, you feel tired
of running the command again and again, use `gulp backend:test --watch` to watch for file changes
and re-run tests automatically.

Add `--gae` cmd line argument to the test task to run GAE-based tests.


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

// TODO: Centralize Firebase DB shards list in server.config files and automate rules upload with Gulp.

You need to create and configure Firebase databases and configure the app to use them.
First create one or more (depending on how many shards you need) Firebase databases from
http://firebase.com and note their URL and IDs.
In `scripts/helper/firebase.js` list the Firebase Database URLs in `FIREBASE_DATABASES_URL`.
Configure these Firebase databases' rules by running for each database:

```
firebase login
firebase deploy:rules -f <firebase-app-id> # e.g. firebase deploy:rules -f iowa-2016-dev
```

For each Firebase databases, configure Login and Auth on: `https://<firebase-app-id>.firebaseio.com/?page=Auth`
If the database is going to be used on prod enter `events.google.com` in `Authorized Domains for OAuth Redirects`
Below click on the `Google` tab then `Enable Google Authentication`
and provide the `Google Client ID` that you are using for auth.


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

## Testing

Frontend tests are run via https://github.com/Polymer/web-component-tester

Configuration is in wct.conf.js.

To run tests, install wct globally:

    npm install -g web-component-tester

and run:

    wct

