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

/**
 * A class that wraps the SimpleDB library to make it easier to manage
 * open instances of the underlying IndexedDB connection.
 */
class SimpleDB {
  constructor() {
    /**
     * Stores references to SimpleDB wrappers around IndexedDB.
     * @type {Object}
     */
    this.simpleDbInstances = {};

    /**
     * List of SimpleDB names used for offline reads/updates.
     * @constant
     * @type {Object}
     */
    this.NAMES = {
      READS: 'firebase-reads',
      UPDATES: 'firebase-updates',
      USER: 'user-info'
    };
  }

  /**
   * Returns a SimpleDB instance with a given name.
   *
   * @param {string} name The name of the SimpleDB database.
   * @return {Promise} Fulfills with the SimpleDB instance.
   */
  instance(name) {
    return Promise.reject('SimpleDB is temporarily disabled.');
    /*
      if (window.indexedDB && window.indexedDB.open && window.simpleDB) {
        if (this.simpleDbInstances[name]) {
          // Resolve immediately if we already have an open instance.
          return Promise.resolve(this.simpleDbInstances[name]);
        }

        return window.simpleDB.open(name).then(db => {
          // Stash the instance away for reuse next time.
          this.simpleDbInstances[name] = db;
          return this.simpleDbInstances[name];
        });
      }

      // window.simpleDB will be undefined if we detected that there was no
      // IndexedDB support in the current browser.
      return Promise.reject('SimpleDB is not supported.');
    */
  }

  /**
   * Clears out the data stored in the SimpleDB instance with a given name.
   *
   * @param name The name of the SimpleDB database.
   * @returns {Promise} Fulfills when the data is cleared.
   */
  clearData(name) {
    return this.instance(name).then(db => db.clear()).catch(function() {
      debugLog('SimpleDB is temporarily disabled.');
    });
  }
}

window.IOWA = window.IOWA || {};
IOWA.SimpleDB = IOWA.SimpleDB || new SimpleDB();
