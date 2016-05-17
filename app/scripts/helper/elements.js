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

IOWA.Elements = (function() {
  'use strict';

  const ANALYTICS_LINK_ATTR = 'data-track-link';

  // Called from critical.html when the bundle is loaded.
  function onElementsBundleLoaded() {
    var onPageSelect = function() {
      document.body.removeEventListener('page-select', onPageSelect);

      // Load auth after initial page is setup. This helps do less upfront work
      // until the animations are done (esp. on mobile).
      IOWA.Elements.GoogleSignIn.load = true;

      IOWA.Elements.Template.set('app.splashRemoved', true);

      // Deep link into a subpage.
      var selectedPageEl = IOWA.Elements.LazyPages.selectedPage;
      var parsedUrl = IOWA.Router.parseUrl(window.location.href);
      // Select page's default subpage tab if there's no deep link in the URL.
      selectedPageEl.selectedSubpage = parsedUrl.subpage || selectedPageEl.selectedSubpage;

      var subpage = document.querySelector(
          '.subpage-' + selectedPageEl.selectedSubpage);

      IOWA.PageAnimation.play(
        IOWA.PageAnimation.pageFirstRender(subpage), function() {
          // Let page know transitions are done.
          IOWA.Elements.Template.fire('page-transition-done');
          IOWA.ServiceWorkerRegistration.register();
        }
      );
    };

    if (IOWA.Elements && IOWA.Elements.LazyPages &&
        IOWA.Elements.LazyPages.selectedPage) {
      onPageSelect();
    } else {
      document.body.addEventListener('page-select', onPageSelect);
    }
  }

  function onDomBindStamp() {
    var main = document.querySelector('.io-main');

    var masthead = document.querySelector('.masthead');
    var nav = masthead.querySelector('#navbar');
    var navPaperTabs = nav.querySelector('paper-tabs');
    var footer = document.querySelector('footer');
    var toast = document.getElementById('toast');
    var liveStatus = document.getElementById('live-status');
    var signin = document.querySelector('google-signin');

    var lazyPages = document.querySelector('lazy-pages');
    lazyPages.selected = IOWA.Elements.Template.selectedPage;

    IOWA.Elements.Drawer = IOWA.Elements.Template.$.appdrawer;
    IOWA.Elements.Masthead = masthead;
    IOWA.Elements.Main = main;
    IOWA.Elements.Nav = nav;
    IOWA.Elements.NavPaperTabs = navPaperTabs;
    IOWA.Elements.Toast = toast;
    IOWA.Elements.LiveStatus = liveStatus;
    IOWA.Elements.Footer = footer;
    IOWA.Elements.GoogleSignIn = signin;
    IOWA.Elements.LazyPages = lazyPages;

    IOWA.Elements.ScrollContainer = window;
    IOWA.Elements.Scroller = document.documentElement;

    // Kickoff a11y helpers for elements
    IOWA.A11y.init();
  }

  function init() {
    var template = document.getElementById('t');

    template.app = {}; // Shared global properties among pages.
    template.app.pageTransitionDone = false;
    template.app.splashRemoved = false;
    template.app.headerReveals = true;
    template.app.fullscreenVideoActive = false;
    template.app.isIOS = IOWA.Util.isIOS();
    template.app.isAndroid = IOWA.Util.isAndroid();
    template.app.isSafari = IOWA.Util.isSafari();
    template.app.ANALYTICS_LINK_ATTR = ANALYTICS_LINK_ATTR;
    template.app.scheduleData = null;
    template.app.savedSessions = [];
    template.app.savedSurveys = [];
    template.app.watchedVideos = [];
    template.app.currentUser = null;
    template.app.showMySchedulHelp = true;

    template.pages = IOWA.PAGES; // defined in auto-generated ../pages.js
    template.selectedPage = IOWA.Router.parseUrl(window.location.href).page;

    // FAB scrolling effect caches.
    template._fabCrossFooterThreshold = null; // Scroll limit when FAB sticks.
    template._fabBottom = null; // Bottom to pin FAB at.

    IOWA.Util.setMetaThemeColor('#546E7A');

    template.openSettings = function(e) {
      var attr = Polymer.dom(e).rootTarget.getAttribute(ANALYTICS_LINK_ATTR);
      if (attr) {
        IOWA.Analytics.trackEvent('link', 'click', attr);
      }
      IOWA.Elements.Nav.querySelector('paper-menu-button').open();
    };

    template.setSelectedPageToHome = function() {
      this.selectedPage = 'home';
    };

    template.backToTop = function(e) {
      e.preventDefault();

      Polymer.AppLayout.scroll({
        top: 0,
        behavior: 'smooth',
        target: IOWA.Elements.Scroller
      });

      // Kick focus back to the page
      // User will start from the top of the document again
      e.target.blur();
    };

    template.toggleDrawer = function() {
      this.$.appdrawer.toggle();
    };

    // template.onCountdownTimerThreshold = function(e, detail) {
    //   if (detail.label === 'Ended') {
    //     this.countdownEnded = true;
    //   }
    // };

    template.signIn = function(e) {
      if (e) {
        e.preventDefault();
        var target = Polymer.dom(e).rootTarget;
        if (target.hasAttribute(ANALYTICS_LINK_ATTR)) {
          IOWA.Analytics.trackEvent(
              'link', 'click', target.getAttribute(ANALYTICS_LINK_ATTR));
        }
      }
      IOWA.Elements.GoogleSignIn.signIn();
    };

    template.keyboardSignIn = function(e) {
      // Listen for Enter or Space press
      if (e.keyCode === 13 || e.keyCode === 32) {
        this.signIn();
      }
    };

    template.signOut = function(e) {
      if (e) {
        e.preventDefault();
        var target = Polymer.dom(e).rootTarget;
        if (target.hasAttribute(ANALYTICS_LINK_ATTR)) {
          IOWA.Analytics.trackEvent(
              'link', 'click', target.getAttribute(ANALYTICS_LINK_ATTR));
        }
      }
      IOWA.Elements.GoogleSignIn.signOut();
    };

    template.keyboardSignOut = function(e) {
      // Listen for Enter or Space press
      if (e.keyCode === 13 || e.keyCode === 32) {
        this.signOut();
      }
    };

    template.initFabScroll = function() {
      if (this.app.isPhoneSize) {
        return;
      }

      this.$.fab.style.top = ''; // clear out old styles.

      var containerHeight = IOWA.Elements.ScrollContainer === window ?
          IOWA.Elements.ScrollContainer.innerHeight : IOWA.Elements.ScrollContainer.scrollHeight;
      var fabMetrics = this.$.fab.getBoundingClientRect();

      this._fabBottom = parseInt(window.getComputedStyle(this.$.fab).bottom, 10);

      this._fabCrossFooterThreshold = IOWA.Elements.Scroller.scrollHeight - containerHeight - fabMetrics.height;

      // Make sure FAB is in correct location when window is resized.
      this._setFabPosition(IOWA.Elements.Masthead._scrollTop);

      // Note: there's no harm in re-adding existing listeners with
      // the same params.
      this.listen(IOWA.Elements.ScrollContainer, 'scroll', '_onContentScroll');
    };

    template._setFabPosition = function(scrollTop) {
      // Hide back to top FAB if user is at the top.
      var MIN_SCROLL_BEFORE_SHOW = 10;
      if (scrollTop <= MIN_SCROLL_BEFORE_SHOW) {
        this.$.fab.classList.remove('active');
        this.debounce('updatefaba11y', function() {
          this.$.fabAnchor.setAttribute('tabindex', -1);
          this.$.fabAnchor.setAttribute('aria-hidden', true);
        }, 500);
        return; // cut out early.
      }

      this.$.fab.classList.add('active'); // Reveal FAB.
      this.debounce('updatefaba11y', function() {
        this.$.fabAnchor.setAttribute('tabindex', 0);
        this.$.fabAnchor.setAttribute('aria-hidden', false);
      }, 500);

      if (this._fabCrossFooterThreshold <= scrollTop) {
        this.$.fab.style.transform = 'translateY(-' + (scrollTop - this._fabCrossFooterThreshold) + 'px)';
      } else {
        this.$.fab.style.transform = '';
      }
    };

    template._onContentScroll = function() {
      var scrollTop = IOWA.Elements.Masthead._scrollTop;

      this.debounce('mainscroll', function() {
        if (scrollTop === 0) {
          this.$.navbar.classList.remove('scrolled');
        } else {
          this.$.navbar.classList.add('scrolled');
        }

        // Note, we should not call this on every scroll event, but scoping
        // the update to the nav is very cheap (< 1ms).
        IOWA.Elements.NavPaperTabs.updateStyles();
      }, 25);

      window.requestAnimationFrame(function() {
        this._setFabPosition(scrollTop);
      }.bind(this));
    };

    template._isPage = function(page, selectedPage) {
      return page === selectedPage;
    };

    template.closeDrawer = function() {
      if (this.$.appdrawer && this.$.appdrawer.close) {
        this.$.appdrawer.close();
      }
    };

    template._onClearFilters = function(e) {
      e.stopPropagation();

      var selectedPageEl = IOWA.Elements.LazyPages.selectedPage;
      selectedPageEl.clearFilters();
    };

    template.domStampedPromise = new Promise(resolve => {
      template.addEventListener('dom-change', resolve);
    });

    template.domStampedPromise.then(onDomBindStamp);

    template.addEventListener('page-transition-done', function() {
      this.set('app.pageTransitionDone', true);
      IOWA.Elements.NavPaperTabs.style.pointerEvents = '';

      this.initFabScroll(); // init FAB scrolling behavior.
    });

    template.addEventListener('page-transition-start', function() {
      this.set('app.pageTransitionDone', false);
      IOWA.Elements.NavPaperTabs.style.pointerEvents = 'none';
    });

    IOWA.Elements.Template = template;
  }

  return {
    init,
    onElementsBundleLoaded
  };
})();
