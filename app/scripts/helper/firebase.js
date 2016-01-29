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
          console.log('Login to Firebase Failed!', error);
        }
      } else {
        IOWA.Analytics.trackEvent('login', 'success', firebaseShardUrl);
        if (window.ENV !== 'prod') {
          console.log('Authenticated successfully to Firebase shard', firebaseShardUrl);
        }
      }
    });
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
}

IOWA.IOFirebase = IOWA.IOFirebase || new IOFirebase();
