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

var swPrecache = require('sw-precache');
var util = require('gulp-util');

module.exports = function(rootDir, handleFetch, importScripts, callback) {
  var templateDir = rootDir + '/templates/';
  var dynamicUrlToDependencies = {
    './': [templateDir + 'layout_full.html']
  };

  // This should be kept in sync with the named <lazy-pages> at
  // https://github.com/GoogleChrome/ioweb2016/blob/master/app/templates/layout_full.html
  var routes = ['home', 'about', 'onsite', 'offsite', 'schedule', 'faq'];
  var navigateFallbackWhitelist = routes.map(function(route) {
    return new RegExp('/' + route + '$');
  });

  var config = {
    cacheId: 'iowebapp2016',
    dynamicUrlToDependencies: dynamicUrlToDependencies,
    handleFetch: handleFetch,
    importScripts: importScripts,
    logger: util.log,
    navigateFallback: './',
    navigateFallbackWhitelist: navigateFallbackWhitelist,
    staticFileGlobs: [
      rootDir + '/bower_components/**/*.{html,js,css}',
      rootDir + '/elements/**',
      rootDir + '/fonts/**',
      // Add in additional subdirectories as more phases launch.
      rootDir + '/images/{home,touch}/**/*',
      rootDir + '/images/*',
      rootDir + '/scripts/**',
      rootDir + '/styles/**/*.css',
      rootDir + '/manifest.json',
      rootDir + '/humans.txt',
      rootDir + '/favicon.ico',
      rootDir + '/data-worker-scripts.js'
    ],
    stripPrefix: rootDir + '/',
    verbose: true
  };

  swPrecache.generate(config, callback);
};
