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

    // Disconnect Firebase while the focus is off the page to save battery.
    if (typeof document.hidden !== 'undefined') {
      document.addEventListener('visibilitychange',
          () => document.hidden ? IOFirebase.goOffline() : IOFirebase.goOnline());
    }
  }

  /**
   * List of Firebase Database shards.
   * @static
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
        if (window.ENV !== 'prod') {
          console.error('Login to Firebase Failed!', error);
        }
      } else {
        this._bumpLastActivityTimestamp();
        IOWA.Analytics.trackEvent('login', 'success', firebaseShardUrl);
        if (window.ENV !== 'prod') {
          console.log('Authenticated successfully to Firebase shard', firebaseShardUrl);
        }
      }
    });

    // Update the clock offset.
    this._updateClockOffset();
  }

  /**
   * Unauthorizes Firebase.
   */
  unAuth() {
    if (this.firebaseRef) {
      this.firebaseRef.unauth();
      if (window.ENV !== 'prod') {
        console.log('Unauthorized Firebase');
      }
      this.firebaseRef = null;
    }
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
        if (window.ENV !== 'prod') {
          console.log('Updated clock offset to', this.clockOffset, 'ms');
        }
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
    this.firebaseRef.child(`users/${userId}/last_activity_timestamp`).onDisconnect().set(
      Firebase.ServerValue.TIMESTAMP);
    return this._setFirebaseUserData('last_activity_timestamp', Firebase.ServerValue.TIMESTAMP);
  }

  /**
   * Disconnect Firebase.
   * @static
   */
  static goOffline() {
    Firebase.goOffline();
    if (window.ENV !== 'prod') {
      console.log('Firebase went offline.');
    }
  }

  /**
   * Re-connect to the Firebase backend.
   * @static
   */
  static goOnline() {
    Firebase.goOnline();
    if (window.ENV !== 'prod') {
      console.log('Firebase back online!');
    }
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
    } else if (window.ENV !== 'prod') {
      console.warn('Trying to subscribe to Firebase while not authorized.');
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
   * @param {number=} timestamp The timestamp when the session was added to the schedule. Use this to
   *     replay offline changes. If not provided the current timestamp will be used.
   * @return {Promise} Promise to track completion.
   */
  toggleSession(sessionUUID, bookmarked, timestamp) {
    let value = {};
    value[sessionUUID] = {
      timestamp: timestamp ? timestamp + this.clockOffset : Firebase.ServerValue.TIMESTAMP,
      bookmarked: bookmarked
    };
    return this._updateFirebaseUserData('my_sessions', value);
  }

  /**
   * Provide feedback for a session.
   *
   * @param {string} sessionUUID The session's UUID.
   * @param {number|null} sessionRating The session's rating from 1 to 5 or `null` if it was not
   *     provided.
   * @param {number|null} relevanceRating The session's relevance rating from 1 to 5 or `null` if it
   *     was not provided.
   * @param {number|null} contentRating The session's content rating from 1 to 5 or `null` if it was
   *     not provided.
   * @param {number|null} speakerQualityRating The session's speaker quality rating from 1 to 5 or
   *     `null` if it was not provided.
   * @param {number=} timestamp The timestamp when the feedback was provided. Use this to replay
   *     offline changes. If not provided the current timestamp will be used.
   * @return {Promise} Promise to track completion.
   */
  addFeedbackForSession(sessionUUID, sessionRating, relevanceRating, contentRating,
                        speakerQualityRating, timestamp) {
    let value = {};
    value[sessionUUID] = {
      timestamp: timestamp ? timestamp + this.clockOffset : Firebase.ServerValue.TIMESTAMP,
      session_rating: sessionRating,
      relevance_rating: relevanceRating,
      content_rating: contentRating,
      speaker_quality_rating: speakerQualityRating
    };
    return this._updateFirebaseUserData('feedback', value);
  }

  /**
   * Mark the given video as viewed by the user.
   *
   * @param {string} videoId The Youtube Video ID.
   * @param {number=} timestamp The timestamp when the video was viewed. Use this to replay offline
   *     changes. If not provided the current timestamp will be used.
   * @return {Promise} Promise to track completion.
   */
  markVideoAsViewed(videoId, timestamp) {
    let value = {};
    value[videoId] = timestamp ? timestamp + this.clockOffset : Firebase.ServerValue.TIMESTAMP;
    return this._updateFirebaseUserData('viewed_videos', value);
  }

  /**
   * Saves the GCM subscription ID that the user is subscribed to.
   *
   * @param {string} gcmId The GCM Subscription ID.
   * @return {Promise} Promise to track completion.
   */
  setGcmId(gcmId) {
    return this._setFirebaseUserData('gcm_id', gcmId);
  }

  /**
   * Gets the GCM subscription ID that the user is subscribed to.
   *
   * @return {Promise} A promise returning the value of the gcm_id or `null` if it was never set.
   */
  getGcmId() {
    let userId = this.firebaseRef.getAuth().uid;
    let ref = this.firebaseRef.child(`users/${userId}/gcm_id`);
    return ref.once('value').then(data => data.val());
  }

  /**
   * Update the given attribute of Firebase User data to the given value.
   *
   * @private
   * @param {string} attribute The attribute to update in the user's data.
   * @param {Object} value The value to give to the attribute.
   * @return {Promise} Promise to track completion.
   */
  _updateFirebaseUserData(attribute, value) {
    if (this.isAuthed()) {
      let userId = this.firebaseRef.getAuth().uid;
      let ref = this.firebaseRef.child(`users/${userId}/${attribute}`);
      return ref.update(value, error => {
        if (window.ENV !== 'prod') {
          if (error) {
            console.error(`Error writing to Firebase data "${userId}/${attribute}":`, value, error);
          } else {
            console.log(`Successfully updated Firebase data "${userId}/${attribute}":`, value);
          }
        }
      });
    } else if (window.ENV !== 'prod') {
      console.warn('Trying to write to Firebase while not authorized.');
    }
  }

  /**
   * Sets the given attribute of Firebase user data to the given value.
   *
   * @private
   * @param {string} attribute The attribute to set in the user's data.
   * @param {string|number|Object} value The value to give to the attribute.
   * @return {Promise} Promise to track completion.
   */
  _setFirebaseUserData(attribute, value) {
    if (this.isAuthed()) {
      let userId = this.firebaseRef.getAuth().uid;
      let ref = this.firebaseRef.child(`users/${userId}/${attribute}`);
      return ref.set(value, error => {
        if (window.ENV !== 'prod') {
          if (error) {
            console.error(`Error writing to Firebase data "${userId}/${attribute}":`, value, error);
          } else {
            console.log(`Successfully updated Firebase data "${userId}/${attribute}":`, value);
          }
        }
      });
    } else if (window.ENV !== 'prod') {
      console.warn('Trying to write to Firebase while not authorized.');
    }
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
