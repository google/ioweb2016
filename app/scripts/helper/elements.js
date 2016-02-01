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

  function updateElements() {
    var ioLogo = document.querySelector('io-logo');
    ioLogo.addEventListener('io-logo-animation-done', function() {
      var dest = document.querySelector('[iologodestination]');
      dest.classList.add('active');

      // Load auth after logo transition is done. This helps timing with
      // fetching user's schedule and makes sure the worker has returned
      // the main schedule data.
      IOWA.Elements.GoogleSignIn.load = true;

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
    });

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

    var headerPanel = IOWA.Elements.Template.$.headerpanel;
    IOWA.Elements.ScrollContainer = headerPanel.scroller;

    this.initFabScroll();

    // Kickoff a11y helpers for elements
    IOWA.A11y.init();
  }

  function init() {
    var template = document.getElementById('t');

    template.app = {}; // Shared global properties among pages.
    template.app.pageTransitionDone = false;
    template.app.fullscreenVideoActive = false;
    template.app.isIOS = IOWA.Util.isIOS();
    template.app.ANALYTICS_LINK_ATTR = ANALYTICS_LINK_ATTR;

    template.pages = IOWA.PAGES; // defined in auto-generated ../pages.js
    template.selectedPage = IOWA.Router.parseUrl(window.location.href).page;
    template.scheduleData = null;
    template.savedSessions = [];

    // Sign-in defaults.
    template.isSignedIn = false;
    template.currentUser = null;

    IOWA.Util.setMetaThemeColor('#CFD8DC'); // bg-medium-grey in colors.scss.

    // template.closeVideoCard = function() {
    //   this.cardVideoTakeover(this.currentCard, true);
    //   this.toggleVideoOverlayNav();
    // };

    // /**
    //  * Material design video animation.
    //  *
    //  * @param {Element} card The card element to perform the takeover on.
    //  * @param {bool} opt_reverse If true, runs the animation in reverse.
    //  */
    // template.cardVideoTakeover = function(card, opt_reverse) {
    //   if (!card) {
    //     return;
    //   }

    //   var reverse = opt_reverse || false;

    //   // Forward animation sequence. The reverse sequence is played when reverse == true.
    //   // 1. Fade out the play button on the card.
    //   // 2. Transform/scale the video container down to the location and size of the clicked card.
    //   // 3. Remove 2's transform. This scales up video container to fill the viewport.
    //   // 4. Drop down the video controls overlay bar.
    //   // 5. Auto-play the video (on desktop). When it reaches the playing state, fade out the video thumbnail.

    //   var cardPhoto = card.querySelector('.card__photo');
    //   var videoContainer = document.querySelector('.fullvideo__container');
    //   var video = videoContainer.querySelector('.fullvideo__container google-youtube');

    //   var thumbnail = videoContainer.querySelector('.fullvideo_thumbnail');
    //   var playButton = card.querySelector('.play__button');

    //   var cardPhotoMetrics = cardPhoto.getBoundingClientRect();

    //   var viewportWidth = document.documentElement.clientWidth;
    //   var viewportHeight = document.documentElement.clientHeight;

    //   var scaleX = cardPhotoMetrics.width / viewportWidth;
    //   var scaleY = cardPhotoMetrics.height / viewportHeight;
    //   var top = cardPhotoMetrics.top + window.scrollY;

    //   video.pause(); // Pause a running video.

    //   var playButtonPlayer = playButton.animate([{opacity: 1}, {opacity: 0}], {
    //     duration: 350,
    //     iterations: 1,
    //     fill: 'forwards',
    //     easing: 'cubic-bezier(0,0,0.21,1)',
    //     direction: reverse ? 'reverse' : 'normal'
    //   });

    //   playButtonPlayer.onfinish = function() {
    //     var startTransform = 'translate(' + cardPhotoMetrics.left + 'px, ' + top + 'px) ' +
    //                          'scale(' + scaleX + ', ' + scaleY + ')';

    //     if (reverse) {
    //       // Fade in thumbnail before shrinking.
    //       thumbnail.classList.remove('fadeout');
    //     } else {
    //       // Scale down the video container before unhiding it.
    //       // TODO(ericbidelman): shouldn't have to do this. The initial state
    //       // is setup in the animate() below.
    //       videoContainer.style.transform = videoContainer.style.webkitTransform = startTransform;
    //     }

    //     // Container is shrunk and in the card's location.
    //     // Unhide it so thumbnail is visible.
    //     videoContainer.hidden = false;

    //     var player = videoContainer.animate([
    //       {transform: startTransform},
    //       {transform: 'translate(0, 0) scale(1)'}
    //     ], {
    //       duration: 400,
    //       direction: reverse ? 'reverse' : 'normal',
    //       iterations: 1,
    //       fill: 'forwards',
    //       easing: 'cubic-bezier(0.4,0,0.2,1)'
    //     });

    //     player.onfinish = function() {
    //       if (reverse) {
    //         this.set('app.fullscreenVideoActive', false); // remove from DOM.
    //         this.currentCard = null;
    //       } else {
    //         thumbnail.classList.add('fadeout');
    //         this.toggleVideoOverlayNav(); // Drop down back button control.
    //       }
    //     }.bind(this);
    //   }.bind(this);
    // };

    // template.openVideo = function(e) {
    //   var path = Polymer.dom(e).path;

    //   var target = null;
    //   for (var i = 0; i < path.length; ++i) {
    //     var el = path[i];
    //     if (el.classList && el.classList.contains('card__video')) {
    //       target = el;
    //       break;
    //     }
    //   }

    //   if (!target) {
    //     return;
    //   }

    //   this.currentCard = target; // Polymer.dom(e).rootTarget;
    //   this.set('app.fullscreenVideoActive', true); // Activate the placeholder template.

    //   Polymer.dom.flush();

    //   // Note: IE10 doesn't support .dataset.
    //   var videoId = this._toVideoIdFilter(
    //       this.currentCard.getAttribute('data-videoid'));

    //   IOWA.Analytics.trackEvent('video', 'watch', videoId);

    //   var videoContainer = document.querySelector('.fullvideo__container');
    //   var video = videoContainer.querySelector('google-youtube');

    //   video.addEventListener('google-youtube-ready', function() {
    //     video.videoId = videoId;
    //     this.cardVideoTakeover(this.currentCard);
    //   }.bind(this));

    //   var thumbnail = videoContainer.querySelector('.fullvideo_thumbnail');
    //   thumbnail.src = this.currentCard.getAttribute('data-videoimg'); // IE10 doesn't support .dataset.
    // };

    // template.closeMastheadVideo = function() {
    //   this.mastheadVideoActive = false;
    // };

    // template.openMastheadVideo = function(e) {
    //   var target = Polymer.dom(e).rootTarget;

    //   IOWA.Analytics.trackEvent(
    //       'link', 'click', target.getAttribute(ANALYTICS_LINK_ATTR));

    //   this.mastheadVideoActive = true; // stamp template

    //   Polymer.dom.flush();

    //   var dialog = IOWA.Elements.Main.querySelector('paper-dialog');
    //   var video = dialog.querySelector('google-youtube');

    //   video.addEventListener('google-youtube-ready', function() {
    //     dialog.toggle();
    //   });
    // };

    template.openShareWindow = function(e) {
      e.preventDefault();

      var type = Polymer.dom(e).rootTarget.getAttribute('data-share-type');
      var url = null;
      var width = 600;
      var height = 600;
      var winOptions = 'menubar=no,toolbar=no,resizable=yes,scrollbars=yes,height=' +
                       height + ',width=' + width;

      var title = document.title;

// TODO: update for polymer 1.0 port
      var selectedSession = Polymer.dom(e).rootTarget.templateInstance.model.selectedSession;
      if (selectedSession) {
        title = selectedSession.title;
      }

      // Shorten current URL so it's ready to go.
      IOWA.Util.shortenURL(location.href).then(function(shortURL) {
        switch (type) {
          case 'fb':
            height = 229;
            url = 'https://www.facebook.com/sharer.php?u=' +
                  encodeURIComponent(shortURL) +
                  '&t=' + encodeURIComponent(title);

            break;

          case 'gplus':
            height = 348;
            width = 512;
            url = 'https://plus.google.com/share?url=' +
                  encodeURIComponent(shortURL) +
                  '&hl=' + encodeURIComponent(document.documentElement.lang);
            break;

          case 'twitter':
            height = 253;

            var el = document.getElementById('share-text');
            var text = el.textContent || 'Google I/O 2016';

            if (selectedSession) {
              text = 'Check out "' + title + '" at #io16: ' + shortURL;
            }

            url = 'https://twitter.com/intent/tweet?text=' +
                   encodeURIComponent(text);

            break;

          default:

            return;
        }

        window.open(url, 'share', winOptions);
      });
    };

    template.openSettings = function(e) {
      var attr = Polymer.dom(e).rootTarget.getAttribute(ANALYTICS_LINK_ATTR);
      if (attr) {
        IOWA.Analytics.trackEvent('link', 'click', attr);
      }
      IOWA.Elements.Nav.querySelector('#signin-settings-panel').open();
    };

    template.setSelectedPageToHome = function() {
      this.selectedPage = 'home';
    };

    template.backToTop = function(e) {
      e.preventDefault();
      IOWA.Elements.ScrollContainer.scrollTop = 0;
    };

    template.onCountdownTimerThreshold = function(e, detail) {
      if (detail.label === 'Ended') {
        this.countdownEnded = true;
      }
    };

    template.signIn = function(e) {
      if (e) {
        e.preventDefault();
        if (e.target.hasAttribute(ANALYTICS_LINK_ATTR)) {
          IOWA.Analytics.trackEvent(
              'link', 'click', e.target.getAttribute(ANALYTICS_LINK_ATTR));
        }
      }
      IOWA.Elements.GoogleSignIn.signIn();
    };

    template.signOut = function(e) {
      if (e) {
        e.preventDefault();
        if (e.target.hasAttribute(ANALYTICS_LINK_ATTR)) {
          IOWA.Analytics.trackEvent(
              'link', 'click', e.target.getAttribute(ANALYTICS_LINK_ATTR));
        }
      }
      IOWA.Elements.GoogleSignIn.signOut();
    };

    template.updateNotifyUser = function(e) {
      // Both these functions are asynchronous and return promises. Since there's no specific
      // callback or follow-up that needs to be performed once they complete, the returned promise
      // is ignored.
      var target = Polymer.dom(e).rootTarget;
      if (target.checked) {
        // subscribePromise() handles registering a subscription with the browser's push manager
        // and toggling the notify state to true in the backend via an API call.
        IOWA.Notifications.subscribePromise().then(function() {
          IOWA.Elements.Template.dontAutoSubscribe = false;
        }).catch(function(error) {
          if (error && error.name === 'AbortError') {
            IOWA.Elements.Toast.showMessage('Please update your notification permissions', null, 'Learn how', function() {
              window.open('permissions', '_blank');
            });
          }
        });
      } else {
        // The steps to turn off notifications are broken down into two separate promises, the first
        // which unsubscribes from the browser's push manager and the second which sets the notify
        // state to false in the backend via an API call.
        // Note that we are deliberately not clearing the SW token stored in IDB, since that is tied
        // to the user's logged in state and will remain valid if notifications are re-enabled
        // later on.
        IOWA.Elements.Template.dontAutoSubscribe = true;
        IOWA.Notifications.unsubscribeFromPushManagerPromise()
          .then(IOWA.Notifications.disableNotificationsPromise)
          .catch(IOWA.Util.reportError);
      }
    };

    // Updates IOWA.Elements.GoogleSignIn.user.notify = true iff the browser supports notifications,
    // global notifications are enabled, the current browser has a push subscription,
    // and window.Notification.permission === 'granted'.
    // Updates IOWA.Elements.GoogleSignIn.user.notify = false otherwise.
    template.getNotificationState = function(e, detail) {
      // The core-overlay-open event that invokes this is called once when the overlay opens, and
      // once when it closes. We only want this code to run when the overlay opens.
      // detail is true when the setting panel is opened, and false when it's closed.
      if (!detail) {
        return;
      }

      // This sends a signal to the template that we're still calculating the proper state, and
      // that the checkbox should be disabled for the time being.
      IOWA.Elements.GoogleSignIn.user.notify = null;

      // First, check the things that can be done synchronously, before the promises.
      if (IOWA.Notifications.isSupported && window.Notification.permission === 'granted') {
        // Check to see if notifications are enabled globally, via an API call to the backend.
        IOWA.Notifications.isNotifyEnabledPromise().then(function(isGlobalNotifyEnabled) {
          if (isGlobalNotifyEnabled) {
            // If notifications are on globally, next check to see if there's an existing push
            // subscription for the current browser.
            IOWA.Notifications.isExistingSubscriptionPromise().then(function(isExistingSubscription) {
              // Set user.notify property based on whether there's an existing push manager subscription
              IOWA.Elements.GoogleSignIn.user.notify = isExistingSubscription;
            });
          } else {
            // If notifications are off globally, then always set the user.notify to false.
            IOWA.Elements.GoogleSignIn.user.notify = false;
          }
        }).catch(function() {
          // If something goes wrong while calculating the notifications state, just assume false.
          IOWA.Elements.GoogleSignIn.user.notify = false;
        });
      } else {
        // Wrap this in an async to ensure that the checked attribute is properly updated.
        this.async(function() {
          IOWA.Elements.GoogleSignIn.user.notify = false;
        });
      }
    };

    template.initFabScroll = function() {
      this.unlisten(this.$.headerpanel, 'content-scroll', '_onContentScroll');

      if (!this.app.isPhoneSize) {
        this.listen(this.$.headerpanel, 'content-scroll', '_onContentScroll');
      }
    };

    template._onContentScroll = function(e, detail) {
      var scroller = detail.target;
      var scrollTop = scroller.scrollTop;

      // TODO: consider caching these measurements ahead of time.
      var scrollerHeight = scroller.clientHeight;
      var totalScrollHeight = scroller.scrollHeight;
      var footerHeight = IOWA.Elements.Footer.clientHeight;
      var footerMargin = parseInt(
          getComputedStyle(IOWA.Elements.Footer).marginTop, 10);

      var OFFSET_TO_PIN = 100; // FAB sticks 100px from bottom of card.
      var MIN_SCROLL_BEFORE_SHOW = 100;

      this.$.fab.classList.toggle('active', scrollTop > MIN_SCROLL_BEFORE_SHOW);

      var fabPinTopAt = totalScrollHeight - footerHeight - footerMargin;

      var scrollDiff = fabPinTopAt - scrollTop;

      if (scrollDiff <= scrollerHeight) {
        this.$.fab.classList.remove('fixed');
        this.$.fab.style.position = 'absolute';
        this.$.fab.style.top = (fabPinTopAt - OFFSET_TO_PIN) + 'px';
      } else {
        this.$.fab.style.position = '';
        this.$.fab.style.top = '';
        this.$.fab.classList.add('fixed');
      }
    };

    template._isPage = function(page, selectedPage) {
      return page === selectedPage;
    };

    template._disableNotify = function(notify) {
      return notify === null;
    };

    template.closeDrawer = function() {
      this.$.appdrawer.closeDrawer();
    };

    template.addEventListener('dom-change', updateElements);

    template.addEventListener('page-transition-done', function() {
      this.set('app.pageTransitionDone', true);
      IOWA.Elements.NavPaperTabs.style.pointerEvents = '';
    });

    template.addEventListener('page-transition-start', function() {
      this.set('app.pageTransitionDone', false);
      IOWA.Elements.NavPaperTabs.style.pointerEvents = 'none';
    });

    IOWA.Elements.Template = template;
  }

  return {
    init: init
  };
})();
