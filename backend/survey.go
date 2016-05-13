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
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"
	"sort"
	"strings"

	"golang.org/x/net/context"

	"google.golang.org/appengine/log"
)

type epointPayload struct {
	SurveyID   string           `json:"SurveyId"`
	ObjectID   string           `json:"ObjectId"`
	Registrant string           `json:"RegistrantKey"`
	Responses  []epointResponse `json:"Responses"`
}

type epointResponse struct {
	Question string `json:"QuestionId"`
	Answer   string `json:"Response"`
}

type sessionSurvey struct {
	Overall   string `json:"overall"`   // Q1
	Relevance string `json:"relevance"` // Q2
	Content   string `json:"content"`   // Q3
	Speaker   string `json:"speaker"`   // Q4
}

func (s *sessionSurvey) valid() bool {
	ok := func(v string) bool {
		if v == "" {
			return true
		}
		i := sort.SearchStrings(config.Survey.Answers, v)
		return i < len(config.Survey.Answers) && config.Survey.Answers[i] == v
	}
	return ok(s.Overall) && ok(s.Relevance) && ok(s.Content) && ok(s.Speaker)
}

// addSessionSurvey marks session sid bookmarked by user uid as "feedback submitted",
// using token tok as firebase auth token.
//
// The uid is either a firebase user ID of google:123 form, or a google user ID
// with the google: prefix stripped.
func addSessionSurvey(ctx context.Context, tok, uid, sid string) error {
	gid := strings.TrimPrefix("google:", uid)
	shard := firebaseShard(gid)
	url := fmt.Sprintf("%s/data/%s/feedback_submitted_sessions/%s.json?auth=%s", shard, uid, sid, tok)
	req, err := http.NewRequest("PUT", url, strings.NewReader("true"))
	if err != nil {
		return err
	}

	res, err := httpClient(ctx).Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 299 {
		return nil
	}
	b, _ := ioutil.ReadAll(res.Body)
	return errors.New(string(b))
}

// submitSessionSurvey sends a request to config.Survey.Endpoint with s data
// according to https://api.eventpoint.com/2.3/Home/REST#evals docs.
func submitSessionSurvey(c context.Context, sid string, s *sessionSurvey) error {
	// dev config doesn't normally have a valid endpoint
	if config.Survey.Endpoint == "" {
		return nil
	}

	perr := prefixedErr("submitSessionSurvey")
	if v, ok := config.Survey.Smap[sid]; ok {
		sid = v
	}
	p := &epointPayload{
		SurveyID:   config.Survey.ID,
		ObjectID:   sid,
		Registrant: config.Survey.Reg,
		Responses:  make([]epointResponse, 0, 4),
	}
	if s.Overall != "" {
		p.Responses = append(p.Responses, epointResponse{
			Question: config.Survey.Q1,
			Answer:   s.Overall,
		})
	}
	if s.Relevance != "" {
		p.Responses = append(p.Responses, epointResponse{
			Question: config.Survey.Q2,
			Answer:   s.Relevance,
		})
	}
	if s.Content != "" {
		p.Responses = append(p.Responses, epointResponse{
			Question: config.Survey.Q3,
			Answer:   s.Content,
		})
	}
	if s.Speaker != "" {
		p.Responses = append(p.Responses, epointResponse{
			Question: config.Survey.Q4,
			Answer:   s.Speaker,
		})
	}

	b, err := json.Marshal(p)
	if err != nil {
		return perr(err)
	}
	if !isProd() {
		// log request body on staging for debugging
		log.Debugf(c, "%s: %s", config.Survey.Endpoint, b)
	}
	r, err := http.NewRequest("POST", config.Survey.Endpoint, bytes.NewReader(b))
	if err != nil {
		return perr(err)
	}
	r.Header.Set("apikey", config.Survey.Key)
	r.Header.Set("content-type", "application/json")
	res, err := httpClient(c).Do(r)
	if err != nil {
		return perr(err)
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusOK {
		return nil
	}
	b, _ = ioutil.ReadAll(res.Body)
	return perr(res.Status + ": " + string(b))
}
