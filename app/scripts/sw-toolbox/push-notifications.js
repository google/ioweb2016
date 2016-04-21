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

(function(global) {
  const DEFAULT_URL = 'schedule#myschedule';
  const DEFAULT_ICON = 'images/touch/homescreen192.png';
  const DEFAULT_TITLE = 'Some events in My Schedule have been updated';
  const SCHEDULE_ENDPOINT = 'api/v1/schedule';
  const UTM_SOURCE_PARAM = 'utm_source=notification';

  function updateSessionCache(sessions) {
    return global.toolbox.cacheOnly(SCHEDULE_ENDPOINT).then(response => {
      if (!response || response.status >= 400) {
        // Schedule wasn't cached or was a cached error, so just fetch a
        // fresh copy.
        global.toolbox.cache(SCHEDULE_ENDPOINT);
      }

      // If there's a cached sessions feed, then update the changed fields
      // and replace the cached version with the updated version.
      return response.json().then(function(schedule) {
        sessions.forEach(function(session) {
          schedule.sessions[session.id] = session;
        });

        return caches.open(global.toolbox.options.cache.name).then(cache =>
          cache.put(SCHEDULE_ENDPOINT, new Response(JSON.stringify(schedule)))
        );
      });
    }).catch(function(error) {
      console.error('Could not update the cached sessions feed:', error);
    });
  }

  global.addEventListener('push', function(event) {
    const defaults = {
      icon: DEFAULT_ICON,
      title: DEFAULT_TITLE,
      body: ''
    };
    if (!global.goog.propel.worker.notificationHandler(event, defaults)) {
      // Didn't have notification data in the payload, show fallback notification
      defaults.data = {error: 'no_notification_in_payload'};
      event.waitUntil(global.registration.showNotification(defaults.title, defaults));
    }

    if (event.data) {
      let data;
      try {
        data = event.data.json();
      } catch (e) {
        // data was not valid JSON
        data = {};
      }

      if (data.sessions) {
        event.waitUntil(updateSessionCache(data.sessions));
      }
    }
  });

  global.addEventListener('notificationclick', function(event) {
    event.notification.close();

    let relativeUrl;
    let error;

    if (event.notification.data) {
      relativeUrl = event.notification.data.url;
      error = event.notification.data.error;
    }

    if (!relativeUrl) {
      relativeUrl = DEFAULT_URL;
    }

    if (error) {
      relativeUrl += '?utm_error=' + error;
    }

    const url = new URL(relativeUrl, global.location.href);
    url.search += (url.search ? '&' : '') + UTM_SOURCE_PARAM;

    event.waitUntil(global.clients.openWindow(url.toString()));
  });
})(self);
