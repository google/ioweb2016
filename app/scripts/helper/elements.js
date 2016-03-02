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
    var onPageSelect = function() {
      document.body.removeEventListener('page-select', onPageSelect);

      // Load auth after initial page is setup. This helps do less upfront work
      // until the main schedule data is returned by the worker.
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
    };

    document.body.addEventListener('page-select', onPageSelect);

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

    IOWA.Elements.ScrollContainer = document.querySelector('#mainScrollingRegion');

    masthead.scroller = IOWA.Elements.ScrollContainer;
    masthead.scrollTarget = IOWA.Elements.ScrollContainer;

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
    template.app.scheduleData = null;
    template.app.savedSessions = [];
    template.app.dontAutoSubscribe = false;

    template.pages = IOWA.PAGES; // defined in auto-generated ../pages.js
    template.selectedPage = IOWA.Router.parseUrl(window.location.href).page;

    // Sign-in defaults.
    template.isSignedIn = false;
    template.currentUser = null;

    // FAB scrolling effect caches.
    template._fabCrossFooterThreshold = null; // Scroll limit when FAB sticks.
    template._fabPinTop = null; // Top to pin FAB at.

    IOWA.Util.setMetaThemeColor('#546E7A');

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
    //   IOWA.IOFirebase.markVideoAsViewed(videoId);

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

//     template.openShareWindow = function(e) {
//       e.preventDefault();

//       var type = Polymer.dom(e).rootTarget.getAttribute('data-share-type');
//       var url = null;
//       var width = 600;
//       var height = 600;
//       var winOptions = 'menubar=no,toolbar=no,resizable=yes,scrollbars=yes,height=' +
//                        height + ',width=' + width;

//       var title = document.title;

// // TODO: update for polymer 1.0 port
//       var selectedSession = Polymer.dom(e).rootTarget.templateInstance.model.selectedSession;
//       if (selectedSession) {
//         title = selectedSession.title;
//       }

//       // Shorten current URL so it's ready to go.
//       IOWA.Util.shortenURL(location.href).then(function(shortURL) {
//         switch (type) {
//           case 'fb':
//             height = 229;
//             url = 'https://www.facebook.com/sharer.php?u=' +
//                   encodeURIComponent(shortURL) +
//                   '&t=' + encodeURIComponent(title);

//             break;

//           case 'gplus':
//             height = 348;
//             width = 512;
//             url = 'https://plus.google.com/share?url=' +
//                   encodeURIComponent(shortURL) +
//                   '&hl=' + encodeURIComponent(document.documentElement.lang);
//             break;

//           case 'twitter':
//             height = 253;

//             var el = document.getElementById('share-text');
//             var text = el.textContent || 'Google I/O 2016';

//             if (selectedSession) {
//               text = 'Check out "' + title + '" at #io16: ' + shortURL;
//             }

//             url = 'https://twitter.com/intent/tweet?text=' +
//                    encodeURIComponent(text);

//             break;

//           default:

//             return;
//         }

//         window.open(url, 'share', winOptions);
//       });
//     };

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
      // Only smooth scroll when FAB is clicked. Otherwise we get transitions
      // if you navigate to a new page. Note, FF has scroll-behavior: smooth,
      // but it's not playing nicely with updateStyles();
      if (IOWA.Util.isFF()) {
        IOWA.Elements.ScrollContainer.scrollTop = 0;
      } else {
        this.$.mainScrollingRegion.classList.add('smoothscroll');
        IOWA.Elements.ScrollContainer.scrollTop = 0;
        this.$.mainScrollingRegion.classList.remove('smoothscroll');
      }
      // Move focus to the top of the page
      IOWA.A11y.focusNavigation();
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
      var target = Polymer.dom(e).localTarget;
      if (target.checked) {
        // subscribePromise() handles registering a subscription with the browser's push manager
        // and toggling the notify state to true in the backend via an API call.
        IOWA.Notifications.subscribePromise().then(function() {
          template.set('app.dontAutoSubscribe', false);
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
        this.set('app.dontAutoSubscribe', true);
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
      if (this.app.isPhoneSize) {
        return;
      }

      this.$.fab.style.top = ''; // clear out old styles.

      var scroller = IOWA.Elements.ScrollContainer;
      var fabMetrics = this.$.fab.getBoundingClientRect();

      // FAB stops when 1/2 of it crosses the footer.
      this._fabPinTop = scroller.scrollHeight -
                        IOWA.Elements.Footer.clientHeight -
                        fabMetrics.height / 2;

      this._fabCrossFooterThreshold = scroller.scrollHeight -
                                      scroller.clientHeight -
                                      fabMetrics.height;

      // Make sure FAB is in correct location when window is resized.
      this._setFabPosition(IOWA.Elements.ScrollContainer.scrollTop);

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

      this.$.navbar.classList.add('scrolled');
      this.$.fab.classList.add('active'); // Reveal FAB.
      this.debounce('updatefaba11y', function() {
        this.$.fabAnchor.setAttribute('tabindex', 0);
        this.$.fabAnchor.setAttribute('aria-hidden', false);
      }, 500);

      if (this._fabCrossFooterThreshold <= scrollTop) {
        this.$.fab.classList.remove('fixed');
        this.$.fab.style.top = (this._fabPinTop) + 'px';
      } else {
        this.$.fab.style.top = '';
        this.$.fab.classList.add('fixed');
      }
    };

    template._onContentScroll = function() {
      var scrollTop = IOWA.Elements.ScrollContainer.scrollTop;

      if (scrollTop === 0) {
        this.$.navbar.classList.remove('scrolled');
      } else {
        this.$.navbar.classList.add('scrolled');
      }

      // Note, we should not call this on every scroll event, but scoping
      // the update to the nav is very cheap (< 1ms).
      IOWA.Elements.NavPaperTabs.updateStyles();

      this._setFabPosition(scrollTop);
    };

    template._isPage = function(page, selectedPage) {
      return page === selectedPage;
    };

    template._disableNotify = function(notify) {
      return notify === null;
    };

    template.closeDrawer = function() {
      this.$.appdrawer.close();
    };

    template.addEventListener('dom-change', updateElements);

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
    init: init
  };
})();
