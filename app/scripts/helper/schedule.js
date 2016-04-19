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

self.IOWA = self.IOWA || {};

class Schedule {

  /**
   * Name of the local DB table keeping the queued updates to the API endpoint.
   * @constant
   * @type {string}
   */
  get QUEUED_SESSION_API_UPDATES_DB_NAME() {
    return 'toolbox-offline-session-updates';
  }

  /**
   * Schedule API endpoint.
   * @constant
   * @type {string}
   */
  get SCHEDULE_ENDPOINT() {
    return 'api/v1/schedule';
  }

  /**
   * Survey API endpoint.
   * @constant
   * @type {string}
   */
  get SURVEY_ENDPOINT() {
    return 'api/v1/user/survey';
  }

  constructor() {
    this.scheduleData_ = null;

    this.cache = {
      userSavedSessions: [],
      userSavedSurveys: []
    };

    // A promise fulfilled by the loaded schedule.
    this.scheduleDeferredPromise = null;

    // The resolve function for scheduleDeferredPromise;
    this.scheduleDeferredPromiseResolver = null;
  }

  /**
   * Create the deferred schedule-fetching promise `scheduleDeferredPromise`.
   * @private
   */
  createScheduleDeferred_() {
    let scheduleDeferred = IOWA.Util.createDeferred();
    this.scheduleDeferredPromiseResolver = scheduleDeferred.resolve;
    this.scheduleDeferredPromise = scheduleDeferred.promise.then(data => {
      this.scheduleData_ = data.scheduleData;

      let template = IOWA.Elements.Template;

      // Wait until template is stamped before adding schedule data to it.
      template.domStampedPromise.then(() => {
        template.set('app.scheduleData', data.scheduleData);
        template.set('app.filterSessionTypes', data.tags.filterSessionTypes);
        template.set('app.filterThemes', data.tags.filterThemes);
        template.set('app.filterTopics', data.tags.filterTopics);
      });

      return this.scheduleData_;
    });
  }

  /**
   * Fetches the I/O schedule data. If the schedule has not been loaded yet, a
   * network request is kicked off. To wait on the schedule without
   * triggering a request for it, use `schedulePromise`.
   * @return {Promise} Resolves with response schedule data.
   */
  fetchSchedule() {
    if (this.scheduleData_) {
      return Promise.resolve(this.scheduleData_);
    }

    return IOWA.Request.xhrPromise('GET', this.SCHEDULE_ENDPOINT, false).then(resp => {
      this.scheduleData_ = resp;
      return this.scheduleData_;
    });
  }

  /**
   * Returns a promise fulfilled when the master schedule is loaded.
   * @return {!Promise} Resolves with response schedule data.
   */
  schedulePromise() {
    if (!this.scheduleDeferredPromise) {
      this.createScheduleDeferred_();
    }

    return this.scheduleDeferredPromise;
  }

  /**
   * Resolves the schedule-fetching promise.
   * @param {{scheduleData, tags}} data
   */
  resolveSchedulePromise(data) {
    if (!this.scheduleDeferredPromiseResolver) {
      this.createScheduleDeferred_();
    }

    this.scheduleDeferredPromiseResolver(data);
  }

  /**
   * Fetches the resource from cached value storage or network.
   * If this is the first time it's been called, then uses the cache-then-network strategy to
   * first try to read the data stored in the Cache Storage API, and invokes the callback with that
   * response. It then tries to fetch a fresh copy of the data from the network, saves the response
   * locally in memory, and resolves the promise with that response.
   * @param {string} url The address of the resource.
   * @param {string} resourceCache A variable name to store the cached resource.
   * @param {function} callback The callback to execute when the user survey data is available.
   */
  // TODO: change and use this to cache Firebase requests instead of API requests.
  // TODO: Might want to move all caching logic inside IOFirebase (not sure).
  // TODO: Currently this is not being called.
  // TODO: Might be best to change that to a "read from cache" instead of keeping it as a more
  // TODO: generic "fetch" that does both cache+fetch because that's not really how Firebase works.
  // TODO: Firebase relies only on events.
  fetchResource(url, resourceCache, callback) {
    if (this.cache[resourceCache].length) {
      callback(this.cache[resourceCache]);
    } else {
      let callbackWrapper = resource => {
        this.cache[resourceCache] = resource || [];
        callback(this.cache[resourceCache]);
      };

      IOWA.Request.cacheThenNetwork(url, callback, callbackWrapper, true);
    }
  }

  /**
   * Sets up Firebase listeners to load the initial user schedule and keep it
   * up to date as the Firebase data changes.
   */
  loadUserSchedule() {
    this._loadUserSchedule(false);
  }

  /**
   * Reads cached schedule data from IndexedDB and uses it to populate the
   * initial user schedule.
   */
  loadCachedUserSchedule() {
    this._loadUserSchedule(true);
  }

  /**
   * Wait for the master schedule to have loaded, then use `IOFirebase.registerToSessionUpdates()`
   * to fetch the initial user's schedule, bind it for display and listen for further updates.
   * registerToSessionUpdates() doesn't wait for the user to be signed in, so ensure that there is a
   * signed-in user before calling this function.
   *
   * @private
   * @param {Boolean} replayFromCache true for cached data, false for Firebase
   */
  _loadUserSchedule(replayFromCache) {
    let sessionUpdatesCallback = (sessionId, data) => {
      let template = IOWA.Elements.Template;

      let savedSessions = template.app.savedSessions;
      let savedSessionsListIndex = savedSessions.indexOf(sessionId);
      let sessionsListIndex = template.app.scheduleData.sessions.findIndex(
        session => session.id === sessionId);
      if (data && data.in_schedule && savedSessions.indexOf(sessionId) === -1) {
        // Add session to bookmarked sessions.
        template.push('app.savedSessions', sessionId);
        template.set(`app.scheduleData.sessions.${sessionsListIndex}.saved`, true);

        debugLog(`Session ${sessionId} bookmarked!`);
      } else if (data && !data.in_schedule && savedSessionsListIndex !== -1) {
        // Remove the session from the bookmarks if present.
        template.splice('app.savedSessions', savedSessionsListIndex, 1);
        template.set(`app.scheduleData.sessions.${sessionsListIndex}.saved`, false);

        debugLog(`Session ${sessionId} removed from bookmarks!`);
      }
    };

    let sessionFeedbackUpdatesCallback = sessionId => {
      let template = IOWA.Elements.Template;
      let savedFeedback = template.app.savedSurveys;
      let sessionsListIndex = template.app.scheduleData.sessions.findIndex(
        session => session.id === sessionId);
      if (savedFeedback.indexOf(sessionId) === -1) {
        // Add feedback to saved feedbacks.
        template.push('app.savedSurveys', sessionId);
        template.set(`app.scheduleData.sessions.${sessionsListIndex}.rated`, true);

        debugLog(`Session ${sessionId} has received feedback!`);
      }
    };

    let videoWatchUpdatesCallback = videoId => {
      let template = IOWA.Elements.Template;
      let watchedVideos = template.app.watchedVideos;
      let sessions = template.app.scheduleData.sessions;
      let sessionsListIndex = sessions.findIndex(session => {
        return session.youtubeUrl && session.youtubeUrl.match(videoId);
      });

      if (watchedVideos.indexOf(videoId) === -1) {
        // Add video to saved feedbacks.
        template.push('app.watchedVideos', videoId);
        template.set(`app.scheduleData.sessions.${sessionsListIndex}.watched`, true);

        debugLog(`Session ${videoId} video has been watched.`);
      }
    };

    // We can't do anything until the master schedule has been fetched.
    this.schedulePromise().then(() => {
      if (replayFromCache) {
        // This will read cached my_schedule and feedback data from IndexedDB
        // locally, and use it to initially populate the schedule page.
        IOWA.IOFirebase.replayCachedSavedSessions(sessionUpdatesCallback);
        IOWA.IOFirebase.replayCachedSessionFeedback(sessionFeedbackUpdatesCallback);
      } else {
        // If replayFromCache is false, then set up the live Firebase listeners.
        IOWA.IOFirebase.clearCachedReads().then(() => {
          // Listen to session bookmark updates.
          IOWA.IOFirebase.registerToSessionUpdates(sessionUpdatesCallback);
          // Listen to feedback updates.
          IOWA.IOFirebase.registerToFeedbackUpdates(sessionFeedbackUpdatesCallback);
          // Listen to video watch updates.
          IOWA.IOFirebase.registerToVideoWatchUpdates(videoWatchUpdatesCallback);
        });
      }
    });
  }

  /**
   * Adds/removes a session from the user's bookmarked sessions.
   * @param {string} sessionId The session to add/remove.
   * @param {Boolean} save True if the session should be added, false if it
   *     should be removed.
   * @return {Promise} Resolves with the server's response.
   */
  saveSession(sessionId, save) {
    IOWA.Analytics.trackEvent('session', 'bookmark', save ? 'save' : 'remove');

    // Pass true to waitForSignedIn() to indicate that we're fine if we only
    // have the cached user id due to having started up while offline.
    return IOWA.Auth.waitForSignedIn('Sign in to add events to My Schedule', true).then(() => {
      return IOWA.IOFirebase.toggleSession(sessionId, save).catch(error =>
        IOWA.Elements.Toast.showMessage(error + ' The change will be retried on your next visit.'));
    });
  }

  /**
   * Submits session-related request to backend.
   * @param {string} url Request url.
   * @param {string} method Request method, e.g. 'PUT'.
   * @param {Object} payload JSON payload.
   * @param {string} errorMsg Message to be shown on error.
   * @param {function} callback Callback to be called with the resource.
   * @return {Promise} Resolves with the server's response.
   */
  submitSessionRequest(url, method, payload, errorMsg, callback) {
    return IOWA.Request.xhrPromise(method, url, true, payload)
      .then(callback.bind(this))
      .catch(error => {
        // error will be an XMLHttpRequestProgressEvent if the xhrPromise()
        // was rejected due to a network error.
        // Otherwise, error will be a Error object.
        if ('serviceWorker' in navigator && XMLHttpRequestProgressEvent &&
          error instanceof XMLHttpRequestProgressEvent) {
          IOWA.Elements.Toast.showMessage(
            errorMsg + ' The change will be retried on your next visit.');
        } else {
          IOWA.Elements.Toast.showMessage(errorMsg);
        }
        throw error;
      });
  }

  /**
   * Submits session survey results.
   * @param {string} sessionId The session to be rated.
   * @param {Object} answers An object with question/answer pairs.
   * @return {Promise} Resolves with the server's response.
   */
  saveSurvey(sessionId, answers) {
    IOWA.Analytics.trackEvent('session', 'rate', sessionId);

    return IOWA.Auth.waitForSignedIn('Sign in to submit feedback').then(() => {
      let url = `${this.SURVEY_ENDPOINT}/${sessionId}`;
      let callback = response => {
        IOWA.Elements.Template.set('app.savedSurveys', response);
        IOWA.IOFirebase.markSessionRated(sessionId);
      };
      return this.submitSessionRequest(
        url, 'PUT', answers, 'Unable to save feedback results.', callback);
    });
  }

  /**
   * Shows a notification when bookmarking/removing a session.
   * @param {Boolean} saved True if the session was saved. False if it was removed.
   * @param {string=} opt_message Optional override message for the
   * "Added to My Schedule" toast.
   */
  bookmarkSessionNotification(saved, opt_message) {
    let message = opt_message || 'You\'ll get a notification when it starts.';
    let notificationWidget = document.querySelector('io-notification-widget');

    // notificationWidget will be present if we're fully auth'ed.
    if (notificationWidget) {
      if (saved) {
        return notificationWidget.subscribeIfAble().then(subscribed => {
          if (subscribed) {
            IOWA.Elements.Toast.showMessage('Added to My Schedule. ' + message);
          } else if (Notification.permission === 'denied') {
            // The subscription couldn't be completed due to the page
            // permissions for notifications being set to denied.
            IOWA.Elements.Toast.showMessage('Added to My Schedule. Want to enable notifications?',
              null, 'Learn how', () => window.open('permissions', '_blank'));
          } else {
            // Some other reason for not enabling notifications
            IOWA.Elements.Toast.showMessage('Added to My Schedule.');
          }
        });
      }
      IOWA.Elements.Toast.showMessage('Removed from My Schedule');
    } else {
      // If notificationWidget isn't present and we're not auth'ed, then display
      // a message about the schedule update being queued.
      IOWA.Elements.Toast.showMessage('My Schedule update will be applied when you come back while online.');
    }
  }

  generateFilters(tags = {}) {
    let filterSessionTypes = [];
    let filterThemes = [];
    let filterTopics = [];

    let sortedTags = Object.keys(tags).map(tag => {
      return tags[tag];
    }).sort((a, b) => {
      if (a.order_in_category < b.order_in_category) {
        return -1;
      }
      if (a.order_in_category > b.order_in_category) {
        return 1;
      }
      return 0;
    });

    for (let i = 0; i < sortedTags.length; ++i) {
      let tag = sortedTags[i];
      switch (tag.category) {
        case 'TYPE':
          filterSessionTypes.push(tag.name);
          break;
        case 'TRACK':
          filterTopics.push(tag.name);
          break;
        case 'THEME':
          filterThemes.push(tag.name);
          break;
      }
    }

    return {
      filterSessionTypes: filterSessionTypes,
      filterThemes: filterThemes,
      filterTopics: filterTopics
    };
  }

  updateSavedSessionsUI_(savedSessions) {
    //  Mark/unmarked sessions the user has bookmarked.
    let template = IOWA.Elements.Template;
    let sessions = template.app.scheduleData.sessions;
    for (let i = 0; i < sessions.length; ++i) {
      let isSaved = savedSessions.indexOf(sessions[i].id) !== -1;
      template.set(`app.scheduleData.sessions.${i}.saved`, isSaved);
    }
  }

  /**
   * Clear all user schedule data from display.
   */
  clearUserSchedule() {
    let template = IOWA.Elements.Template;
    template.set('app.savedSessions', []);
    this.updateSavedSessionsUI_(template.app.savedSessions);
    this.clearCachedUserSchedule();
  }

  clearCachedUserSchedule() {
    this.cache.userSavedSessions = [];
  }

  getSessionById(sessionId) {
    for (let i = 0; i < this.scheduleData_.sessions.length; ++i) {
      let session = this.scheduleData_.sessions[i];
      if (session.id === sessionId) {
        return session;
      }
    }
    return null;
  }

}

IOWA.Schedule = IOWA.Schedule || new Schedule();
