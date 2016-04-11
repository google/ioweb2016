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

IOWA.ServiceWorkerRegistration = (function() {
  'use strict';

  // Ensure we only attempt to register the SW once.
  let isAlreadyRegistered = false;

  const URL = 'service-worker.js';
  const SCOPE = './';

  const register = function() {
    if (!isAlreadyRegistered) {
      isAlreadyRegistered = true;

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register(URL, {
          scope: SCOPE
        }).then(function(registration) {
          registration.onupdatefound = function() {
            // The updatefound event implies that registration.installing is set; see
            // https://slightlyoff.github.io/ServiceWorker/spec/service_worker/index.html#service-worker-container-updatefound-event
            const installingWorker = registration.installing;
            installingWorker.onstatechange = function() {
              switch (installingWorker.state) {
                case 'installed':
                  if (!navigator.serviceWorker.controller) {
                    IOWA.Elements.Toast.showMessage(
                        'Caching complete! Future visits will work offline.');
                  }
                  break;

                case 'redundant':
                  throw Error('The installing service worker became redundant.');
              }
            };
          };
        }).catch(function(e) {
          IOWA.Analytics.trackError('navigator.serviceWorker.register() error', e);
          console.error('Service worker registration failed:', e);
        });
      }
    }
  };

  // Check to see if the service worker controlling the page at initial load
  // has become redundant, since this implies there's a new service worker with fresh content.
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.onstatechange = function(event) {
      if (event.target.state === 'redundant') {
        // Define a handler that will be used for the next io-toast tap, at which point it
        // be automatically removed.
        const tapHandler = function() {
          window.location.reload();
        };

        IOWA.Elements.Toast.showMessage(
            'Tap here or refresh the page for the latest content.', tapHandler);
      }
    };
  }

  return {
    register,
    URL,
    SCOPE
  };
})();
