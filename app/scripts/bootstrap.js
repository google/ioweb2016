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

(function() {
  var PROMISE_REJECTION_LOGGING_DELAY = 10 * 1000; // 10s
  var logRejectionTimeoutId;
  var unhandledRejections = [];

  function logRejectedPromises() {
    unhandledRejections.forEach(({reason}) =>
        IOWA.Analytics.trackError('UnhandledPromiseRejection', reason));

    unhandledRejections = [];
    logRejectionTimeoutId = null;
  }

  window.addEventListener('unhandledrejection', function(event) {
    debugLog('unhandledrejection fired: ' + event.reason);
    // Keep track of rejected promises by adding them to the list.
    unhandledRejections.push({promise: event.promise, reason: event.reason});

    // We need to wait before we log this rejected promise, since there's a
    // chance it will be caught later on, in which case it's not an error.
    if (!logRejectionTimeoutId) {
      logRejectionTimeoutId = setTimeout(logRejectedPromises,
        PROMISE_REJECTION_LOGGING_DELAY);
    }
  });

  window.addEventListener('rejectionhandled', function(event) {
    debugLog('rejectionhandled fired: ' + event.reason);

    // If a previously rejected promise is handled, remove it from the list.
    unhandledRejections = unhandledRejections.filter(rejection =>
        rejection.promise !== event.promise);
  });

  function initWorker() {
    var MAX_WORKER_TIMEOUT_ = 10 * 1000; // 10s
    var worker;

    var doMetrics = window.performance && window.performance.now;

    if (doMetrics) {
      var workerStartTime = window.performance.now();
      worker = new Worker('data-worker-scripts.js');
      var total = window.performance.now() - workerStartTime;

      debugLog('worker startup:', total, 'ms');
      IOWA.Analytics.trackPerf('worker', 'creation', Math.ceil(total),
                               null, MAX_WORKER_TIMEOUT_);
    } else {
      worker = new Worker('data-worker-scripts.js');
    }

    var workerFetchTime;
    if (doMetrics) {
      workerFetchTime = window.performance.now();
    }

    worker.addEventListener('message', function(e) {
      if (!e.data) {
        return;
      }

      var data = e.data;
      if (data.scheduleData) {
        // Report how long the worker fetch took to GA.
        if (doMetrics) {
          var total = window.performance.now() - workerFetchTime;
          debugLog('worker fetch:', total, 'ms');
          IOWA.Analytics.trackPerf('worker', 'data fetch', Math.ceil(total),
                                   null, MAX_WORKER_TIMEOUT_);
        }

        IOWA.Schedule.resolveSchedulePromise(data);
      }
    });

    worker.postMessage({cmd: 'FETCH_SCHEDULE'});
  }

  function lazyLoadWCPolyfillsIfNecessary() {
    const onload = function() {
      // For native Imports, manually fire WCR so user code
      // can use the same code path for native and polyfill'd imports.
      if (!window.HTMLImports) {
        document.dispatchEvent(
            new CustomEvent('WebComponentsReady', {bubbles: true}));
      }
    };

    var webComponentsSupported = (
      'registerElement' in document &&
      'import' in document.createElement('link') &&
      'content' in document.createElement('template'));
    if (webComponentsSupported) {
      onload();
    } else {
      var script = document.createElement('script');
      script.async = true;
      script.src = 'bower_components/webcomponentsjs/webcomponents-lite.min.js';
      script.onload = onload;
      document.head.appendChild(script);
    }
  }

  function removeSplashScreen() {
    var splash = document.getElementById('splash');
    splash.addEventListener('transitionend', function() {
      splash.parentElement.removeChild(splash);
    });

    document.body.classList.remove('loading');
  }

  function afterCriticalImports() {
    Polymer.Base.importHref('/io2016/elements/elements.html', function() {
      IOWA.Elements.onElementsBundleLoaded();

      // Note: this is also done in <io-notifications-widget>'s ready,
      // but we need this code to run before that element is attached.
      if (IOWA.Notifications && !IOWA.Notifications.supported) {
        document.body.classList.add('nosupport-notifications');
      }

      removeSplashScreen();

      var fp = IOWA.Util.getFPIfSupported();
      if (fp) {
        debugLog('first paint:', fp, 'ms');
        IOWA.Analytics.trackPerf('load', 'firstpaint', fp);
      }
    }, null, true);

    IOWA.Schedule.loadCachedUserSchedule();
  }

  window.addEventListener('keydown', function(e) {
    // ESC closes any overlays.
    if (e.keyCode === 27) {
      var subnav = document.querySelector('io-schedule-subnav');
      if (subnav) {
        subnav.closeFilters();
      }

      var live = document.querySelector('io-live');
      if (live) {
        live.closeFab();
      }
    }
  });

  window.addEventListener('resize', function() {
    // FF mobile sends resize event on page load. Be careful!
    if (IOWA.Elements && IOWA.Elements.Template &&
        IOWA.Elements.Template.debounce) {
      IOWA.Elements.Template.debounce('resize', function() {
        this.closeDrawer();
        // remove fab sticky scrolling behavior for mobile. Add for desktop.
        this.initFabScroll();
      }, 400);
    }
  });

  window.addEventListener('offline', function() {
    if (IOWA.Elements && IOWA.Elements.Toast) {
      IOWA.Elements.Toast.showMessage(
        'Offline. Changes you make to My Schedule will be saved for later.');
    }
  });

  // See https://developers.google.com/web/fundamentals/engage-and-retain/app-install-banners/advanced
  window.addEventListener('beforeinstallprompt', function(event) {
    IOWA.Analytics.trackEvent('installprompt', 'fired');

    event.userChoice.then(function(choiceResult) {
      // choiceResult.outcome will be 'accepted' or 'dismissed'.
      // choiceResult.platform will be 'web' or 'android' if the prompt was
      // accepted, or '' if the prompt was dismissed.
      IOWA.Analytics.trackEvent('installprompt', choiceResult.outcome,
        choiceResult.platform);
    });
  });

  function initApp() {
    IOWA.Router = IOWA.Router_(window); // eslint-disable-line new-cap
    IOWA.Elements.init();
    IOWA.Router.init(IOWA.Elements.Template);

    initWorker(); // Kick off fetching master schedule asap.

    lazyLoadWCPolyfillsIfNecessary();

    // Wait for critical.html to load if we don't have native HTML imports.
    // Can't use Polymer.RenderStatus.whenReady() b/c potentially, we have
    // to wait for the polyfills to load (above) and the critical.html to
    // load so Polymer is defined. Instead, wait for HTMLImportsLoaded if
    // we're in a polyfilled browser (but go right away if Imports are native).
    if (IOWA.Util.supportsHTMLImports) {
      afterCriticalImports();
    } else {
      document.addEventListener('HTMLImportsLoaded', afterCriticalImports);
    }
  }

  initApp();
})();
