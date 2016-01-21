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

 /**
  * @fileOverview The ajax-based routing for IOWA subpages.
  */

IOWA.Router_ = function(window) {
  'use strict';

  /**
   * @constructor
   */
  var Router = function() {};

  /**
   * Keeps info about the router state at the start, during and
   *     after page transition.
   * @type {Object}
   */
  Router.prototype.state = {
    start: null,
    current: null,
    end: null
  };

  /**
   * Initializes the router.
   * @param {Object} template IOWA.Elements.Template reference.
   */
  Router.prototype.init = function(template) {
    this.t = template;
    this.state.current = this.parseUrl(window.location.href);
    window.addEventListener('popstate', function() {
      this.navigate(window.location.href, 'page-slide-transition');
    }.bind(this));

    // On iOS, we don't have event bubbling to the document level.
    // http://www.quirksmode.org/blog/archives/2010/09/click_event_del.html
    var eventName = IOWA.Util.isIOS() || IOWA.Util.isTouchScreen() ?
        'touchstart' : 'click';

    document.addEventListener(eventName, this.onClick.bind(this));
  };

  /**
   * Handles all clicks on the document. Navigates to a new page state via
   *    ajax if the link has data-ajax-link attribute.
   * @param {Event} e Event that triggered navigation.
   * @private
   */
  Router.prototype.onClick = function(e) {
    // Allow user to open page in a new tab.
    if (e.metaKey || e.ctrlKey) {
      return;
    }
    // Inject page if <a> has the data-ajax-link attribute.
    for (var i = 0; i < e.path.length; ++i) {
      var el = e.path[i];
      if (el.localName === 'a') {
        // First, record click event if link requests it.
        if (el.hasAttribute(this.t.app.ANALYTICS_LINK_ATTR)) {
          IOWA.Analytics.trackEvent(
              'link', 'click', el.getAttribute(this.t.app.ANALYTICS_LINK_ATTR));
        }
        // Ignore links that go offsite.
        if (el.target) {
          return;
        }
        // Use IOWA.Util.smoothScroll for scroll links.
        if (el.getAttribute('data-transition') === 'smooth-scroll') {
          e.preventDefault();
          return;
        }
        if (el.hasAttribute('data-ajax-link')) {
          e.preventDefault();
          e.stopPropagation();
          this.navigate(el.href, e, el);
        }
        return; // found first navigation element, quit here.
      }
    }
  };

  /**
   * Transition name (data-transition attribute) to transition function map.
   * @type {Object}
   * @private
   */
  Router.pageExitTransitions = {
    'masthead-ripple-transition': 'playMastheadRippleTransition',
    'hero-card-transition': 'playHeroTransitionStart',
    'page-slide-transition': 'playPageSlideOut'
  };

  /**
   * Transition name (data-transition attribute) to transition function map.
   * @type {Object}
   * @private
   */
  Router.pageEnterTransitions = {
    'masthead-ripple-transition': 'playPageSlideIn',
    'hero-card-transition': 'playHeroTransitionEnd',
    'page-slide-transition': 'playPageSlideIn'
  };

  /**
   * Runs custom page handlers for load, unload, transitions if one is present.
   * @param {string} funcName 'load', 'unload' or 'onPageTransitionDone'.
   * @param {string} selectedPage Page element that owns the handler.
   * @return {Promise}
   * @private
   */
  Router.prototype.runPageHandler = function(funcName, selectedPage) {
    return new Promise(function(resolve) {
      if (selectedPage && selectedPage[funcName]) {
        selectedPage[funcName]();
      }
      resolve();
    });
  };

  /**
   * Updates the state of UI elements based on the current state of the router.
   * @private
   */
  Router.prototype.updateUIstate = function() {
    // Show correct subpage.
    var subpages = IOWA.Elements.Main.querySelectorAll('.subpage__content');
    var selectedSubpageSection = IOWA.Elements.Main.querySelector(
        '.subpage-' + this.state.current.subpage);

    if (selectedSubpageSection) {
      Array.prototype.forEach.call(subpages, function(subpage) {
        subpage.style.display = 'none';
      });
      selectedSubpageSection.style.display = '';
    }

    // If current href is different than the url, update it in the browser.
    if (this.state.current.href !== window.location.href) {
      history.pushState({
        path: this.state.current.path + this.state.current.hash
      }, '', this.state.current.href);
    }
  };

  /**
   * Runs full page transition. The order of the transition:
   *     + Start transition.
   *     + Play old page exit animation.
   *     + Run old page's custom unload handlers.
   *     + Load the new page.
   *     + Update state of the page in Router to the new page.
   *     + Update UI state based on the router's.
   *     + Run new page's custom load handlers.
   *     + Play new page entry animation.
   *     + End transition.
   * @param {Event} e Event that triggered the transition.
   * @param {Element} source Element that triggered the transition.
   * @private
   */
  Router.prototype.runPageTransition = function(e, source) {
    var transitionAttribute = source ?
        source.getAttribute('data-transition') : null;
    var transition = transitionAttribute || 'page-slide-transition';
    var router = this;

    // Start transition.
    router.t.fire('page-transition-start');

    var exitAnimation = IOWA.PageAnimation[Router.pageExitTransitions[transition]];
    var enterAnimation = IOWA.PageAnimation[Router.pageEnterTransitions[transition]];

    exitAnimation(router.state.start.page, router.state.end.page, e, source)
      .then(function() {
        // Select page in lazy-pages. In its own promise so the router state
        // happens in the next tick.
        IOWA.Elements.LazyPages.selected = router.state.end.page;
      })
      .then(function() {
        // Update state of the page in Router.
        router.state.current = router.parseUrl(router.state.end.href);
        // Update UI state based on the router's state.
        router.updateUIstate();
      })
      .then(enterAnimation)
      .then(function() {
        router.t.fire('page-transition-done'); // End transition.
      }).catch(function(e) {
        console.error(e);
        IOWA.Util.reportError(e);
      });
  };

  /**
   * Runs subpage transition. The order of the transition:
   *     + Play old subpage slide out animation.
   *     + Update state of the page in Router to the new page.
   *     + Update UI state based on the router's.
   *     + Play new subpage slide in animation.
   * @private
   */
  Router.prototype.runSubpageTransition = function() {
    var oldSubpage = IOWA.Elements.Main.querySelector(
        '.subpage-' + this.state.start.subpage);
    var newSubpage = IOWA.Elements.Main.querySelector(
        '.subpage-' + this.state.end.subpage);
    var router = this;

    // Run subpage transition if both subpages exist.
    if (oldSubpage && newSubpage) {
      // Play exit sequence.
      IOWA.PageAnimation.playSectionSlideOut(oldSubpage)
        .then(function() {
          // Update current state of the page in Router and Template.
          router.state.current = router.parseUrl(router.state.end.href);
          // Update UI state based on the router's state.
          return router.updateUIstate();
        })
        // Play entry sequence.
        .then(IOWA.PageAnimation.playSectionSlideIn.bind(null, newSubpage))
        .then(function() {
          router.runPageHandler(
              'onSubpageTransitionDone', IOWA.Elements.LazyPages.selectedPage);
        });
    }
  };

  /**
   * Navigates to a new state.
   * @param {string} href URL describing the new state.
   * @param {Event} e Event that triggered the transition.
   * @param {Element} source Element that triggered the transition.
   * @private
   */
  Router.prototype.navigate = function(href, e, source) {
    // Copy current state to startState.
    this.state.start = this.parseUrl(this.state.current.href);
    this.state.end = this.parseUrl(href);

    // Navigate to a new page.
    if (this.state.start.page !== this.state.end.page) {
      this.runPageTransition(e, source);
    } else if (this.state.start.subpage !== this.state.end.subpage) {
      this.runSubpageTransition();
    }
  };

  /**
   * Extracts page's state from the url.
   * Url structure:
   *    http://<origin>/io2016/<page>?<search>#<subpage>/<resourceId>
   * @param {string} url The page's url.
   * @return {Object} Page's state.
   */
  Router.prototype.parseUrl = function(url) {
    var parser = new URL(url);
    var hashParts = parser.hash.replace('#', '').split('/');
    var params = {};
    if (parser.search) {
      var paramsList = parser.search.replace('?', '').split('&');
      for (var i = 0; i < paramsList.length; i++) {
        var paramsParts = paramsList[i].split('=');
        params[paramsParts[0]] = decodeURIComponent(paramsParts[1]);
      }
    }
    var page = parser.pathname.replace(window.PREFIX + '/', '') || 'home';

    // If pages data is accessible, find default subpage.
    var pageMeta = (this.t && this.t.pages) ? this.t.pages[page] : null;
    var defaultSubpage = pageMeta ? pageMeta.defaultSubpage : '';

    // Get subpage from url or set to the default subpage for this page.
    var subpage = hashParts[0] || defaultSubpage;
    return {
      pathname: parser.pathname,
      search: parser.search,
      hash: parser.hash,
      href: parser.href,
      page: page,
      subpage: subpage,
      resourceId: hashParts[1],
      params: params
    };
  };

  /**
   * Builds a url from the page's state details.
   * Url structure:
   *    http://<origin>/io2016/<page>?<search>#<subpage>/<resourceId>
   * @param {string} page Name of the page.
   * @param {string} subpage Name of the subpage.
   * @param {string} resourceId Resource identifier.
   * @param {string} search Encoded search string.
   */
  Router.prototype.composeUrl = function(page, subpage, resourceId, search) {
    return [window.location.origin, window.PREFIX, '/', page, search,
        '#', subpage || '', '/', resourceId || ''].join('');
  };

  return new Router();
};
