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

IOWA.IOFirebase = IOWA.IOFirebase || (function() {
  'use strict';

  /**
   * Firebase for the I/O Web App.
   *
   * @constructor
   */
  function IOFirebase() {
    // Listen to Changes in the sign-in state.
    document.addEventListener('signin-change', function(e) {
      var user = e.detail.user;
      if (e.detail.signedIn) {
        this.auth(user.id, user.tokenResponse.access_token);
      } else {
        this.unAuth();
      }
    }.bind(this));
  }

  /**
   * List of Firebase Database shards.
   * @static
   * @type {string[]}
   */
  IOFirebase.FIREBASE_DATABASES_URL = ['https://iowa-2016-dev.firebaseio.com/'];

  /**
   * Currently authorized Firebase Database shard.
   * @type {Firebase}
   */
  IOFirebase.prototype.firebaseRef = null;

  /**
   * Selects the correct Firebase Database shard for the given user.
   *
   * @static
   * @private
   * @param {string} userId The ID of the signed-in Google user.
   * @return {string} The URL of the Firebase Database shard.
   */
  IOFirebase._selectShard = function(userId) {
    var shardIndex = parseInt(crc32(userId), 16) % IOFirebase.FIREBASE_DATABASES_URL.length;
    return IOFirebase.FIREBASE_DATABASES_URL[shardIndex];
  };

  /**
   * Authorizes the given user to the correct Firebase Database shard.
   *
   * @param {string} userId The ID of the signed-in Google user.
   * @param {string} accessToken The accessToken of the signed-in Google user.
   */
  IOFirebase.prototype.auth = function(userId, accessToken) {
    var firebaseShardUrl = IOFirebase._selectShard(userId);
    console.log('Chose the following Firebase Database Shard:', firebaseShardUrl);
    this.firebaseRef = new Firebase(firebaseShardUrl);
    this.firebaseRef.authWithOAuthToken('google', accessToken, function(error) {
      if (error) {
        console.log('Login to Firebase Failed!', error);
      } else {
        console.log('Authenticated successfully to Firebase shard', firebaseShardUrl);
      }
    });
  };

  /**
   * Unauthorizes Firebase.
   */
  IOFirebase.prototype.unAuth = function() {
    if (this.firebaseRef) {
      this.firebaseRef.unauth();
      console.log('Unauthorized Firebase');
      this.firebaseRef = null;
    }
  };

  return new IOFirebase();
})();
