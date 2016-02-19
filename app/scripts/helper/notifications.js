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

window.IOWA = window.IOWA || {};

IOWA.Notifications = IOWA.Notifications || (function() {
  'use strict';

  /**
   * Disables push notifications globally for the current user.
   * @return {Promise} Resolves when complete, or rejects if there was an error
   * writing to Firebase.
   */
  var disableNotificationsPromise = function() {
    return IOWA.IOFirebase.setNotificationsEnabled(false);
  };

  /**
   * {boolean} Whether the browser supports all the prerequisites for using push notifications.
   */
  var isSupported = Boolean(window.ServiceWorkerRegistration &&
      window.ServiceWorkerRegistration.prototype.showNotification &&
      window.PushManager &&
      window.Notification);

  /**
   * Checks whether the logged in user has notifications enabled globally on our backend.
   * @return {Promise} Resolves with the boolean value of the user's backend notification state.
   */
  var isNotifyEnabledPromise = function() {
    return IOWA.IOFirebase.hasNotificationsEnabled().catch(IOWA.Util.reportError);
  };

  /**
   * Checks whether the current browser already has a push subscription.
   * @return {Promise} Resolves with true if there's an existing subscription, or false otherwise.
   */
  var isExistingSubscriptionPromise = function() {
    return navigator.serviceWorker.ready.then(function(registration) {
      return registration.pushManager.getSubscription();
    }).then(function(subscription) {
      if (subscription && subscription.endpoint) {
        return true;
      }
      return false;
    }).catch(IOWA.Util.reportError);
  };

  /**
   * Ensures that there's a push subscription active for the current browser, and then passes along
   * the info to Firebase.
   * @param {boolean} rejectImmediately Whether this function should return a rejected promise right
   *                                    away. Useful for when we want to keep the same promise-based
   *                                    flow but to bail out early.
   * @return {Promise} Resolves with notify endpoint response body on success.
   */
  var subscribePromise = function(rejectImmediately) {
    if (rejectImmediately) {
      return Promise.reject();
    }

    return navigator.serviceWorker.ready.then(function(registration) {
      return registration.pushManager.subscribe({
        // Legacy support for userVisible; see https://github.com/w3c/push-api/issues/137
        userVisible: true,
        userVisibleOnly: true
      });
    }).then(function(subscription) {
      if (subscription && subscription.endpoint) {
        // See https://groups.google.com/a/chromium.org/d/msg/blink-dev/CK13omVO5ds/fR6sdPxsaasJ
        var endpoint = subscription.endpoint;
        if (subscription.subscriptionId && !endpoint.includes(subscription.subscriptionId)) {
          subscription.endpoint += '/' + subscription.subscriptionId;
        }
        // If subscribing succeeds, send the subscription to the server. Return a resolved promise.
        return Promise.all(
          IOWA.IOFirebase.setNotificationsEnabled(true),
          IOWA.IOFirebase.addPushSubscription(subscription)
        );
      }
      throw Error('Unable to subscribe due to an unknown error.');
    });
  };

  /**
   * Unsubscribe the push subscription for the current browser.
   * @return {Promise}
   */
  var unsubscribeFromPushManagerPromise = function() {
    return navigator.serviceWorker.ready.then(function(registration) {
      return registration.pushManager.getSubscription();
    }).then(function(subscription) {
      if (subscription && subscription.endpoint) {
        return subscription.unsubscribe();
      }
    });
  };

  var init = function() {
    if (!isSupported) {
      document.body.classList.add('nosupport-notifications');
    }
  };

  return {
    disableNotificationsPromise: disableNotificationsPromise,
    init: init,
    isExistingSubscriptionPromise: isExistingSubscriptionPromise,
    isNotifyEnabledPromise: isNotifyEnabledPromise,
    isSupported: isSupported,
    subscribePromise: subscribePromise,
    unsubscribeFromPushManagerPromise: unsubscribeFromPushManagerPromise
  };
})();
