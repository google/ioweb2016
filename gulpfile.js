/* jshint node: true */

/**
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;

var gulp = require('gulp-help')(require('gulp'));
var $ = require('gulp-load-plugins')();
var runSequence = require('run-sequence');
var browserSync = require('browser-sync').create();
var del = require('del');
var merge = require('merge-stream');
var opn = require('opn');
var glob = require('glob');
var pagespeed = require('psi');

var generateServiceWorker = require('./gulp_scripts/service-worker');
var backend = require('./gulp_scripts/backend');

var argv = require('yargs').argv;
var IOWA = require('./package.json').iowa;

var AUTOPREFIXER_BROWSERS = ['last 2 versions', 'ios 8', 'Safari 8'];

// reload is a noop unless '--reload' cmd line arg is specified.
// reload has no effect without '--watch'.
let reload = $.util.noop;
if (argv.reload) {
  reload = browserSync.reload;
  // reload doesn't make sense w/o watch
  argv.watch = true;
}

// openUrl is a noop unless '--open' cmd line arg is specified.
var openUrl = function() {};
if (argv.open) {
  openUrl = opn;
}

// Scripts required for the data-fetching worker.
var dataWorkerScripts = [
  IOWA.appDir + '/bower_components/es6-promise/dist/es6-promise.min.js',
  IOWA.appDir + '/scripts/helper/request.js',
  IOWA.appDir + '/scripts/helper/schedule.js',
  IOWA.appDir + '/scripts/data-worker.js'
];

function createReloadServer() {
  browserSync.init({
    notify: true,
    open: !!argv.open
    // proxy: 'localhost:8080' // proxy serving through app engine.
  });
}

// Default task that builds everything.
// The output can be found in IOWA.distDir.
gulp.task('default', ['clean'], function(done) {
  runSequence(
    'sass', 'vulcanize',
    ['concat-and-uglify-js', 'images', 'copy-assets', 'backend:dist'],
    'generate-data-worker-dist', 'generate-service-worker-dist',
    done
  );
});

// -----------------------------------------------------------------------------
// Setup tasks

gulp.task('setup', 'Sets up local dev environment', function(cb) {
  runSequence(['bower', 'godeps', 'addgithooks'], cb);
});

// Install/update bower components.
gulp.task('bower', false, function(cb) {
  var proc = spawn('../node_modules/bower/bin/bower', ['install'],
                   {cwd: IOWA.appDir, stdio: 'inherit'});
  proc.on('close', cb);
});

// Install backend dependencies.
gulp.task('godeps', false, function(done) {
  backend.installDeps(done);
});

// Setup git hooks.
gulp.task('addgithooks', false, function() {
  return gulp.src('util/pre-commit')
    .pipe($.chmod(755))
    .pipe(gulp.dest('.git/hooks'));
});

gulp.task('clear', 'Clears files cached by gulp-cache (e.g. anything using $.cache)', function(done) {
  return $.cache.clearAll(done);
});

gulp.task('clean', 'Remove built app', ['clear'], function() {
  return del([
    IOWA.distDir,
    IOWA.appDir + '/data-worker-scripts.js',
    IOWA.appDir + '/service-worker.js',
    `${IOWA.appDir}/{styles,elements}/**/*.css`
  ]);
});

// -----------------------------------------------------------------------------
// Frontend prod build tasks

gulp.task('vulcanize', 'Vulcanize all polymer elements', [
  'vulcanize-elements'
  // 'vulcanize-extended-elements',
  // 'vulcanize-gadget-elements'
]);

gulp.task('copy-assets', false, function() {
  var templates = [
    IOWA.appDir + '/templates/**/*.html',
    IOWA.appDir + '/templates/**/*.json'
  ];
  if (argv.env === 'prod') {
    templates.push('!**/templates/debug/**');
  }

  var templateStream = gulp.src(templates, {base: './'})
    // Remove individual page scripts and replace with minified versions.
    .pipe($.replace(/^<!-- build:site-scripts -->[^]*<!-- endbuild -->$/m,
      '<script src="scripts/site-libs.js"></script>\n<script src="scripts/site-scripts.js"></script>'));

  var otherAssetStream = gulp.src([
    IOWA.appDir + '/*.{html,txt,ico}',
    IOWA.appDir + '/clear_cache.html',
    IOWA.appDir + '/styles/**.css',
    IOWA.appDir + '/styles/pages/upgrade.css',
    IOWA.appDir + '/styles/pages/permissions.css',
    IOWA.appDir + '/styles/pages/error.css',
    IOWA.appDir + '/elements/**/images/*',
    IOWA.appDir + '/bower_components/webcomponentsjs/webcomponents-lite.min.js',
    IOWA.appDir + '/bower_components/webcomponentsjs/webcomponents.min.js',
    IOWA.appDir + '/bower_components/es6-promise/dist/es6-promise.min.js'
  ], {base: './'});

  return merge(templateStream, otherAssetStream)
    .pipe(gulp.dest(IOWA.distDir))
    .pipe($.size({title: 'copy-assets'}));
});

gulp.task('concat-and-uglify-js', 'Crush JS', ['eslint', 'generate-page-metadata'], function() {
  var siteLibs = [
    'bower_components/moment/min/moment.min.js',
    'bower_components/moment-timezone/builds/moment-timezone-with-data.min.js',
    'bower_components/es6-promise/dist/es6-promise.min.js',
    'bower_components/firebase/firebase.js',
    'bower_components/js-crc/src/crc.js'
  ].map(script => `${IOWA.appDir}/${script}`);

  var siteLibStream = gulp.src(siteLibs)
    .pipe(reload({stream: true, once: true}))
    .pipe($.concat('site-libs.js'));

  // The ordering of the scripts in the gulp.src() array matter!
  // This order needs to match the order in templates/layout_full.html
  var siteScripts = [
    'main.js',
    'pages.js',
    'helper/util.js',
    'helper/auth.js',
    'helper/page-animation.js',
    'helper/elements.js',
    'helper/firebase.js',
    'helper/a11y.js',
    'helper/service-worker-registration.js',
    'helper/router.js',
    'helper/request.js',
    'helper/picasa.js',
    'helper/simple-db.js',
    'helper/notifications.js',
    'helper/schedule.js',
    'bootstrap.js'
  ].map(script => `${IOWA.appDir}/scripts/${script}`);

  var siteScriptStream = gulp.src(siteScripts)
    .pipe(reload({stream: true, once: true}))
    .pipe($.babel({
      presets: ['es2015'],
      compact: false
    }))
    .pipe($.concat('site-scripts.js'));

  // analytics.js is loaded separately and shouldn't be concatenated.
  var analyticsScriptStream = gulp.src([IOWA.appDir + '/scripts/analytics.js']);

  var serviceWorkerScriptStream = gulp.src([
    IOWA.appDir + '/bower_components/sw-toolbox/sw-toolbox.js',
    IOWA.appDir + '/scripts/helper/simple-db.js',
    IOWA.appDir + '/scripts/sw-toolbox/*.js'
  ])
    .pipe(reload({stream: true, once: true}))
    .pipe($.concat('sw-toolbox-scripts.js'));

  return merge(siteScriptStream, siteLibStream).add(analyticsScriptStream).add(serviceWorkerScriptStream)
    .pipe($.uglify({preserveComments: 'some'}).on('error', function() {}))
    .pipe(gulp.dest(IOWA.distDir + '/' + IOWA.appDir + '/scripts'))
    .pipe($.size({title: 'concat-and-uglify-js'}));
});

gulp.task('generate-data-worker-dist', 'Generate data-worker.js for /dist.', function() {
  // Only run our own scripts through babel.
  var ownScriptsFilter = $.filter(
    file => new RegExp(`${IOWA.appDir}/scripts/`).test(file.path),
    {restore: true});

  return gulp.src(dataWorkerScripts)
    .pipe(ownScriptsFilter)
    .pipe($.babel({
      presets: ['es2015'],
      compact: false
    }))
    .pipe(ownScriptsFilter.restore)
    .pipe($.concat('data-worker-scripts.js'))
    .pipe($.uglify({preserveComments: 'some'}).on('error', function() {}))
    .pipe(gulp.dest(IOWA.distDir + '/' + IOWA.appDir))
    .pipe($.size({title: 'data-worker-dist'}));
});

gulp.task('generate-service-worker-dist', 'Generate prod service worker', function(callback) {
  var distDir = path.join(IOWA.distDir, IOWA.appDir);
  del.sync([distDir + '/service-worker.js']);
  var importScripts = ['scripts/sw-toolbox-scripts.js'];

  generateServiceWorker(distDir, true, importScripts, function(error, serviceWorkerFileContents) {
    if (error) {
      return callback(error);
    }
    fs.writeFile(distDir + '/service-worker.js', serviceWorkerFileContents, function(error) {
      if (error) {
        return callback(error);
      }
      callback();
    });
  });
});

gulp.task('sass', 'Compile SASS files', function() {
  var sassOpts = {
    outputStyle: 'compressed'
  };

  return gulp.src([IOWA.appDir + '/{styles,elements}/**/*.scss'])
    .pipe($.sass(sassOpts))
    .pipe($.changed(IOWA.appDir + '/{styles,elements}', {extension: '.scss'}))
    .pipe($.autoprefixer(AUTOPREFIXER_BROWSERS))
    .pipe(gulp.dest(IOWA.appDir))
    .pipe($.size({title: 'styles'}));
});

gulp.task('images', 'Optimize image assets', function() {
  return gulp.src([
    IOWA.appDir + '/images/**/*'
  ])
    .pipe($.cache($.imagemin({
      progressive: true,
      interlaced: true
    })))
    .pipe(gulp.dest(IOWA.distDir + '/' + IOWA.appDir + '/images'))
    .pipe($.size({title: 'images'}));
});

// vulcanize main site elements separately.
gulp.task('vulcanize-elements', false, ['sass'], function() {
  return gulp.src([
    IOWA.appDir + '/elements/elements.html'
  ])
    .pipe($.vulcanize({
      stripComments: true,
      inlineCss: true,
      inlineScripts: true,
      dest: IOWA.appDir + '/elements'
    }))
    .pipe($.crisper({scriptInHead: true}))
    .pipe(gulp.dest(IOWA.distDir + '/' + IOWA.appDir + '/elements/'));
});

// vulcanize embed gadget.
gulp.task('vulcanize-gadget-elements', false, ['sass'], function() {
  return gulp.src([
    IOWA.appDir + '/elements/embed-elements.html'
  ])
    .pipe($.vulcanize({
      stripComments: true,
      inlineCss: true,
      inlineScripts: true,
      dest: IOWA.appDir + '/elements'
    }))
    .pipe($.crisper({scriptInHead: true}))
    .pipe(gulp.dest(IOWA.distDir + '/' + IOWA.appDir + '/elements/'));
});

// vulcanize extended form elements separately.
gulp.task('vulcanize-extended-elements', false, ['sass'], function() {
  return gulp.src([
    IOWA.appDir + '/elements/io-extended-form.html'
  ])
    .pipe($.vulcanize({
      stripComments: true,
      inlineCss: true,
      inlineScripts: true,
      dest: IOWA.appDir + '/elements',
      excludes: [ // These are registered in the main site vulcanized bundle.
        'polymer.html$',
        'core-icon.html$',
        'core-iconset-svg.html$',
        'core-shared-lib.html$',
        'paper-button.html$'
      ]
    }))
    .pipe($.crisper({scriptInHead: true}))
    .pipe(gulp.dest(IOWA.distDir + '/' + IOWA.appDir + '/elements/'));
});

// -----------------------------------------------------------------------------
// Frontend dev tasks

gulp.task('eslint', 'Lint main site JS', function() {
  return gulp.src([
    '*.js',
    'gulp_scripts/**/*.js',
    IOWA.appDir + '/scripts/**/*.js',
    IOWA.appDir + '/elements/**/*.js',

    // Exclude any third-party code.
    '!/**/third-party/**/*.js'
  ])
    .pipe($.eslint())
    .pipe($.eslint.format())
    .pipe($.eslint.failAfterError());
});

gulp.task('generate-data-worker-dev', 'Generate data-worker.js for dev', function() {
  return gulp.src(dataWorkerScripts)
    .pipe($.concat('data-worker-scripts.js'))
    .pipe(gulp.dest(IOWA.appDir))
    .pipe($.size({title: 'data-worker-dev'}));
});

gulp.task('generate-service-worker-dev', 'Generate service worker for dev', ['sass'], function(callback) {
  del.sync([IOWA.appDir + '/service-worker.js']);
  var importScripts = glob.sync('scripts/sw-toolbox/*.js', {cwd: IOWA.appDir});
  importScripts.unshift('scripts/helper/simple-db.js');
  importScripts.unshift('bower_components/sw-toolbox/sw-toolbox.js');

  generateServiceWorker(IOWA.appDir, !!argv['fetch-dev'], importScripts, function(error, serviceWorkerFileContents) {
    if (error) {
      return callback(error);
    }
    fs.writeFile(IOWA.appDir + '/service-worker.js', serviceWorkerFileContents, function(error) {
      if (error) {
        return callback(error);
      }
      callback();
    });
  });
}, {
  options: {
    'fetch-dev': 'generates the SW to handle fetch events. Without this flag, resources will be precached but not actually served. This is preferable for dev and to make live reload work as expected)'
  }
});

// Generate pages.js from templates
gulp.task('generate-page-metadata', false, function(done) {
  var pagesjs = fs.openSync(IOWA.appDir + '/scripts/pages.js', 'w');
  var proc = spawn('go', ['run', 'util/gen-pages.go'], {stdio: ['ignore', pagesjs, process.stderr]});
  proc.on('exit', done);
});

// -----------------------------------------------------------------------------
// Backend stuff

gulp.task('backend:test', 'Run backend tests', ['backend:config'], function(done) {
  var opts = {gae: argv.gae, watch: argv.watch, test: argv.test};
  backend.test(opts, done);
}, {
  options: {
    'watch': 'watch for changes and run tests in an infinite loop',
    'gae': 'test GAE version',
    'test TestMethodPattern': 'run specific tests provide'
  }
});

gulp.task('backend:build', 'Build self-sufficient backend server binary w/o GAE support', backend.build);

gulp.task('backend:dist', 'Copy backend files to dist', function(done) {
  backend.copy(argv.env || 'prod', done);
}, {
  options: {
    env: 'App environment: "dev", "stage" or "prod". Defaults to "prod".'
  }
});

gulp.task('backend:config', 'Generates server.config', function() {
  backend.generateServerConfig(IOWA.backendDir, argv.env || 'dev');
}, {
  options: {
    env: 'App environment: "dev", "stage" or "prod". Defaults to "dev".'
  }
});

gulp.task('backend:gaeconfig', 'Generates GAE config files like app.yaml', function(done) {
  backend.generateGAEConfig(IOWA.backendDir, done);
});

gulp.task('decrypt', 'Decrypt backend/server.config.enc into backend/server.config', function(done) {
  backend.decrypt(argv.pass, done);
}, {
  options: {
    pass: 'Provide a pass phrase'
  }
});

gulp.task('encrypt', 'Encrypt backend/server.config into backend/server.config.enc.', function(done) {
  backend.encrypt(argv.pass, done);
}, {
  options: {
    pass: 'Provide a pass phrase'
  }
});

// Start a standalone server (no GAE SDK needed) serving both front-end and backend,
// watch for file changes and live-reload when needed.
// If you don't want file watchers and live-reload, use '--no-watch' option.
// App environment is 'dev' by default. Change with '--env=prod'.
gulp.task('serve', 'Starts a standalone server with live-reload', ['backend:build', 'backend:config', 'sass', 'generate-page-metadata', 'generate-data-worker-dev', 'generate-service-worker-dev'], function(done) {
  var opts = {dir: IOWA.backendDir, watch: argv.watch !== false, reload: argv.reload};
  var url = backend.serve(opts, done);
  openUrl(url);
  if (argv.watch) {
    watch();
  }
}, {
  options: {
    'no-watch': 'Starts the server w/o file watchers and live-reload',
    'env': 'App environment: "dev", "stage" or "prod". Defaults to "dev".',
    'open': 'Opens a new browser tab to the app'
  }
});

gulp.task('serve:gae', 'Same as the "serve" task but uses GAE dev appserver', ['backend:config', 'backend:gaeconfig', 'sass', 'generate-page-metadata', 'generate-data-worker-dev', 'generate-service-worker-dev'], function(done) {
  var url = backend.serveGAE({dir: IOWA.backendDir, reload: argv.reload}, done);
  // give GAE server some time to start
  setTimeout(openUrl.bind(null, url, null, null), 1000);
  if (argv.watch !== false) {
    watch();
  }
}, {
  options: {
    'no-watch': 'Starts the server w/o file watchers and live-reload',
    'env': 'App environment: "dev", "stage" or "prod". Defaults to "dev".',
    'open': 'Opens a new browser tab to the app'
  }
});

gulp.task('serve:dist', 'Serves built app with GAE dev appserver (no file watchers, like production)', ['default'], function(done) {
  var backendDir = path.join(IOWA.distDir, IOWA.backendDir);
  var url = backend.serveGAE({dir: backendDir}, done);
  // give GAE server some time to start
  setTimeout(openUrl.bind(null, url, null, null), 1000);
}, {
  options: {
    open: 'Opens a new browser tab to the app'
  }
});

// -----------------------------------------------------------------------------
// Utils

// Watch file changes and reload running server or rebuild stuff.
function watch() {
  createReloadServer();
  gulp.watch([IOWA.appDir + '/**/*.html'], reload);
  gulp.watch([IOWA.appDir + '/{elements,styles}/**/*.{scss,css}'], ['sass', reload]);
  gulp.watch([IOWA.appDir + '/scripts/**/*.js'], ['jshint']);
  gulp.watch([IOWA.appDir + '/images/**/*'], reload);
  gulp.watch([IOWA.appDir + '/bower.json'], ['bower']);
  gulp.watch(dataWorkerScripts, ['generate-data-worker-dev']);
}

// -----------------------------------------------------------------------------
// Other fun stuff

// Usage: gulp screenshots [--compareTo=branchOrCommit] [--pages=page1,page2,...]
//                       [widths=width1,width2,...] [height=height]
// The task performs a `git stash` prior to the checkout and then a `git stash pop` after the
// completion, but on the off chance the task ends unexpectedly, you can manually switch back to
// your current branch and run `git stash pop` to restore.
gulp.task('screenshots', 'Screenshot diffing', ['backend:build'], function(callback) {
  var seleniumScreenshots = require('./gulp_scripts/screenshots');
  // We don't want the service worker to served cached content when taking screenshots.
  del.sync([IOWA.appDir + '/service-worker.js']);

  var styleWatcher = gulp.watch([IOWA.appDir + '/{elements,styles}/**/*.{scss,css}'], ['sass']);
  var callbackWrapper = function(error) {
    styleWatcher.end();
    callback(error);
  };

  var allPages = glob.sync(IOWA.appDir + '/templates/!(layout_).html').map(function(templateFile) {
    return path.basename(templateFile).replace('.html', '');
  });

  var branchOrCommit = argv.compareTo || 'master';
  var pages = argv.pages ? argv.pages.split(',') : allPages;
  var widths = [400, 900, 1200];
  if (argv.widths) {
    // widths is coerced into a Number unless there's a comma, and only strings can be split().
    widths = argv.widths.split ? argv.widths.split(',').map(Number) : [argv.widths];
  }
  var height = argv.height || 9999;
  seleniumScreenshots(branchOrCommit, IOWA.appDir, 'http://localhost:9999' + IOWA.urlPrefix + '/',
    pages, widths, height, callbackWrapper);
}, {
  options: {
    'compareTo=branchOrCommit': '',
    'pages=page1,page2,...': '',
    'widths=width1,width2,...': '',
    'height=height': ''
  }
});

gulp.task('sitemap', 'Generate sitemap.xml. Not currently used as we\'re generating one dynamically on the backend.', function() {
  gulp.src(IOWA.appDir + '/templates/!(layout_|error).html', {read: false})
    .pipe($.rename(function(path) {
      if (path.basename === 'home') {
        path.basename = '/'; // homepage is served from root.
      }
      path.extname = ''; // remove .html from URLs.
    }))
    .pipe($.sitemap({
      siteUrl: IOWA.originProd + IOWA.urlPrefix,
      changefreq: 'weekly',
      spacing: '  ',
      mappings: [{
        pages: [''], // homepage should be more frequent
        changefreq: 'daily'
      }]
    }))
    .pipe(gulp.dest(IOWA.appDir));
});

gulp.task('pagespeed', `Run PageSpeed Insights against ${IOWA.originProd + IOWA.urlPrefix}`, pagespeed.bind(null, {
  // By default, we use the PageSpeed Insights
  // free (no API key) tier. You can use a Google
  // Developer API key if you have one. See
  // http://goo.gl/RkN0vE for info key: 'YOUR_API_KEY'
  url: IOWA.originProd + IOWA.urlPrefix,
  strategy: 'mobile'
}));
