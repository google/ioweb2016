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
	"html"
	"io/ioutil"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"google.golang.org/appengine/memcache"

	"golang.org/x/net/context"
)

// socEntry is an item of the response from /api/social.
type socEntry struct {
	Kind   string      `json:"kind"`
	URL    string      `json:"url"`
	Text   string      `json:"text"`
	Author string      `json:"author"`
	When   time.Time   `json:"when"`
	URLs   interface{} `json:"urls"`
	Media  interface{} `json:"media"`
}

// socialEntries always picks twitter entries from cache,
// using shared memcache key.
//
// It returns nil if memcache call resulted in an error.
func socialEntries(c context.Context) []*socEntry {
	var entries []*socEntry
	if _, err := memcache.JSON.Get(c, cachedSocialKey, &entries); err != nil {
		errorf(c, "socialEntries(%q): %v", cachedSocialKey, err)
		return nil
	}
	return entries
}

// refreshSocialEntries fetches social entries from the network
// and updates cached copy on all memcache shards.
func refreshSocialEntries(c context.Context) error {
	client := twitterClient(c)
	ch := make(chan *tweetEntry, 100)
	done := make(chan struct{}, len(config.Twitter.Accounts))
	for _, a := range config.Twitter.Accounts {
		go func(a string) {
			ent, err := fetchTweets(client, a)
			if err != nil {
				errorf(c, "%s: %v", a, err)
			}
			for _, e := range ent {
				ch <- e
			}
			done <- struct{}{}
		}(a)
	}

	var entries []*socEntry
	var count int
loop:
	for {
		select {
		case t := <-ch:
			u := fmt.Sprintf("https://twitter.com/%s/status/%v", t.User.ScreenName, t.ID)
			se := &socEntry{
				Kind:   "tweet",
				URL:    u,
				Text:   html.UnescapeString(t.Text),
				Author: "@" + t.User.ScreenName,
				When:   time.Time(t.CreatedAt),
				Media:  t.Entities.Media,
				URLs:   t.Entities.URLs,
			}
			entries = append(entries, se)
		case <-done:
			count++
			if count == len(config.Twitter.Accounts) {
				// all goroutines have exited
				// no more tweets will be sent over ch
				close(done)
				close(ch)
				break loop
			}
		}
	}
	if len(entries) == 0 {
		// no reason to update cache with empty results
		return nil
	}

	entries = append(entries, socialEntries(c)...)
	sort.Sort(sortableSocial(entries))
	// take a max of n most recent tweets
	n := 10
	if len(entries) < n {
		n = len(entries)
	}
	entries = entries[:n]
	items := make([]*memcache.Item, len(allCachedSocialKeys))
	for i, k := range allCachedSocialKeys {
		items[i] = &memcache.Item{Key: k, Object: entries}
	}
	return memcache.JSON.SetMulti(c, items)
}

// fetchTweets retrieves tweet entries of the given account using User Timeline Twitter API.
// It returns the tweets that match config.Twitter.Filter.
func fetchTweets(client *http.Client, account string) ([]*tweetEntry, error) {
	params := url.Values{
		"screen_name": {account},
		"count":       {"200"},
		"include_rts": {"false"},
	}
	url := config.Twitter.TimelineURL + "?" + params.Encode()
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := ioutil.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetchTweets(%q): %s: %s", account, resp.Status, body)
	}

	var tweets []*tweetEntry
	if err := json.Unmarshal(body, &tweets); err != nil {
		return nil, err
	}
	res := make([]*tweetEntry, 0, len(tweets))
	for _, t := range tweets {
		if includesWord(t.Text, config.Twitter.Filter) {
			res = append(res, t)
		}
	}
	return res, nil
}

// includesWord returns true if s contains w followed by a space or a word delimiter.
func includesWord(s, w string) bool {
	lenw := len(w)
	for {
		i := strings.Index(s, w)
		if i < 0 {
			break
		}
		if i+lenw == len(s) {
			return true
		}
		if c := s[i+lenw]; c == ' ' || c == '.' || c == ',' || c == ':' || c == ';' || c == '-' {
			return true
		}
		s = s[i+lenw:]
	}
	return false
}

// tweetEntry is the entry format of Twitter API endpoint.
type tweetEntry struct {
	ID        string      `json:"id_str"`
	CreatedAt twitterTime `json:"created_at"`
	Text      string      `json:"text"`
	User      struct {
		ScreenName string `json:"screen_name"`
	} `json:"user"`
	Entities struct {
		URLs  interface{} `json:"urls"`
		Media interface{} `json:"media"`
	} `json:"entities"`
}

// twitterTime is a custom Time type to properly unmarshal Twitter timestamp.
type twitterTime time.Time

// UnmarshalJSON implements encoding/json#Unmarshaler interface.
func (t *twitterTime) UnmarshalJSON(b []byte) error {
	if len(b) == 0 {
		return nil
	}
	pt, err := time.Parse(time.RubyDate, string(b[1:len(b)-1]))
	if err != nil {
		return err
	}
	*t = twitterTime(pt)
	return nil
}

// sortableSocial implements sort.Sort interface using When field, in descending order.
type sortableSocial []*socEntry

func (s sortableSocial) Len() int           { return len(s) }
func (s sortableSocial) Swap(i, j int)      { s[i], s[j] = s[j], s[i] }
func (s sortableSocial) Less(i, j int) bool { return s[i].When.After(s[j].When) }
