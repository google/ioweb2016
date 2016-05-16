// Copyright 2015 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package backend

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/googlechrome/push-encryption-go/webpush"
	"golang.org/x/net/context"
)

const (
	// eventSession.Update field
	updateDetails = "details"
	updateVideo   = "video"
	updateStart   = "start"
	updateSoon    = "soon"
	updateSurvey  = "survey"
)

//  userPush is user notification configuration.
type userPush struct {
	userID string

	Enabled       bool              `json:"web_notifications_enabled"`
	Subscriptions map[string]string `json:"web_push_subscriptions"`
}

// dataChanges represents a diff between two versions of data.
// See diff funcs for more details, e.g. diffEventData().
// TODO: add GobEncoder/Decoder to use gob instead of json when storing in DB.
type dataChanges struct {
	Token   string    `json:"token"`
	Updated time.Time `json:"ts"`
	eventData
}

type pushMessage struct {
	Notification *notification            `json:"notification"`
	Sessions     map[string]*eventSession `json:"sessions,omitempty"`
}

type notification struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	Tag   string `json:"tag,omitempty"`
	Data  struct {
		URL string `json:"url,omitempty"`
	} `json:"data"`
}

// isEmptyChange returns true if d is nil or its exported fields contain no items.
// d.Token and d.Changed are not considered.
func isEmptyChanges(d *dataChanges) bool {
	return d == nil || (len(d.Sessions) == 0 && len(d.Speakers) == 0 && len(d.Videos) == 0 && len(d.Tags) == 0)
}

// mergeChanges copies changes from src to dst.
// It doesn't do deep copy.
func mergeChanges(dst *dataChanges, src *dataChanges) {
	// TODO: find a more elegant way of doing this
	sessions := dst.Sessions
	if sessions == nil {
		sessions = make(map[string]*eventSession)
	}
	for id, s := range src.Sessions {
		sessions[id] = s
	}
	dst.Sessions = sessions

	speakers := dst.Speakers
	if speakers == nil {
		speakers = make(map[string]*eventSpeaker)
	}
	for id, s := range src.Speakers {
		speakers[id] = s
	}
	dst.Speakers = speakers

	videos := dst.Videos
	if videos == nil {
		videos = make(map[string]*eventVideo)
	}
	for id, s := range src.Videos {
		videos[id] = s
	}
	dst.Videos = videos

	dst.Updated = src.Updated
}

// filterUserChanges reduces dc to a subset matching session IDs to bks.
// It sorts bks with sort.Strings as a side effect.
func filterUserChanges(d *dataChanges, bks []string) *dataChanges {
	// Operate on a copy
	changes := *d
	changes.Sessions = make(map[string]*eventSession, len(d.Sessions))
	for k, v := range d.Sessions {
		changes.Sessions[k] = v
	}

	sort.Strings(bks)
	for id, s := range changes.Sessions {
		if s.Update == updateSurvey {
			// surveys don't have to match bookmarks
			continue
		}
		i := sort.SearchStrings(bks, id)
		if i >= len(bks) || bks[i] != id {
			delete(changes.Sessions, id)
		}
	}
	return &changes
}

// notifySubscription sends a message to a subscribed device.
// It follows HTTP Push spec https://tools.ietf.org/html/draft-thomson-webpush-http2.
//
// In a case where endpoint did not accept push request the return error
// will be of type *pushError with RetryAfter >= 0.
func notifySubscription(c context.Context, s string, msg *pushMessage) error {
	sub, err := webpush.SubscriptionFromJSON([]byte(s))
	if err != nil {
		// invalid subscription
		return &pushError{msg: fmt.Sprintf("notifySubscription: %v", err), remove: true}
	}

	var auth string
	if u := config.Google.GCM.Endpoint; u != "" && strings.HasPrefix(sub.Endpoint, u) {
		auth = config.Google.GCM.Key
	}

	// TODO: If subscription does not have keys, or is an old FF sub, send a tickle instead

	ns, err := json.Marshal(msg)
	if err != nil {
		// The notification may be badly-formed
		// TODO: retry or not?
		return &pushError{msg: fmt.Sprintf("notifySubscription: %v", err), retry: false}
	}

	logf(c, "pinging webpush endpoint: %s", sub.Endpoint)
	res, err := webpush.Send(httpClient(c), sub, string(ns), auth)
	if err != nil {
		return &pushError{msg: fmt.Sprintf("notifySubscription: %v", err), retry: true}
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusCreated {
		logf(c, "notify success!")
		return nil
	}
	b, _ := ioutil.ReadAll(res.Body)
	perr := &pushError{
		msg:    fmt.Sprintf("%s %s", res.Status, b),
		remove: res.StatusCode >= 400 && res.StatusCode < 500,
	}
	if !perr.remove {
		perr.retry = true
		perr.after = 10 * time.Second
	}
	return perr
}

func userNotifications(c context.Context, dc *dataChanges, bks []string) []*notification {
	fdc := filterUserChanges(dc, bks)

	logsess := make([]string, 0, len(fdc.Sessions))
	var s []*eventSession
	updates := make(map[string][]*eventSession)
	for k, v := range fdc.Sessions {
		logsess = append(logsess, k)
		s = append(s, v)
		updates[v.Update] = append(updates[v.Update], v)
	}
	logf(c, "sending %d updated sessions: %s", len(logsess), strings.Join(logsess, ", "))

	var n []*notification

	if len(updates[updateDetails]) > 0 {
		n = append(n, detailsNotification(updates[updateDetails]))
	}
	if len(updates[updateSoon]) > 0 {
		n = append(n, soonNotification())
	}
	if len(updates[updateStart]) > 0 {
		n = append(n, startNotification(updates[updateStart]))
	}
	if len(updates[updateVideo]) > 0 {
		n = append(n, videoNotification(updates[updateVideo]))
	}
	if len(updates[updateSurvey]) > 0 {
		n = append(n, surveyNotification())
	}

	return n
}

func formatSessionTitles(sessions []*eventSession) string {
	titles := make([]string, len(sessions))
	for i, s := range sessions {
	  titles[i] = s.Title
	}
	return strings.Join(titles, ", ")
}

func detailsNotification(sessions []*eventSession) *notification {
	vrb := "was"
	if len(sessions) != 1 {
		vrb = "were"
	}
	return &notification{
		Title: "Some events in My Schedule have been updated",
		Body:  fmt.Sprintf("%s %s updated", formatSessionTitles(sessions), vrb),
		Tag:   "session-details",
	}
}

func soonNotification() *notification {
	return &notification{
		Title: "Google I/O is starting soon",
		Body:  "Watch the Keynote live at 10:00am PDT on May 18.",
		Tag:   "io-soon",
		Data: struct {
			URL string `json:"url,omitempty"`
		}{"./"},
	}
}

func surveyNotification() *notification {
	return &notification{
		Title: "Submit session feedback",
		Body:  "Don't forget to rate sessions in My Schedule. We value your feedback!",
		Tag:   "survey",
	}
}

func videoNotification(sessions []*eventSession) *notification {
	// Special-case logic to handle the case where there's just one new video, since we can
	// make the clickthrough go directly to the session page.
	if len(sessions) == 1 {
		return &notification{
			Title: "The video for " + sessions[0].Title + " is available",
			Tag:   "video-available",
			Data: struct {
				URL string `json:"url,omitempty"`
			}{fmt.Sprintf("schedule?sid=%s", sessions[0].ID)},
		}
	}

	return &notification{
		Title: "Some events in My Schedule have new videos",
		Body:  fmt.Sprintf("New videos are available for %s", formatSessionTitles(sessions)),
		Tag:   "video-available",
	}
}

func startNotification(sessions []*eventSession) *notification {
	if len(sessions) == 1 {
		s := sessions[0]
		return &notification{
			Title: fmt.Sprintf("Starting: %s", s.Title),
			Body:  fmt.Sprintf("%s", s.Room),
			Tag:   "session-start",
		}
	}

	// New notifications with the same tag will replace any previous notifications with the same
	// tag, so there's no use sending multiple notifications with the same tag. Instead, create
	// one notification that has the list of all the sessions starting soon.
	return &notification{
		Title: "Some events in My Schedule are starting",
		Body:  fmt.Sprintf("%s are starting soon", formatSessionTitles(sessions)),
		Tag:   "session-start",
	}
}
