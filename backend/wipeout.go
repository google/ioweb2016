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
	"net/http"
	"net/url"
	"strconv"
	"time"

	"golang.org/x/net/context"
)

func wipeoutShard(c context.Context, shard string) error {
	// 30 days ago as milliseconds since Unix epoch
	cutoff := time.Now().AddDate(0, 0, -30).Unix() * 1000

	q := url.Values{
		"orderBy": {`"last_activity_timestamp"`},
		"endAt":   {strconv.FormatInt(cutoff, 10)},
	}
	u := fmt.Sprintf("%s/users.json?%s", shard, q.Encode())
	res, err := firebaseClient(c).Get(u)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		return fmt.Errorf("error (%d) fetching wipeout user list", res.StatusCode)
	}

	var userData map[string]struct{}
	if err = json.NewDecoder(res.Body).Decode(&userData); err != nil {
		return err
	}

	if len(userData) == 0 {
		logf(c, "no users for wipeout on shard %q", shard)
		return nil
	}

	ch := make(chan error)

	for uid := range userData {
		go func(uid string) {
			ch <- wipeoutUser(c, shard, uid)
		}(uid)
	}

	for range userData {
		if err := <-ch; err != nil {
			return err
		}
	}

	return nil
}

func wipeoutUser(c context.Context, shard, uid string) error {
	logf(c, "wipeout for user %s on shard %s", uid, shard)

	client := firebaseClient(c)

	u := fmt.Sprintf("%s/data/%s.json", shard, uid)
	req, err := http.NewRequest("DELETE", u, nil)
	if err != nil {
		return err
	}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		return fmt.Errorf("error (%d) deleting session data for user %s", res.StatusCode, uid)
	}

	u = fmt.Sprintf("%s/users/%s.json", shard, uid)
	req, err = http.NewRequest("DELETE", u, nil)
	if err != nil {
		return err
	}
	res, err = client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		return fmt.Errorf("error (%d) deleting user data for user %s", res.StatusCode, uid)
	}

	return nil
}
