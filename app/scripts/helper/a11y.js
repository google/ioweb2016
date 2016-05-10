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

IOWA.A11y = IOWA.A11y || (function() {
  'use strict';

  // Used by focuseNewPage. Instructs the app to only manage focus if
  // this is not the first page the user is seeing. IOW, only manage
  // focus in response to a user action, not their intial visit to the URL.
  var isInitialPage = true;

  function init() {
    // Differentiate focus coming from mouse and keyboard.
    addFocusStates('.io-logo-link');
    addFocusStates('#navbar paper-tabs a');
    addFocusStates('#signin-nav-elements .button-link');
    document.addEventListener('toast-message', announceLiveChange);
    document.addEventListener('page-transition-done', focusNewPage);
    document.addEventListener('app-drawer-transitioned', focusDrawer.bind(this));
  }

  // Handlers managed by the addFocusStates and removeFocusStates methods.
  var onMouseDown = function() {
    this.classList.add('pressed');
    // this hackery is required for paper-slider which prevents
    // default on mousedown so dragging doesn't select text on screen
    // without a proper mousedown, focus does not move off of the slider
    // if you click on another slider
    this.focus();
  };

  var onMouseUp = function() {
    this.classList.remove('pressed');
  };

  var onFocus = function() {
    // Only render the "focused" state if the element gains focus due to
    // keyboard navigation.
    if (!this.classList.contains('pressed')) {
      this.classList.add('focused');
    }
  };

  var onBlur = function() {
    this.classList.remove('focused');
  };

  // Elements passed to this method will receive classes reflecting the focus
  // and pressed states.
  function addFocusStates(selector) {
    var nodes = document.querySelectorAll(selector);
    Array.prototype.forEach.call(nodes, function(el) {
      el.addEventListener('mousedown', onMouseDown);
      el.addEventListener('mouseup', onMouseUp);
      el.addEventListener('focus', onFocus);
      el.addEventListener('blur', onBlur);
    });
  }
  // Cleanup method for elements with managed focus states
  function removeFocusStates(selector) {
    var nodes = document.querySelectorAll(selector);
    Array.prototype.forEach.call(nodes, function(el) {
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('focus', onFocus);
      el.removeEventListener('blur', onBlur);
    });
  }

  // Pipe text to an aria-live region. This is automatically trigged
  // when toasts are shown.
  function announceLiveChange(e) {
    // Annoying timeout hack to work around https://code.google.com/p/chromium/issues/detail?id=469254
    setTimeout(function() {
      IOWA.Elements.LiveStatus.textContent = 'Notification: ' + e.detail.message;
    }, 1000);
  }

  // Move focus to new page content after it has been lazy loaded in
  function focusNewPage() {
    if (isInitialPage) {
      isInitialPage = false;

      // Override navigation paper-tabs' super annoying focus managment
      var tab = IOWA.Elements.NavPaperTabs.querySelector('paper-tab[tabindex="0"]');
      if (tab) {
        tab.setAttribute('tabindex', '-1');
      }

      return;
    }

    // Move focus to the main header for each page
    var page = IOWA.Elements.LazyPages.selectedPage;
    page.manageFocus();
  }

  function focusDrawer() {
    if (IOWA.Elements.Drawer.opened) {
      var selected = IOWA.Elements.Drawer.querySelector('.iron-selected');
      if (selected) {
        selected.focus();
      }
    }
  }

  return {
    init: init,
    addFocusStates: addFocusStates,
    removeFocusStates: removeFocusStates,
    announceLiveChange: announceLiveChange,
    focusNewPage: focusNewPage,
    focusDrawer: focusDrawer
  };
})();
