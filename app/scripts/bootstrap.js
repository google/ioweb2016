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
    var onload = function() {
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

  function afterImports() {
    IOWA.Router = IOWA.Router_(window); // eslint-disable-line new-cap
    IOWA.Elements.init();
    IOWA.Router.init(IOWA.Elements.Template);
    IOWA.Notifications.init();

    initWorker();
  }

  // TODO: fix when new page elements have these hooks.
  // window.addEventListener('keydown', function(e) {
  //   // ESC closes any overlays.
  //   if (e.keyCode === 27) {
  //     var template = IOWA.Elements.Template;
  //     if (template.app.fullscreenVideoActive) {
  //       if (template.closeVideoCard) {
  //         template.closeVideoCard();
  //       }
  //       if (template.closeVideoSection) {
  //         template.closeVideoSection();
  //       }
  //     }
  //     if (template.mapGalleryActive) {
  //       template.closeMapGallery();
  //     }
  //   }
  // });

  window.addEventListener('resize', function() {
    IOWA.Elements.Template.debounce('resize', function() {
      this.closeDrawer();
      // remove fab sticky scrolling behavior for mobile. Add for desktop.
      this.initFabScroll();
      this.initDrawer();
    }, 400);
  });

  window.addEventListener('offline', function() {
    IOWA.Elements.Toast.showMessage(
        'Offline. Changes you make to My Schedule will be saved for later.');
  });

  // Watch for sign-in changes to fetch user schedule, update UI, etc.
  window.addEventListener('signin-change', function(e) {
    if (e.detail.signedIn) {
      // Authorize the user to Firebase.
      var user = e.detail.user;
      IOWA.IOFirebase.auth(user.id, user.tokenResponse.access_token);

      // Check to see if there are any failed session modification requests, and
      // if so, replay them before fetching the user schedule.
      IOWA.Schedule.replayQueuedRequests().then(IOWA.Schedule.loadUserSchedule.bind(IOWA.Schedule));

      // If the user hasn't denied notifications permission in the current browser,
      // and the user has notifications turned on globally (i.e. in at least one other browser),
      // and there isn't already a subscription in the current browser, then try to enable
      // notifications in the current browser.
      if (window.Notification.permission !== 'denied') {
        IOWA.Notifications.isNotifyEnabledPromise().then(function(isGlobalNotificationsEnabled) {
          if (isGlobalNotificationsEnabled) {
            IOWA.Notifications.isExistingSubscriptionPromise().then(function(isLocalSubscription) {
              if (!isLocalSubscription) {
                IOWA.Notifications.subscribePromise();
              }
            });
          }
        });
      }
    } else {
      IOWA.IOFirebase.unAuth();
      IOWA.Schedule.clearUserSchedule();
    }
  });

  lazyLoadWCPolyfillsIfNecessary();

  if (IOWA.Util.supportsHTMLImports) {
    afterImports();
  } else {
    document.addEventListener('HTMLImportsLoaded', afterImports);
  }

  // See https://developers.google.com/web/fundamentals/engage-and-retain/app-install-banners/advanced
  window.addEventListener('beforeinstallprompt', function(event) {
    IOWA.Analytics.trackEvent('installprompt', 'fired');

    event.userChoice.then(function(choiceResult) {
      // choiceResult.outcome will be 'accepted' or 'dismissed'.
      // choiceResult.platform will be 'web' or 'android' if the prompt was
      // accepted, or '' if the prompt was dismissed.
      IOWA.Analytics.trackEvent('installprompt', 'userChoice',
        choiceResult.outcome, choiceResult.platform);
    });
  });
})();
