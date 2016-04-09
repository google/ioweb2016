/**
 * Copyright 2015 Google Inc. All rights reserved.
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

var fs = require('fs');
var spawn = require('child_process').spawn;

var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var browserSync = require('browser-sync');

var IOWA = require('../package.json').iowa;

/** Prepare backend for deployment.
 *
 * @param {string} appenv App environment: 'dev', 'stage' or 'prod'.
 * @param {function} callback Callback function.
 */
function dist(appenv, callback) {
  gulp.src([
    IOWA.backendDir + '/**/*.go',
    IOWA.backendDir + '/*.yaml',
    IOWA.backendDir + '/*.config',
    IOWA.backendDir + '/h2preload.json'
  ], {base: './'})
  .pipe(gulp.dest(IOWA.distDir))
  .on('end', function() {
    var destBackend = [IOWA.distDir, IOWA.backendDir].join('/');
    // ../app <= dist/backend/app
    fs.symlinkSync('../' + IOWA.appDir, destBackend + '/' + IOWA.appDir);
    // create server and GAE config files for the right env
    generateConfig(destBackend, appenv, callback);
  });
}

/**
 * Start GAE-based backend server.
 *
 * @param {Object} opts Server options.
 * @param {number=} opts.port The port number to bind internal server to.
 * @param {string} opts.dir CWD of the spawning server process.
 * @param {bool} opts.reload Use BrowserSync to reload page on file changes.
 * @param {function} callback Callback function.
 * @return {string} URL of the externally facing server.
 */
function serve(opts, callback) {
  var port = opts.port || (opts.reload ? '8080' : '3000');
  var serverAddr = 'localhost:' + port;
  var url = 'http://' + serverAddr + IOWA.urlPrefix;
  var args = [
    opts.dir,
    '--port', port,
    '--datastore_path', IOWA.backendDir + '/.gae_datastore'
  ];

  var backend = spawn('dev_appserver.py', args, {stdio: 'inherit'});
  if (!opts.reload) {
    console.log('The app should now be available at: ' + url);
    backend.on('close', callback);
    return url;
  }

  browserSync.emitter.on('service:exit', callback);
  browserSync({notify: false, open: false, port: 3000, proxy: serverAddr});
  return 'http://localhost:3000' + IOWA.urlPrefix;
}

/**
 * Create both app (server) and GAE config files.
 * A handy wrapper for generateServerConfig and generateGAEConfig.
 *
 * @param {string} dest Output directory.
 * @param {string} appenv App environment: 'dev', 'stage' or 'prod'.
 * @param {function} callback Callback function.
 */
function generateConfig(dest, appenv, callback) {
  generateServerConfig(dest, appenv);
  generateGAEConfig(dest, callback);
}

/**
 * Create or update server config.
 *
 * @param {string} dest Output directory.
 * @param {string} appenv App environment: 'dev', 'stage' or 'prod'.
 */
function generateServerConfig(dest, appenv) {
  dest = (dest || IOWA.backendDir) + '/server.config';
  appenv = appenv || 'dev';

  var files = [
    IOWA.backendDir + '/server.config.' + appenv,
    IOWA.backendDir + '/server.config.template'
  ];
  var src;
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (fs.existsSync(f)) {
      src = f;
      break;
    }
  }
  if (!src) {
    throw new Error('generateServerConfig: unable to find config template');
  }

  var cfg = JSON.parse(fs.readFileSync(src, 'utf8'));
  cfg.prefix = IOWA.urlPrefix;
  fs.writeFileSync(dest, JSON.stringify(cfg, null, 2));
}

/**
 * Create GAE config files, app.yaml and cron.yaml.
 *
 * @param {string} dest Output directory.
 * @param {function} callback Callback function.
 */
function generateGAEConfig(dest, callback) {
  var files = [
    IOWA.backendDir + '/app.yaml.template',
    IOWA.backendDir + '/cron.yaml.template'
  ];
  gulp.src(files, {base: IOWA.backendDir})
    .pipe($.replace(/\$PREFIX\$/g, IOWA.urlPrefix))
    .pipe($.rename({extname: ''}))
    .pipe(gulp.dest(dest))
    .on('end', callback);
}

/**
 * Install backend dependencies.
 *
 * @param {function} callback Callback function.
 */
function installDeps(callback) {
  // additional argument is required because it is imported in files
  // hidden by +appengine build tag and not visible to the standard "go get" command.
  var args = ['get', '-d', './' + IOWA.backendDir + '/...', 'google.golang.org/appengine'];
  spawn('go', args, {stdio: 'inherit'}).on('exit', callback);
}

/**
 * Decrypt backend/server.config.enc into backend/server.config.
 *
 * @param {string=} passphrase Passphrase for openssl command.
 * @param {function} callback Callback function.
 */
function decrypt(passphrase, callback) {
  var tarFile = IOWA.backendDir + '/config.tar';
  var args = ['aes-256-cbc', '-d', '-in', tarFile + '.enc', '-out', tarFile];
  if (passphrase) {
    args.push('-pass', 'pass:' + passphrase);
  }
  spawn('openssl', args, {stdio: 'inherit'}).on('exit', function(code) {
    if (code !== 0) {
      callback(code);
      return;
    }
    spawn('tar', ['-x', '-f', tarFile, '-C', IOWA.backendDir], {stdio: 'inherit'})
      .on('exit', fs.unlink.bind(fs, tarFile, callback));
  });
}

/**
 * Encrypt backend/server.config into backend/server.config.enc.
 *
 * @param {string=} passphrase Passphrase for openssl command.
 * @param {function} callback Callback function.
 */
function encrypt(passphrase, callback) {
  var tarFile = IOWA.backendDir + '/config.tar';
  var tarArgs = ['-c', '-f', tarFile, '-C', IOWA.backendDir,
    'server.config.dev',
    'server.config.stage',
    'server.config.prod'
  ];

  spawn('tar', tarArgs, {stdio: 'inherit'}).on('exit', function(code) {
    if (code !== 0) {
      callback(code);
      return;
    }
    var args = ['aes-256-cbc', '-in', tarFile, '-out', tarFile + '.enc'];
    if (passphrase) {
      args.push('-pass', 'pass:' + passphrase);
    }
    spawn('openssl', args, {stdio: 'inherit'})
      .on('exit', fs.unlink.bind(fs, tarFile, callback));
  });
}

module.exports = {
  serve: serve,
  dist: dist,
  decrypt: decrypt,
  encrypt: encrypt,
  installDeps: installDeps,
  generateConfig: generateConfig
};
