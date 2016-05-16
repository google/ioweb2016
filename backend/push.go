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
	// TODO: add ioext data...  anything else?
}

type pushMessage struct {
	Notification notification `json:"notification"`
	Sessions     map[string]string
}

type notification struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	Tag   string `json:"tag"`
	Data  struct {
		URL string `json:"url"`
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
func filterUserChanges(dc *dataChanges, bks []string) {
	sort.Strings(bks)
	for id, s := range dc.Sessions {
		if s.Update == updateSurvey {
			// surveys don't have to match bookmarks
			continue
		}
		i := sort.SearchStrings(bks, id)
		if i >= len(bks) || bks[i] != id {
			delete(dc.Sessions, id)
		}
	}
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

	n := ""
	if len(sub.Auth) != 0 && len(sub.Key) != 0 {
		j, err := json.Marshal(msg)
		if err != nil {
			// The notification may be badly-formed
			// TODO: retry or not?
			return &pushError{msg: fmt.Sprintf("notifySubscription: %v", err), retry: false}
		}
		n = string(j)
	}

	logf(c, "pinging webpush endpoint: %s", sub.Endpoint)
	res, err := webpush.Send(httpClient(c), sub, n, auth)
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
