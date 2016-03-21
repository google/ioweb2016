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

(function(global) {
  const OFFLINE_ANALYTICS_DB_NAME = 'toolbox-offline-analytics';
  const EXPIRATION_TIME_DELTA = 86400000; // One day, in milliseconds.
  const ORIGIN = /https?:\/\/((www|ssl)\.)?google-analytics\.com/;

  /**
   * Replays queued Google Analytics requests from IndexedDB by sending them to
   * the Google Analytics server with a modified timestamp.
   */
  function replayQueuedAnalyticsRequests() {
    global.simpleDB.open(OFFLINE_ANALYTICS_DB_NAME).then(function(db) {
      db.forEach(function(url, originalTimestamp) {
        var timeDelta = Date.now() - originalTimestamp;
        // See https://developers.google.com/analytics/devguides/collection/protocol/v1/parameters#qt
        var replayUrl = url + '&qt=' + timeDelta;

        global.fetch(replayUrl).then(function() {
          db.delete(url);
        }).catch(function(error) {
          if (timeDelta > EXPIRATION_TIME_DELTA) {
            // After a while, Google Analytics will no longer accept an old ping with a qt=
            // parameter. The advertised time is ~4 hours, but we'll attempt to resend up to 24
            // hours. This logic also prevents the requests from being queued indefinitely.
            console.error('Replay failed, but the original request is too old to retry any further. Error:', error);
            db.delete(url);
          }
        });
      });
    });
  }

  /**
   * Stores a request URL and the time the request was made in IndexedDB.
   *
   * @param {Request} request The Request whose URL will be stored.
   * @returns {Promise} A promise that resolves once the IndexedDB operation completes.
   */
  function queueFailedAnalyticsRequest(request) {
    return global.simpleDB.open(OFFLINE_ANALYTICS_DB_NAME).then(function(db) {
      return db.set(request.url, Date.now());
    });
  }

  /**
   * A sw-toolbox request handler for dealing with Google Analytics pings.
   * It will attempt to make the request against the network, but if the request
   * fails, it queues it in IndexedDB to be retried later.
   *
   * Note that the Google Analytics server does not support CORS, so the
   * response that comes back is opaque, and we can't examine its status code.
   * We have to assume that if we got any response back, that's successful.
   *
   * @param {Request} request The Google Analytics ping request.
   * @returns {Promise.<Response>} A promise that fulfills with a Response.
   */
  function handleAnalyticsCollectionRequest(request) {
    return global.fetch(request).catch(function() {
      queueFailedAnalyticsRequest(request);
      return Response.error();
    });
  }

  global.toolbox.router.get('/collect', handleAnalyticsCollectionRequest, {origin: ORIGIN});
  global.toolbox.router.get('/analytics.js', global.toolbox.networkFirst, {origin: ORIGIN});

  replayQueuedAnalyticsRequests();
})(self);
