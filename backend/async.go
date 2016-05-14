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
	"path"

	"golang.org/x/net/context"
	"google.golang.org/appengine/taskqueue"
)

// notifySubscriberAsync creates an async job to begin notify subscribers.
func notifySubscribersAsync(c context.Context, d *dataChanges, all bool) error {
	changes, err := json.Marshal(d)
	if err != nil {
		return err
	}
	p := path.Join(config.Prefix, "/task/notify-subscribers")
	t := taskqueue.NewPOSTTask(p, url.Values{
		"changes": {string(changes)},
		"all":     {fmt.Sprintf("%v", all)},
	})
	_, err = taskqueue.Add(c, t, "")
	return err
}

func notifyShardAsync(c context.Context, shard, changes string, all bool) error {
	p := path.Join(config.Prefix, "/task/notify-shard")
	t := taskqueue.NewPOSTTask(p, url.Values{
		"shard":   {shard},
		"changes": {changes},
		"all":     {fmt.Sprintf("%v", all)},
	})
	_, err := taskqueue.Add(c, t, "")
	return err
}

func notifyUserAsync(c context.Context, uid, shard string, m *pushMessage) error {
	p := path.Join(config.Prefix, "/task/notify-user")
	msg, err := json.Marshal(m)
	if err != nil {
		return err
	}
	t := taskqueue.NewPOSTTask(p, url.Values{
		"uid":     {uid},
		"shard":   {shard},
		"message": {string(msg)},
	})
	_, err = taskqueue.Add(c, t, "")
	return err
}

// submitSurveyAsync schedules an async job to submit feedback survey s for session sid.
func submitSurveyAsync(c context.Context, sid string, s *sessionSurvey) error {
	payload, err := json.Marshal(s)
	if err != nil {
		return err
	}
	t := &taskqueue.Task{
		Path:    path.Join(config.Prefix, "/task/survey", sid),
		Payload: payload,
		Header:  http.Header{"Content-Type": {"application/json"}},
		Method:  "POST",
	}
	_, err = taskqueue.Add(c, t, "")
	return err
}
