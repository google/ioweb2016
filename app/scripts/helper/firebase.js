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

window.IOWA = window.IOWA || {};

/**
 * Firebase for the I/O Web App.
 */
class IOFirebase {

  constructor() {
    /**
     * Currently authorized Firebase Database shard.
     * @type {Firebase}
     */
    this.firebaseRef = null;

    /**
     * Offset between the local clock and the Firebase servers clock. This is used to replay offline
     * operations accurately.
     * @type {number}
     */
    this.clockOffset = 0;

    /**
     * Stores references to SimpleDB wrappers around IndexedDB.
     * @type {Object}
     */
    this.simpleDbInstance = null;

    // Disconnect Firebase while the focus is off the page to save battery.
    if (typeof document.hidden !== 'undefined') {
      document.addEventListener('visibilitychange',
          () => document.hidden ? IOFirebase.goOffline() : IOFirebase.goOnline());
    }
  }

  /**
   * List of Firebase Database shards.
   * @static
   * @constant
   * @type {Array.<string>}
   */
  static get FIREBASE_DATABASES_URL() {
    return ['https://iowa-2016-dev.firebaseio.com/'];
  }

  /**
   * Selects the correct Firebase Database shard for the given user.
   *
   * @static
   * @private
   * @param {string} userId The ID of the signed-in Google user.
   * @return {string} The URL of the Firebase Database shard.
   */
  static _selectShard(userId) {
    let shardIndex = parseInt(crc32(userId), 16) % IOFirebase.FIREBASE_DATABASES_URL.length;
    return IOFirebase.FIREBASE_DATABASES_URL[shardIndex];
  }

  /**
   * Authorizes the given user to the correct Firebase Database shard.
   *
   * @param {string} userId The ID of the signed-in Google user.
   * @param {string} accessToken The accessToken of the signed-in Google user.
   */
  auth(userId, accessToken) {
    let firebaseShardUrl = IOFirebase._selectShard(userId);
    console.log('Chose the following Firebase Database Shard:', firebaseShardUrl);
    this.firebaseRef = new Firebase(firebaseShardUrl);
    this.firebaseRef.authWithOAuthToken('google', accessToken, error => {
      if (error) {
        IOWA.Analytics.trackError('this.firebaseRef.authWithOAuthToken(...)', error);
        debugLog('Login to Firebase Failed!', error);
      } else {
        this._bumpLastActivityTimestamp();
        IOWA.Analytics.trackEvent('login', 'success', firebaseShardUrl);
        debugLog('Authenticated successfully to Firebase shard', firebaseShardUrl);
      }
    });

    // Update the clock offset.
    this._updateClockOffset();
    this._replayQueuedOperations();
  }

  /**
   * Unauthorizes Firebase.
   */
  unAuth() {
    if (this.firebaseRef) {
      // Make sure to detach any callbacks.
      let userId = this.firebaseRef.getAuth().uid;
      this.firebaseRef.child(`users/${userId}/my_sessions`).off();
      this.firebaseRef.child(`users/${userId}/feedback`).off();
      // Unauthorize the Firebase reference.
      this.firebaseRef.unauth();
      debugLog('Unauthorized Firebase');
      this.firebaseRef = null;
    }
  }

  /**
   * Returns a SimpleDB wrapper around IndexedDB used for queueing Firebase
   * write operations.
   *
   * @private
   * @return {Promise} Fulfills with the SimpleDB instance.
   */
  _simpleDbInstance() {
    if (window.simpleDB) {
      if (this.simpleDbInstance) {
        // Resolve immediately if we already have an open instance.
        return Promise.resolve(this.simpleDbInstance);
      }

      return window.simpleDB.open('firebase-updates').then(db => {
        // Stash the instance away for reuse next time.
        this.simpleDbInstance = db;
        return this.simpleDbInstance;
      });
    }

    // window.simpleDB will be undefined if we detected that there was no
    // IndexedDB support in the current browser.
    return Promise.reject('SimpleDB is not supported.');
  }

  /**
   * Retries all queued Firebase set() operations that were previously queued
   * in IndexedDB.
   *
   * @private
   * @return {Promise} Fulfills when all the queued operations are replayed.
   */
  _replayQueuedOperations() {
    let queuedOperations = {};

    this._simpleDbInstance().then(db => {
      // Let's read in all the queued values before we do anything else, to
      // make sure we're not confused by additional queued values that get
      // added asynchronously.
      return db.forEach((attribute, value) => {
        queuedOperations[attribute] = value;
      });
    }).then(() => {
      return Promise.all(Object.keys(queuedOperations).map(attribute => {
        // _setFirebaseData() will take care of deleting the IDB entry.
        return this._setFirebaseData(attribute, queuedOperations[attribute]);
      }));
    }).catch(error => {
      debugLog('Error in _replayQueuedOperations: ' + error);
    });
  }

  /**
   * Updates the offset between the local clock and the Firebase servers clock.
   * @private
   */
  _updateClockOffset() {
    if (this.firebaseRef) {
      // Retrieve the offset between the local clock and Firebase's clock for offline operations.
      let offsetRef = this.firebaseRef.child('/.info/serverTimeOffset');
      offsetRef.once('value', snap => {
        this.clockOffset = snap.val();
        debugLog('Updated clock offset to', this.clockOffset, 'ms');
      });
    }
  }

  /**
   * Update the user's last activity timestamp and make sure it will be updated when the user
   * disconnects.
   *
   * @private
   * @return {Promise} Promise to track completion.
   */
  _bumpLastActivityTimestamp() {
    let userId = this.firebaseRef.getAuth().uid;
    this.firebaseRef.child(`users/${userId}/last_activity_timestamp`)
      .onDisconnect().set(Firebase.ServerValue.TIMESTAMP);
    return this._setFirebaseUserData('last_activity_timestamp',
      Firebase.ServerValue.TIMESTAMP);
  }

  /**
   * Disconnect Firebase.
   * @static
   */
  static goOffline() {
    Firebase.goOffline();
    debugLog('Firebase went offline.');
  }

  /**
   * Re-connect to the Firebase backend.
   * @static
   */
  static goOnline() {
    Firebase.goOnline();
    debugLog('Firebase back online!');
  }

  /**
   * Register to get updates on bookmarked sessions. This should also be used to get the initial
   * list of bookmarked sessions.
   *
   * @param {IOFirebase~updateCallback} callback A callback function that will be called with the
   *     data for each sessions when they get updated.
   */
  registerToSessionUpdates(callback) {
    this._registerToUpdates('my_sessions', callback);
  }

  /**
   * Register to get updates on saved session feedback. This should also be used to get the initial
   * list of saved session feedback.
   *
   * @param {IOFirebase~updateCallback} callback A callback function that will be called with the
   *     data for each saved session feedback when they get updated.
   */
  registerToFeedbackUpdates(callback) {
    this._registerToUpdates('feedback', callback);
  }

  /**
   * Register to get updates on the given user data attribute.
   *
   * @private
   * @param {string} attribute The Firebase user data attribute for which updated will trigger the
   *     callback.
   * @param {IOFirebase~updateCallback} callback A callback function that will be called for each
   *     updates/deletion/addition of an item in the given attribute.
   */
  _registerToUpdates(attribute, callback) {
    if (this.isAuthed()) {
      let userId = this.firebaseRef.getAuth().uid;
      let ref = this.firebaseRef.child(`users/${userId}/${attribute}`);

      ref.on('child_added', dataSnapshot => callback(dataSnapshot.key(), dataSnapshot.val()));
      ref.on('child_changed', dataSnapshot => callback(dataSnapshot.key(), dataSnapshot.val()));
      ref.on('child_removed', dataSnapshot => callback(dataSnapshot.key(), null));
    } else {
      debugLog('Trying to subscribe to Firebase while not authorized.');
    }
  }

  /**
   * Callback used to notify updates.
   *
   * @callback IOFirebase~updateCallback
   * @param {string} key The key of the element that was updated/added/deleted.
   * @param {string|null} value The value given to the updated element. `null` if the element was
   *     deleted.
   */

  /**
   * Adds or remove the given session to the user's schedule.
   *
   * @param {string} sessionUUID The session's UUID.
   * @param {boolean} bookmarked `true` if the user has bookmarked the session.
   * @return {Promise} Promise to track completion.
   */
  toggleSession(sessionUUID, bookmarked) {
    return this._setFirebaseUserData(`my_sessions/${sessionUUID}`, {
      timestamp: Date.now() + this.clockOffset,
      bookmarked: bookmarked
    });
  }

  /**
   * Mark that user has provided feedback for a session.
   *
   * @param {string} sessionUUID The session's UUID.
   * @return {Promise} Promise to track completion.
   */
  markSessionRated(sessionUUID) {
    return this._setFirebaseUserData(`feedback/${sessionUUID}`, {
      timestamp: Date.now() + this.clockOffset
    });
  }

  /**
   * Mark the given video as viewed by the user.
   *
   * @param {string} videoIdOrUrl The Youtube Video URL or ID.
   * @return {Promise} Promise to track completion.
   */
  markVideoAsViewed(videoIdOrUrl) {
    // Making sure we save the ID of the Video and not the full Youtube URL.
    let match = videoIdOrUrl.match(/.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([^#\&\?]*).*/);
    videoIdOrUrl = match ? videoIdOrUrl : match[1];
    return this._setFirebaseUserData(`viewed_videos/${videoIdOrUrl}`, {
      timestamp: Date.now() + this.clockOffset
    });
  }

  /**
   * Adds the GCM subscription ID provided by the browser.
   *
   * @param {string} gcmId The GCM Subscription ID.
   * @return {Promise} Promise to track completion.
   */
  addGcmId(gcmId) {
    let value = {};
    value[gcmId] = true;
    return this._updateFirebaseUserData('gcm_ids', value);
  }

  /**
   * Queues a write operation to IndexedDB (via the SimpleDB wrapper).
   * This ensures that if the Firebase connection is unavailable, the write
   * operation will be eventually performed.
   *
   * @private
   * @param {string} attribute
   * @param {Object} value
   * @return {Promise} Promise that fulfills once IDB is updated.
   */
  _queueOperation(attribute, value) {
    return this._simpleDbInstance().then(db => {
      return db.set(attribute, value);
    }).catch(error => {
      // This might have rejected if IndexedDB is unavailable in the current
      // browser, or if writing to IndexedDB failed for some reason. That should
      // not prevent the Firebase write from being attempted, though, so just
      // catch() the error here.
      debugLog('Error in IOFirebase._queueOperation()', error);
    });
  }

  /**
   * Dequeues a previously queued write operation to IndexedDB (via the SimpleDB
   * wrapper).
   * This should be called after the Firebase operation completed successfully.
   *
   * @private
   * @param {string} attribute
   * @return {Promise} Promise that fulfills once IDB is updated.
   */
  _dequeueOperation(attribute) {
    return this._simpleDbInstance().then(db => {
      return db.delete(attribute);
    }).catch(error => {
      // This might have rejected if IndexedDB is unavailable in the current
      // browser, or if writing to IndexedDB failed for some reason.
      debugLog('Error in IOFirebase._dequeueOperation()', error);
    });
  }

  /**
   * Sets the given attribute of Firebase user data to the given value.
   *
   * @private
   * @param {string} attribute The attribute to update in the user's data.
   * @param {Object} value The value to give to the attribute.
   * @return {Promise} Promise to track set() success or failure.
   */
  _setFirebaseUserData(attribute, value) {
    if (this.isAuthed()) {
      let userId = this.firebaseRef.getAuth().uid;
      return this._setFirebaseData(`users/${userId}/${attribute}`, value);
    }

    return Promise.reject('Not currently authorized with Firebase.');
  }

  /**
   * Sets the given attribute of Firebase data to the given value.
   *
   * @private
   * @param {string} attribute The attribute to update.
   * @param {Object} value The value to give to the attribute.
   * @return {Promise} Promise to track set() success or failure.
   */
  _setFirebaseData(attribute, value) {
    let ref = this.firebaseRef.child(attribute);

    return this._queueOperation(attribute, value).then(() => {
      return ref.set(value);
    }).then(() => {
      debugLog(`Success: Firebase.set(${ref}) with value ` +
        JSON.stringify(value));
      return this._dequeueOperation(attribute);
    }, error => {
      debugLog(`Failure: Firebase.set(${ref}) with value ` +
        `${JSON.stringify(value)} failed due to ${error}`);
      // Even if Firebase returned an error, we still want to remove the
      // queued operation from IDB, since it's not going to help to retry it.
      return this._dequeueOperation(attribute).then(() => Promise.reject(error));
    });
  }

  /**
   * Returns `true` if a user has authorized to Firebase.
   *
   * @return {boolean} `true` if a user has authorized to Firebase.
   */
  isAuthed() {
    return this.firebaseRef && this.firebaseRef.getAuth();
  }
}

IOWA.IOFirebase = IOWA.IOFirebase || new IOFirebase();
