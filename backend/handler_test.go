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
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/http2preload"
)

func TestServeSocialStub(t *testing.T) {
	t.Parallel()
	r, _ := aetestInstance.NewRequest("GET", "/api/v1/social", nil)
	w := httptest.NewRecorder()
	serveSocial(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("w.Code = %d; want %d", w.Code, http.StatusOK)
	}
	ctype := "application/json;charset=utf-8"
	if v := w.Header().Get("Content-Type"); v != ctype {
		t.Errorf("Content-Type: %q; want %q", v, ctype)
	}
}

func TestServeScheduleStub(t *testing.T) {
	defer preserveConfig()
	config.Env = "dev"

	r, _ := aetestInstance.NewRequest("GET", "/api/v1/schedule", nil)
	w := httptest.NewRecorder()
	serveSchedule(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("w.Code = %d; want %d", w.Code, http.StatusOK)
	}
	etag := w.Header().Get("etag")
	if etag == "" || etag == `""` {
		t.Fatalf("etag = %q; want non-empty", etag)
	}

	r, _ = aetestInstance.NewRequest("GET", "/api/v1/schedule", nil)
	r.Header.Set("if-none-match", etag)
	w = httptest.NewRecorder()
	serveSchedule(w, r)

	if w.Code != http.StatusNotModified {
		t.Errorf("w.Code = %d; want %d", w.Code, http.StatusNotModified)
	}
}

func TestServeSchedule(t *testing.T) {
	defer preserveConfig()
	config.Env = "prod"
	r, _ := aetestInstance.NewRequest("GET", "/api/v1/schedule", nil)
	c := newContext(r)

	checkRes := func(n int, w *httptest.ResponseRecorder, code int, hasEtag bool) string {
		if w.Code != code {
			t.Errorf("%d: w.Code = %d; want %d", n, w.Code, code)
		}
		etag := w.Header().Get("etag")
		if hasEtag && (etag == "" || etag == `""`) {
			t.Errorf("%d: etag = %q; want non-empty", n, etag)
		}
		if !hasEtag && etag != `""` {
			t.Errorf("%d: etag = %q; want %q", n, etag, `""`)
		}
		return etag
	}

	// 0: cache miss; 1: cache hit
	for i := 0; i < 2; i++ {
		// no etag, unless cached
		w := httptest.NewRecorder()
		serveSchedule(w, r)
		checkRes(1, w, http.StatusOK, i > 0)

		// first etag
		if err := storeEventData(c, &eventData{modified: time.Now()}); err != nil {
			t.Fatal(err)
		}
		w = httptest.NewRecorder()
		serveSchedule(w, r)
		etag := checkRes(2, w, http.StatusOK, true)

		r.Header.Set("if-none-match", etag)
		w = httptest.NewRecorder()
		serveSchedule(w, r)
		checkRes(3, w, http.StatusNotModified, true)

		// new etag
		if err := storeEventData(c, &eventData{modified: time.Now()}); err != nil {
			t.Fatal(err)
		}
		w = httptest.NewRecorder()
		serveSchedule(w, r)
		etag = checkRes(4, w, http.StatusOK, true)

		w = httptest.NewRecorder()
		r.Header.Set("if-none-match", etag)
		serveSchedule(w, r)
		checkRes(5, w, http.StatusNotModified, true)

		// star etag
		w = httptest.NewRecorder()
		r.Header.Set("if-none-match", "*")
		serveSchedule(w, r)
		lastEtag := checkRes(5, w, http.StatusOK, true)
		if lastEtag != etag {
			t.Errorf("lastEtag = %q; want %q", lastEtag, etag)
		}
	}
}

func TestServeTemplate(t *testing.T) {
	defer preserveConfig()()
	const ctype = "text/html;charset=utf-8"
	config.Prefix = "/root"

	table := []struct{ path, slug, canonical string }{
		{"/", "home", "http://example.org/root/"},
		{"/home?experiment", "home", "http://example.org/root/"},
		{"/about", "about", "http://example.org/root/about"},
		{"/about?experiment", "about", "http://example.org/root/about"},
		{"/about?some=param", "about", "http://example.org/root/about"},
		{"/schedule", "schedule", "http://example.org/root/schedule"},
		{"/schedule?sid=not-there", "schedule", "http://example.org/root/schedule"},
		{"/attend", "attend", "http://example.org/root/attend"},
		{"/extended", "extended", "http://example.org/root/extended"},
		{"/registration", "registration", "http://example.org/root/registration"},
		{"/faq", "faq", "http://example.org/root/faq"},
		{"/form", "form", "http://example.org/root/form"},
	}
	for i, test := range table {
		r, _ := aetestInstance.NewRequest("GET", test.path, nil)
		r.Host = "example.org"
		w := httptest.NewRecorder()
		serveTemplate(w, r)

		if w.Code != http.StatusOK {
			t.Errorf("%d: GET %s = %d; want %d", i, test.path, w.Code, http.StatusOK)
			continue
		}
		if v := w.Header().Get("Content-Type"); v != ctype {
			t.Errorf("%d: Content-Type: %q; want %q", i, v, ctype)
		}
		if w.Header().Get("Cache-Control") == "" {
			t.Errorf("%d: want cache-control header", i)
		}

		body := string(w.Body.String())

		tag := `<body id="page-` + test.slug + `"`
		if !strings.Contains(body, tag) {
			t.Errorf("%d: %s does not contain %s", i, body, tag)
		}
		tag = `<link rel="canonical" href="` + test.canonical + `"`
		if !strings.Contains(body, tag) {
			t.Errorf("%d: %s does not contain %s", i, body, tag)
		}
	}
}

func TestH2Preload(t *testing.T) {
	defer preserveConfig()()
	// verify we have a h2preload config file
	var err error
	if h2config, err = http2preload.ReadManifest("h2preload.json"); err != nil {
		t.Fatalf("h2preload: %v", err)
	}
	// replace actual file content with test entries
	h2config = http2preload.Manifest{
		"home": {
			"elements/elements.html": http2preload.AssetOpt{Type: "document"},
			"elements/elements.js":   http2preload.AssetOpt{Type: "script"},
			"styles/main.css":        http2preload.AssetOpt{Type: "style"},
		},
	}
	config.Prefix = "/root"

	r, _ := aetestInstance.NewRequest("GET", "/", nil)
	r.Host = "example.org"
	w := httptest.NewRecorder()
	serveTemplate(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("w.Code = %d; want %d", w.Code, http.StatusOK)
	}
	links := strings.Join(w.Header()["Link"], "\n")
	want := []string{
		"https://example.org/root/elements/elements.html",
		"https://example.org/root/elements/elements.js",
		"https://example.org/root/styles/main.css",
	}
	for _, v := range want {
		if !strings.Contains(links, v) {
			t.Errorf("want %s in\n%v", v, links)
		}
	}
}

func TestServeTemplateRedirect(t *testing.T) {
	t.Parallel()
	table := []struct{ start, redirect string }{
		{"/about/", "/about"},
		{"/one/two/", "/one/two"},
	}
	for i, test := range table {
		r, _ := aetestInstance.NewRequest("GET", test.start, nil)
		w := httptest.NewRecorder()
		serveTemplate(w, r)

		if w.Code != http.StatusFound {
			t.Fatalf("%d: GET %s: %d; want %d", i, test.start, w.Code, http.StatusFound)
		}
		redirect := config.Prefix + test.redirect
		if loc := w.Header().Get("Location"); loc != redirect {
			t.Errorf("%d: Location: %q; want %q", i, loc, redirect)
		}
	}
}

func TestServeTemplate404(t *testing.T) {
	t.Parallel()
	r, _ := aetestInstance.NewRequest("GET", "/a-thing-that-is-not-there", nil)
	w := httptest.NewRecorder()
	serveTemplate(w, r)
	if w.Code != http.StatusNotFound {
		t.Errorf("GET %s: %d; want %d", r.URL.String(), w.Code, http.StatusNotFound)
	}
	const ctype = "text/html;charset=utf-8"
	if v := w.Header().Get("Content-Type"); v != ctype {
		t.Errorf("Content-Type: %q; want %q", v, ctype)
	}
	if v := w.Header().Get("Cache-Control"); v != "" {
		t.Errorf("don't want Cache-Control: %q", v)
	}
}

func TestServeSessionTemplate(t *testing.T) {
	t.Parallel()
	defer resetTestState(t)
	c := newContext(newTestRequest(t, "GET", "/", nil))
	if err := storeEventData(c, &eventData{Sessions: map[string]*eventSession{
		"123": {
			Title: "Session",
			Desc:  "desc",
			Photo: "http://image.jpg",
		},
	}}); err != nil {
		t.Fatal(err)
	}

	table := []*struct{ p, title, desc, image string }{
		{"/schedule", "Schedule", descDefault, config.Prefix + "/" + ogImageDefault},
		{"/schedule?sid=not-there", "Schedule", descDefault, config.Prefix + "/" + ogImageDefault},
		{"/schedule?sid=123", "Session - Google I/O Schedule", "desc", "http://image.jpg"},
	}

	for i, test := range table {
		lookup := []string{
			`<title>` + test.title + `</title>`,
			`<meta itemprop="name" content="` + test.title + `">`,
			`<meta itemprop="description" content="` + test.desc + `">`,
			`<meta itemprop="image" content="` + test.image + `">`,
			`<meta name="twitter:title" content="` + test.title + `">`,
			`<meta name="twitter:description" content="` + test.desc + `">`,
			`<meta name="twitter:image:src" content="` + test.image + `">`,
			`<meta property="og:title" content="` + test.title + `">`,
			`<meta property="og:description" content="` + test.desc + `">`,
			`<meta property="og:image" content="` + test.image + `">`,
		}
		r := newTestRequest(t, "GET", test.p, nil)
		w := httptest.NewRecorder()
		serveTemplate(w, r)
		if w.Code != http.StatusOK {
			t.Errorf("%d: w.Code = %d; want 200", i, w.Code)
		}
		miss := 0
		for _, s := range lookup {
			if !strings.Contains(w.Body.String(), s) {
				t.Errorf("%d: missing %s", i, s)
				miss++
			}
		}
		if miss > 0 {
			t.Errorf("%d: %d meta tags are missing in layout:\n%s", i, miss, w.Body.String())
		}
	}
}

func TestServeEmbed(t *testing.T) {
	defer resetTestState(t)
	defer preserveConfig()()

	now := time.Now().Round(time.Second).UTC()
	config.Schedule.Start = now
	config.Schedule.Location = time.UTC
	config.Prefix = "/pref"

	r := newTestRequest(t, "GET", "/embed", nil)
	r.Host = "example.org"
	c := newContext(r)

	if err := storeEventData(c, &eventData{Sessions: map[string]*eventSession{
		"live": {
			StartTime: now,
			IsLive:    true,
			YouTube:   "live",
			Desc:      "Channel 1",
		},
		"recorded": {
			StartTime: now,
			IsLive:    false,
			YouTube:   "http://recorded",
			Desc:      "Channel 1",
		},
		keynoteID: {
			StartTime: now,
			IsLive:    true,
			YouTube:   "keynote",
		},
		"same-live": {
			StartTime: now,
			IsLive:    true,
			YouTube:   "live",
			Desc:      "Channel 1",
		},
	}}); err != nil {
		t.Fatal(err)
	}

	w := httptest.NewRecorder()
	serveTemplate(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("w.Code = %d; want 200\nResponse: %s", w.Code, w.Body.String())
	}
	lookup := []string{
		`<link rel="canonical" href="http://example.org/pref/embed">`,
		`start-date="` + now.Format(time.RFC3339) + `"`,
		`video-ids='["keynote","live"]'`,
	}
	err := false
	for _, v := range lookup {
		if !strings.Contains(w.Body.String(), v) {
			err = true
			t.Errorf("does not contain %s", v)
		}
	}
	if err {
		t.Logf("response: %s", w.Body.String())
	}
}

func TestServeLivestream(t *testing.T) {
	defer resetTestState(t)
	defer preserveConfig()()

	now := time.Now().Round(time.Second).UTC()
	config.Env = "prod"
	config.Schedule.Start = now
	config.Schedule.Location = time.UTC

	r := newTestRequest(t, "GET", "/api/v1/livestream", nil)
	c := newContext(r)

	if err := storeEventData(c, &eventData{Sessions: map[string]*eventSession{
		"live": {
			StartTime: now.Add(time.Millisecond),
			IsLive:    true,
			YouTube:   "live",
			Desc:      "Channel 1",
		},
		"recorded": {
			StartTime: now,
			IsLive:    false,
			YouTube:   "http://recorded",
			Desc:      "Channel 1",
		},
		keynoteID: {
			StartTime: now,
			IsLive:    true,
			YouTube:   "keynote",
		},
		"same-live": {
			StartTime: now,
			IsLive:    true,
			YouTube:   "live",
			Desc:      "Channel 1",
		},
	}}); err != nil {
		t.Fatal(err)
	}

	w := httptest.NewRecorder()
	serveLivestream(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("w.Code = %d; want 200\nResponse: %s", w.Code, w.Body.String())
	}

	var res []string
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("%s: %v", w.Body.String(), err)
	}
	want := []string{"keynote", "live"}
	if !reflect.DeepEqual(res, want) {
		t.Errorf("res = %v; want %v", res, want)
	}
}

func TestServeSitemap(t *testing.T) {
	defer resetTestState(t)
	defer preserveConfig()()

	c := newContext(newTestRequest(t, "GET", "/", nil))
	if err := storeEventData(c, &eventData{
		modified: time.Now(),
		Sessions: map[string]*eventSession{
			"123": {ID: "123"},
		},
	}); err != nil {
		t.Fatal(err)
	}

	config.Prefix = "/pref"
	r := newTestRequest(t, "GET", "/sitemap.xml", nil)
	r.Host = "example.org"
	r.TLS = &tls.ConnectionState{}
	w := httptest.NewRecorder()
	serveSitemap(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("w.Code = %d; want 200", w.Code)
	}

	lookup := []struct {
		line  string
		found bool
	}{
		{`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`, true},
		{`<loc>https://example.org/pref/</loc>`, true},
		{`<loc>https://example.org/pref/about</loc>`, true},
		{`<loc>https://example.org/pref/schedule</loc>`, true},
		{`<loc>https://example.org/pref/schedule?sid=123</loc>`, true},
		{`<loc>https://example.org/pref/home`, false},
		{`<loc>https://example.org/pref/embed`, false},
		{`<loc>https://example.org/pref/upgrade`, false},
		{`<loc>https://example.org/pref/admin`, false},
		{`<loc>https://example.org/pref/debug`, false},
		{`<loc>https://example.org/pref/error_`, false},
	}
	err := false
	for _, l := range lookup {
		found := strings.Contains(w.Body.String(), l.line)
		if !found && l.found {
			err = true
			t.Errorf("does not contain %s", l.line)
		}
		if found && !l.found {
			err = true
			t.Errorf("contain %s", l.line)
		}
	}
	if err {
		t.Errorf("response:\n%s", w.Body.String())
	}
}

func TestServeManifest(t *testing.T) {
	defer preserveConfig()()
	config.Google.GCM.Sender = "sender-123"

	r, _ := http.NewRequest("GET", "/manifest.json", nil)
	w := httptest.NewRecorder()
	serveManifest(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("w.Code = %d; want 200", w.Code)
	}
	res := map[string]interface{}{}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if v, ok := res["gcm_sender_id"].(string); !ok || v != "sender-123" {
		t.Errorf("gcm_sender_id = %v; want 'sender-123'", res["gcm_sender_id"])
	}
}

// TODO: refactor when ported to firebase and 2016 eventpoint.
//
//func TestSubmitUserSurvey(t *testing.T) {
//	defer resetTestState(t)
//	defer preserveConfig()()
//
//	c := newContext(newTestRequest(t, "GET", "/dummy", nil))
//	if err := storeCredentials(c, &oauth2Credentials{
//		userID:      testUserID,
//		Expiry:      time.Now().Add(2 * time.Hour),
//		AccessToken: "dummy-access",
//	}); err != nil {
//		t.Fatal(err)
//	}
//	if err := storeLocalAppFolderMeta(c, testUserID, &appFolderData{
//		FileID: "file-123",
//		Etag:   "xxx",
//	}); err != nil {
//		t.Fatal(err)
//	}
//	if err := storeEventData(c, &eventData{Sessions: map[string]*eventSession{
//		"ok":        {Id: "ok", StartTime: time.Now().Add(-10 * time.Minute)},
//		"submitted": {Id: "submitted", StartTime: time.Now().Add(-10 * time.Minute)},
//		"disabled":  {Id: "disabled", StartTime: time.Now().Add(-10 * time.Minute)},
//		"too-early": {Id: "too-early", StartTime: time.Now().Add(10 * time.Minute)},
//	}}); err != nil {
//		t.Fatal(err)
//	}
//
//	// Google Drive API endpoint
//	feedbackIDs := []string{"submitted", "ok"}
//	gdrive := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
//		w.Header().Set("Content-Type", "application/json")
//		if r.Method == "GET" {
//			w.Write([]byte(`{
//				"starred_sessions": ["submitted", "too-early", "disabled"],
//				"feedback_submitted_sessions": ["submitted"]
//			}`))
//			return
//		}
//		data := &appFolderData{}
//		if err := json.NewDecoder(r.Body).Decode(data); err != nil {
//			t.Error(err)
//			http.Error(w, err.Error(), http.StatusBadRequest)
//			return
//		}
//		if v := []string{"submitted", "too-early", "disabled"}; !compareStringSlices(data.Bookmarks, v) {
//			t.Errorf("data.Bookmarks = %v; want %v", data.Bookmarks, v)
//		}
//		if !compareStringSlices(data.Survey, feedbackIDs) {
//			t.Errorf("data.Survey = %v; want %v", data.Survey, feedbackIDs)
//		}
//	}))
//	defer gdrive.Close()
//
//	// Survey API endpoint
//	submitted := false
//	ep := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
//		defer func() { submitted = true }()
//		if h := r.Header.Get("code"); h != "ep-code" {
//			t.Errorf("code = %q; want 'ep-code'", h)
//		}
//		if h := r.Header.Get("apikey"); h != "ep-key" {
//			t.Errorf("apikey = %q; want 'ep-key'", h)
//		}
//		if err := r.ParseForm(); err != nil {
//			t.Errorf("r.ParseForm: %v", err)
//			return
//		}
//		params := url.Values{
//			"surveyId":      {"io-survey"},
//			"objectid":      {"ok-mapped"},
//			"registrantKey": {"registrant"},
//			"q1-param":      {"five"},
//			"q2-param":      {"four"},
//			"q3-param":      {"three"},
//			"q4-param":      {"two"},
//			"q5-param":      {""},
//		}
//		if !reflect.DeepEqual(r.Form, params) {
//			t.Errorf("r.Form = %v; want %v", r.Form, params)
//		}
//	}))
//	defer ep.Close()
//
//	config.Env = "prod"
//	config.Google.Drive.FilesURL = gdrive.URL
//	config.Google.Drive.UploadURL = gdrive.URL
//	config.Survey.Endpoint = ep.URL + "/"
//	config.Survey.ID = "io-survey"
//	config.Survey.Reg = "registrant"
//	config.Survey.Key = "ep-key"
//	config.Survey.Code = "ep-code"
//	config.Survey.Disabled = []string{"disabled"}
//	config.Survey.Smap = map[string]string{
//		"ok": "ok-mapped",
//	}
//	config.Survey.Qmap.Q1.Name = "q1-param"
//	config.Survey.Qmap.Q1.Answers = map[string]string{"5": "five"}
//	config.Survey.Qmap.Q2.Name = "q2-param"
//	config.Survey.Qmap.Q2.Answers = map[string]string{"4": "four"}
//	config.Survey.Qmap.Q3.Name = "q3-param"
//	config.Survey.Qmap.Q3.Answers = map[string]string{"3": "three"}
//	config.Survey.Qmap.Q4.Name = "q4-param"
//	config.Survey.Qmap.Q4.Answers = map[string]string{"2": "two"}
//	config.Survey.Qmap.Q5.Name = "q5-param"
//
//	const feedback = `{
//		"overall": "5",
//		"relevance": "4",
//		"content": "3",
//		"speaker": "2"
//	}`
//
//	table := []*struct {
//		sid  string
//		code int
//	}{
//		{"ok", http.StatusCreated},
//		{"not-there", http.StatusNotFound},
//		{"submitted", http.StatusBadRequest},
//		{"disabled", http.StatusBadRequest},
//		{"too-early", http.StatusBadRequest},
//		{"", http.StatusNotFound},
//	}
//
//	for i, test := range table {
//		submitted = false
//		r := newTestRequest(t, "PUT", "/api/v1/user/survey/"+test.sid, strings.NewReader(feedback))
//		r.Header.Set("authorization", bearerHeader+testIDToken)
//		w := httptest.NewRecorder()
//		handleUserSurvey(w, r)
//
//		if w.Code != test.code {
//			t.Errorf("%d: w.Code = %d; want %d\nResponse: %s", i, w.Code, test.code, w.Body.String())
//		}
//		if test.code > 299 {
//			if submitted {
//				t.Errorf("%d: submitted = true; want false", i)
//			}
//			continue
//		}
//
//		var list []string
//		if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
//			t.Fatalf("%d: %v", i, err)
//		}
//		if !compareStringSlices(list, feedbackIDs) {
//			t.Errorf("%d: list = %v; want %v", i, list, feedbackIDs)
//		}
//
//		if !submitted {
//			t.Errorf("%d: submitted = false; want true", i)
//		}
//	}
//}

func TestFirstSyncEventData(t *testing.T) {
	defer resetTestState(t)
	defer preserveConfig()()

	lastMod := time.Date(2015, 4, 15, 0, 0, 0, 0, time.UTC)
	startDate := time.Date(2015, 5, 28, 22, 0, 0, 0, time.UTC)

	const scheduleFile = `{
		"rooms":[
			{
				"id":"room-id",
				"name":"Community Lounge"
			}
		],
		"video_library":[
			{
				"thumbnailUrl":"http://img.youtube.com/test.jpg",
				"id":"video-id",
				"title":"Map Up your Apps!",
				"desc":"video desc",
				"year":2015,
				"topic":"Tools",
				"speakers":"Some Dude"
			}
		],
		"sessions":[
			{
				"id":"session-id",
				"url":"https://www.google.com",
				"title":"Introduction to Classroom",
				"description":"session desc",
				"startTimestamp":"2015-05-28T22:00:00Z",
				"endTimestamp":"2015-05-28T23:00:00Z",
				"isLivestream":true,
				"tags":["TYPE_BOXTALKS"],
				"speakers":["speaker-id"],
				"room":"room-id"
			}
		],
		"speakers":[
			{
				"id":"speaker-id",
				"name":"Google Devs",
				"bio":"speaker bio",
				"company":"Google",
				"plusoneUrl":"https://plus.google.com/user-id",
				"twitterUrl":"https://twitter.com/googledevs"
			}
		],
		"tags":[
			{
				"category":"TYPE",
				"tag":"TYPE_BOXTALKS",
				"name":"Boxtalks"
			}
		]
	}`

	video := &eventVideo{
		ID:       "video-id",
		Thumb:    "http://img.youtube.com/test.jpg",
		Title:    "Map Up your Apps!",
		Desc:     "video desc",
		Topic:    "Tools",
		Speakers: "Some Dude",
	}
	session := &eventSession{
		ID:        "session-id",
		Title:     "Introduction to Classroom",
		Desc:      "session desc",
		IsLive:    true,
		Tags:      []string{"TYPE_BOXTALKS"},
		Speakers:  []string{"speaker-id"},
		Room:      "Community Lounge",
		StartTime: startDate,
		EndTime:   startDate.Add(1 * time.Hour),
		Day:       28,
		Block:     "3 PM",
		Start:     "3:00 PM",
		End:       "4:00 PM",
		Duration:  "1 hour",
		Filters: map[string]bool{
			"Boxtalks":       true,
			liveStreamedText: true,
		},
	}
	speaker := &eventSpeaker{
		ID:      "speaker-id",
		Name:    "Google Devs",
		Bio:     "speaker bio",
		Company: "Google",
		Plusone: "https://plus.google.com/user-id",
		Twitter: "https://twitter.com/googledevs",
	}
	tag := &eventTag{
		Cat:  "TYPE",
		Tag:  "TYPE_BOXTALKS",
		Name: "Boxtalks",
	}

	done := make(chan struct{}, 1)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/manifest.json" {
			w.Header().Set("last-modified", lastMod.Format(http.TimeFormat))
			w.Write([]byte(`{"data_files": ["schedule.json"]}`))
			return
		}
		if r.URL.Path != "/schedule.json" {
			t.Errorf("slurp path = %q; want /schedule.json", r.URL.Path)
		}
		w.Write([]byte(scheduleFile))
		done <- struct{}{}
	}))
	defer ts.Close()

	config.Schedule.ManifestURL = ts.URL + "/manifest.json"
	config.Schedule.Start = startDate

	r := newTestRequest(t, "POST", "/sync/gcs", nil)
	r.Header.Set("x-goog-channel-token", "sync-token")
	w := httptest.NewRecorder()
	syncEventData(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("w.Code = %d; want 200", w.Code)
	}

	select {
	case <-done:
		// passed
	default:
		t.Fatalf("slurp never happened")
	}

	data, err := getLatestEventData(newContext(r), nil)
	if err != nil {
		t.Fatalf("getLatestEventData: %v", err)
	}
	if data.modified.Unix() != lastMod.Unix() {
		t.Errorf("data.modified = %s; want %s", data.modified, lastMod)
	}
	if v := data.Videos["video-id"]; !reflect.DeepEqual(v, video) {
		t.Errorf("video = %+v\nwant %+v", v, video)
	}
	if v := data.Sessions["session-id"]; !reflect.DeepEqual(v, session) {
		t.Errorf("session = %+v\nwant %+v", v, session)
	}
	if v := data.Speakers["speaker-id"]; !reflect.DeepEqual(v, speaker) {
		t.Errorf("speaker = %+v\nwant %+v", v, speaker)
	}
	if v := data.Tags["TYPE_BOXTALKS"]; !reflect.DeepEqual(v, tag) {
		t.Errorf("tag = %+v\nwant %+v", v, tag)
	}
}

func TestSyncEventDataEmtpyDiff(t *testing.T) {
	defer resetTestState(t)
	defer preserveConfig()()

	const scheduleFile = `{
		"sessions":[
			{
				"id":"__keynote__",
				"url":"https://events.google.com/io2015/",
				"title":"Keynote",
				"description":"DESCRIPTION",
				"startTimestamp":"2015-05-28T22:00:00Z",
				"endTimestamp":"2015-05-28T23:00:00Z",
				"isLivestream":true,
				"tags":["FLAG_KEYNOTE"],
				"speakers":[],
				"room":"room-id",
				"photoUrl": "http://example.org/photo",
				"youtubeUrl": "http://example.org/video"
			}
		]
	}`

	times := []time.Time{time.Now().UTC(), time.Now().Add(10 * time.Second).UTC()}
	mcount, scount := 0, 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/manifest.json" {
			w.Header().Set("last-modified", times[mcount].Format(http.TimeFormat))
			w.Write([]byte(`{"data_files": ["schedule.json"]}`))
			mcount++
			return
		}
		w.Write([]byte(scheduleFile))
		scount++
	}))
	defer ts.Close()

	config.Schedule.ManifestURL = ts.URL + "/manifest.json"
	config.Schedule.Start = time.Date(2015, 5, 28, 9, 30, 0, 0, time.UTC)

	r := newTestRequest(t, "POST", "/sync/gcs", nil)
	r.Header.Set("x-goog-channel-token", "sync-token")
	w := httptest.NewRecorder()
	c := newContext(r)

	for i := 1; i < 3; i++ {
		syncEventData(w, r)
		if w.Code != http.StatusOK {
			t.Errorf("w.Code = %d; want 200", w.Code)
		}
		if mcount != i || scount != i {
			t.Errorf("mcount = %d, scount = %d; want both %d", mcount, scount, i)
		}

		dc, err := getChangesSince(c, times[0].Add(-10*time.Second))
		if err != nil {
			t.Fatalf("getChangesSince: %v", err)
		}
		if l := len(dc.Sessions); l != 0 {
			t.Errorf("len(dc.Sessions) = %d; want 0\ndc.Sessions: %v", l, dc.Sessions)
		}
	}
}

func TestSyncEventDataWithDiff(t *testing.T) {
	defer resetTestState(t)
	defer preserveConfig()()

	firstMod := time.Date(2015, 4, 15, 0, 0, 0, 0, time.UTC)
	lastMod := firstMod.AddDate(0, 0, 1)

	startDate := time.Date(2015, 5, 28, 22, 0, 0, 0, time.UTC)
	session := &eventSession{
		ID:        "test-session",
		Title:     "Introduction to Classroom",
		Desc:      "session desc",
		IsLive:    true,
		Tags:      []string{"TYPE_BOXTALKS"},
		Speakers:  []string{"speaker-id"},
		Room:      "Community Lounge",
		StartTime: startDate,
		EndTime:   startDate.Add(1 * time.Hour),
		Day:       1,
		Block:     "3 PM",
		Start:     "3:00 PM",
		End:       "4:00 PM",
		Filters: map[string]bool{
			"Boxtalks":       true,
			liveStreamedText: true,
		},
	}

	r := newTestRequest(t, "POST", "/sync/gcs", nil)
	r.Header.Set("x-goog-channel-token", "sync-token")
	c := newContext(r)

	err := storeEventData(c, &eventData{
		modified: firstMod,
		Sessions: map[string]*eventSession{session.ID: session},
	})
	if err != nil {
		t.Fatalf("storeEventData: %v", err)
	}
	err = storeChanges(c, &dataChanges{
		Updated: firstMod,
		eventData: eventData{
			Videos: map[string]*eventVideo{"dummy-id": {}},
		},
	})
	if err != nil {
		t.Fatalf("storeChanges: %v", err)
	}

	const newScheduleFile = `{
		"sessions":[
			{
				"id":"test-session",
				"url":"https://www.google.com",
				"title":"Introduction to Classroom",
				"description":"CHANGED DESCRIPTION",
				"startTimestamp":"2015-05-28T22:00:00Z",
				"endTimestamp":"2015-05-28T23:00:00Z",
				"isLivestream":true,
				"tags":["TYPE_BOXTALKS"],
				"speakers":["speaker-id"],
				"room":"room-id"
			}
		]
	}`

	done := make(chan struct{}, 1)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/manifest.json" {
			sinceStr := r.Header.Get("if-modified-since")
			since, err := time.ParseInLocation(http.TimeFormat, sinceStr, time.UTC)
			if err != nil {
				t.Errorf("if-modified-since: time.Parse(%q): %v", sinceStr, err)
			}
			if since != firstMod {
				t.Errorf("if-modified-since (%q) = %s; want %s", sinceStr, since, firstMod)
			}
			w.Header().Set("last-modified", lastMod.Format(http.TimeFormat))
			w.Write([]byte(`{"data_files": ["schedule.json"]}`))
			return
		}
		w.Write([]byte(newScheduleFile))
		done <- struct{}{}
	}))
	defer ts.Close()

	config.Schedule.ManifestURL = ts.URL + "/manifest.json"
	config.Schedule.Start = startDate

	w := httptest.NewRecorder()
	syncEventData(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("w.Code = %d; want 200", w.Code)
	}

	select {
	case <-done:
		// passed
	default:
		t.Fatalf("slurp never happened")
	}

	cache.flush(c)
	data, err := getLatestEventData(c, nil)
	if err != nil {
		t.Fatalf("getLatestEventData: %v", err)
	}
	if data.modified.Unix() != lastMod.Unix() {
		t.Errorf("data.modified = %s; want %s", data.modified, lastMod)
	}

	s := data.Sessions[session.ID]
	if s == nil {
		t.Fatalf("%q session not found in %+v", session.ID, data.Sessions)
	}
	if v := "CHANGED DESCRIPTION"; s.Desc != v {
		t.Errorf("s.Desc = %q; want %q", s.Desc, v)
	}

	dc, err := getChangesSince(c, firstMod.Add(1*time.Second))
	if err != nil {
		t.Fatalf("getChangesAfter: %v", err)
	}
	if dc.Updated != lastMod {
		t.Errorf("dc.Changed = %s; want %s", dc.Updated, lastMod)
	}
	if l := len(dc.Videos); l != 0 {
		t.Errorf("len(dc.Videos) = %d; want 0", l)
	}
	s.Update = updateDetails
	if s2 := dc.Sessions[session.ID]; !reflect.DeepEqual(s2, s) {
		t.Errorf("s2 = %+v\nwant %+v", s2, s)
	}
}

// TODO: refactor when ported to firebase
//
//func TestHandlePingUserUpgradeSubscribers(t *testing.T) {
//	defer preserveConfig()()
//
//	config.Google.GCM.Endpoint = "http://gcm"
//	r, _ := aetestInstance.NewRequest("POST", "/task/ping-user", nil)
//	r.Form = url.Values{
//		"uid":      {testUserID},
//		"sessions": {"s-123"},
//	}
//	r.Header.Set("x-appengine-taskexecutioncount", "1")
//	c := newContext(r)
//
//	if err := storeUserPushInfo(c, &userPush{
//		userID:      testUserID,
//		Subscribers: []string{"gcm-1", "gcm-2"},
//		Endpoints:   []string{"http://gcm", "http://gcm/gcm-2", "http://push/endpoint"},
//	}); err != nil {
//		t.Fatal(err)
//	}
//
//	w := httptest.NewRecorder()
//	handlePingUser(w, r)
//
//	if w.Code != http.StatusOK {
//		t.Errorf("w.Code = %d; want 200", w.Code)
//	}
//
//	pi, err := getUserPushInfo(c, testUserID)
//	if err != nil {
//		t.Fatal(err)
//	}
//	if len(pi.Subscribers) != 0 {
//		t.Errorf("pi.Subscribers = %v; want []", pi.Subscribers)
//	}
//	endpoints := []string{"http://gcm/gcm-1", "http://gcm/gcm-2", "http://push/endpoint"}
//	if !reflect.DeepEqual(pi.Endpoints, endpoints) {
//		t.Errorf("pi.Endpoints = %v; want %v", pi.Endpoints, endpoints)
//	}
//}

// TODO: refactor when ported to firebase
//
//func TestHandlePingDeviceGCM(t *testing.T) {
//	defer preserveConfig()()
//
//	count := 0
//	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
//		if ah := r.Header.Get("authorization"); ah != "key=test-key" {
//			t.Errorf("ah = %q; want 'key=test-key'", ah)
//		}
//		if reg := r.FormValue("registration_id"); reg != "reg-123" {
//			t.Errorf("reg = %q; want 'reg-123'", reg)
//		}
//		fmt.Fprintf(w, "id=message-id-123")
//		count += 1
//	}))
//	defer ts.Close()
//
//	config.Google.GCM.Key = "test-key"
//	config.Google.GCM.Endpoint = ts.URL
//	endpoint := ts.URL + "/reg-123"
//
//	r, _ := aetestInstance.NewRequest("POST", "/task/ping-device", nil)
//	r.Form = url.Values{
//		"uid":      {testUserID},
//		"endpoint": {endpoint},
//	}
//	r.Header.Set("x-appengine-taskexecutioncount", "1")
//
//	c := newContext(r)
//	if err := storeUserPushInfo(c, &userPush{
//		userID:    testUserID,
//		Enabled:   true,
//		Endpoints: []string{endpoint},
//	}); err != nil {
//		t.Fatal(err)
//	}
//
//	w := httptest.NewRecorder()
//	handlePingDevice(w, r)
//
//	if w.Code != http.StatusOK {
//		t.Errorf("w.Code = %d; want 200", w.Code)
//	}
//	if count != 1 {
//		t.Errorf("req count = %d; want 1", count)
//	}
//	pi, err := getUserPushInfo(c, testUserID)
//	if err != nil {
//		t.Fatal(err)
//	}
//	if !reflect.DeepEqual(pi.Endpoints, []string{endpoint}) {
//		t.Errorf("pi.Endpoints = %v; want [%q]", pi.Endpoints, endpoint)
//	}
//}

// TODO: refactor when ported to firebase
//
//func TestHandlePingDeviceGCMReplace(t *testing.T) {
//	defer preserveConfig()()
//
//	// GCM server
//	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
//		fmt.Fprintf(w, "id=msg-id&registration_id=new-reg-id")
//	}))
//	defer ts.Close()
//	config.Google.GCM.Endpoint = ts.URL
//
//	r, _ := aetestInstance.NewRequest("POST", "/task/ping-device", nil)
//	r.Form = url.Values{
//		"uid":      {testUserID},
//		"endpoint": {ts.URL + "/reg-123"},
//	}
//	r.Header.Set("x-appengine-taskexecutioncount", "1")
//
//	c := newContext(r)
//	storeUserPushInfo(c, &userPush{
//		userID:    testUserID,
//		Enabled:   true,
//		Endpoints: []string{ts.URL + "/reg-123"},
//	})
//
//	w := httptest.NewRecorder()
//	handlePingDevice(w, r)
//
//	if w.Code != http.StatusOK {
//		t.Errorf("w.Code = %d; want 200", w.Code)
//	}
//
//	pi, err := getUserPushInfo(c, testUserID)
//	if err != nil {
//		t.Fatal(err)
//	}
//	if v := []string{ts.URL + "/new-reg-id"}; !reflect.DeepEqual(pi.Endpoints, v) {
//		t.Errorf("pi.Endpoints = %v; want %v", pi.Endpoints, v)
//	}
//	if l := len(pi.Subscribers); l != 0 {
//		t.Errorf("len(pi.Subscribers) = %d; want 0", l)
//	}
//}

// TODO: refactor when ported to firebase
//
//func TestHandlePingDeviceDelete(t *testing.T) {
//	defer preserveConfig()()
//
//	// a push server
//	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
//		w.WriteHeader(http.StatusGone)
//	}))
//	defer ts.Close()
//
//	r, _ := aetestInstance.NewRequest("POST", "/task/ping-device", nil)
//	r.Form = url.Values{
//		"uid":      {testUserID},
//		"endpoint": {ts.URL + "/reg-123"},
//	}
//	r.Header.Set("x-appengine-taskexecutioncount", "1")
//
//	c := newContext(r)
//	storeUserPushInfo(c, &userPush{
//		userID:    testUserID,
//		Enabled:   true,
//		Endpoints: []string{"http://one", ts.URL + "/reg-123", "http://two"},
//	})
//
//	w := httptest.NewRecorder()
//	handlePingDevice(w, r)
//
//	if w.Code != http.StatusOK {
//		t.Errorf("w.Code = %d; want 200", w.Code)
//	}
//
//	pi, err := getUserPushInfo(c, testUserID)
//	if err != nil {
//		t.Fatal(err)
//	}
//	endpoints := []string{"http://one", "http://two"}
//	if !reflect.DeepEqual(pi.Endpoints, endpoints) {
//		t.Errorf("pi.Endpoints=%v; want %v", pi.Endpoints, endpoints)
//	}
//}

// TODO: refactor when ported to firebase
//
//func TestHandleClockNextSessions(t *testing.T) {
//	defer resetTestState(t)
//	defer preserveConfig()()
//
//	now := time.Now()
//	swToken := fetchFirstSWToken(t, testIDToken)
//	if swToken == "" {
//		t.Fatal("no swToken")
//	}
//
//	// gdrive stub
//	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
//		if r.URL.Path == "/file-id" {
//			w.Write([]byte(`{"starred_sessions": ["start", "__keynote__", "too-early"]}`))
//			return
//		}
//		fmt.Fprintf(w, `{"items": [{
//			"id": "file-id",
//			"modifiedDate": "2015-04-11T12:12:46.034Z"
//		}]}`)
//	}))
//	defer ts.Close()
//	config.Google.Drive.FilesURL = ts.URL + "/"
//	config.Google.Drive.Filename = "user_data.json"
//
//	c := newContext(newTestRequest(t, "GET", "/", nil))
//	if err := storeCredentials(c, &oauth2Credentials{
//		userID:      testUserID,
//		Expiry:      time.Now().Add(2 * time.Hour),
//		AccessToken: "access-token",
//	}); err != nil {
//		t.Fatal(err)
//	}
//	if err := storeUserPushInfo(c, &userPush{userID: testUserID}); err != nil {
//		t.Fatal(err)
//	}
//	if err := storeNextSessions(c, []*eventSession{
//		{Id: "already-clocked", Update: updateStart},
//	}); err != nil {
//		t.Fatal(err)
//	}
//	if err := storeEventData(c, &eventData{Sessions: map[string]*eventSession{
//		"start": {
//			Id:        "start",
//			StartTime: now.Add(timeoutStart - time.Second),
//		},
//		"__keynote__": {
//			Id:        "__keynote__",
//			StartTime: now.Add(timeoutSoon - time.Second),
//		},
//		"already-clocked": {
//			Id:        "already-clocked",
//			StartTime: now.Add(timeoutStart - time.Second),
//		},
//		"too-early": { // because it's not in soonSessionIDs
//			Id:        "too-early",
//			StartTime: now.Add(timeoutSoon - time.Second),
//		},
//	}}); err != nil {
//		t.Fatal(err)
//	}
//
//	upsess := map[string]string{
//		"start":       updateStart,
//		"__keynote__": updateSoon,
//	}
//	checkUpdates := func(dc *dataChanges, what string) {
//		if len(dc.Sessions) != len(upsess) {
//			t.Errorf("%s: dc.Sessions = %v; want %v", what, dc.Sessions, upsess)
//		}
//		for id, v := range upsess {
//			s, ok := dc.Sessions[id]
//			if !ok {
//				t.Errorf("%s: %q not in %v", what, id, dc.Sessions)
//				continue
//			}
//			if s.Update != v {
//				t.Errorf("%s: s.Update = %q; want %q", what, s.Update, v)
//			}
//		}
//	}
//
//	r := newTestRequest(t, "POST", "/task/clock", nil)
//	r.Header.Set("x-appengine-cron", "true")
//	w := httptest.NewRecorder()
//	handleClock(w, r)
//	if w.Code != http.StatusOK {
//		t.Fatalf("w.Code = %d; want 200", w.Code)
//	}
//
//	unclocked, err := filterNextSessions(c, []*eventSession{
//		{Id: "__keynote__", Update: updateSoon},
//		{Id: "start", Update: updateStart},
//		{Id: "too-early", Update: "too-early"},
//	})
//	if err != nil {
//		t.Fatal(err)
//	}
//	if len(unclocked) != 1 {
//		t.Fatalf("unclocked = %v; want [too-early]", toSessionIDs(unclocked))
//	}
//	if unclocked[0].Id != "too-early" {
//		t.Fatalf("Id = %q; want 'too-early'", unclocked[0].Id)
//	}
//
//	dc, err := getChangesSince(c, now.Add(-time.Second))
//	if err != nil {
//		t.Fatal(err)
//	}
//	checkUpdates(dc, "getChangesSince")
//
//	r = newTestRequest(t, "GET", "/api/v1/user/updates", nil)
//	r.Header.Set("authorization", swToken)
//	w = httptest.NewRecorder()
//	serveUserUpdates(w, r)
//	if w.Code != http.StatusOK {
//		t.Fatalf("w.Code = %d; want 200\nResponse: %s", w.Code, w.Body.String())
//	}
//	dc = &dataChanges{}
//	if err := json.Unmarshal(w.Body.Bytes(), dc); err != nil {
//		t.Fatal(err)
//	}
//	checkUpdates(dc, "api")
//}

// TODO: refactor when ported to firebase
//
//func TestHandleClockSurvey(t *testing.T) {
//	defer resetTestState(t)
//	defer preserveConfig()()
//
//	now := time.Now()
//	swToken := fetchFirstSWToken(t, testIDToken)
//	if swToken == "" {
//		t.Fatal("no swToken")
//	}
//
//	// gdrive stub
//	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
//		if r.URL.Path == "/file-id" {
//			w.Write([]byte(`{"starred_sessions": ["random"]}`))
//			return
//		}
//		fmt.Fprintf(w, `{"items": [{
//			"id": "file-id",
//			"modifiedDate": "2015-04-11T12:12:46.034Z"
//		}]}`)
//	}))
//	defer ts.Close()
//	config.Google.Drive.FilesURL = ts.URL + "/"
//	config.Google.Drive.Filename = "user_data.json"
//
//	c := newContext(newTestRequest(t, "GET", "/", nil))
//	if err := storeCredentials(c, &oauth2Credentials{
//		userID:      testUserID,
//		Expiry:      time.Now().Add(2 * time.Hour),
//		AccessToken: "access-token",
//	}); err != nil {
//		t.Fatal(err)
//	}
//	if err := storeUserPushInfo(c, &userPush{userID: testUserID}); err != nil {
//		t.Fatal(err)
//	}
//	if err := storeNextSessions(c, []*eventSession{
//		{Id: "__keynote__", Update: updateSoon},
//		{Id: "__keynote__", Update: updateStart},
//	}); err != nil {
//		t.Fatal(err)
//	}
//	if err := storeEventData(c, &eventData{Sessions: map[string]*eventSession{
//		"random": {
//			Id:        "random",
//			StartTime: now.Add(-timeoutSurvey - time.Minute),
//		},
//		"__keynote__": {
//			Id:        "__keynote__",
//			StartTime: now.Add(-timeoutSurvey - time.Minute),
//		},
//	}}); err != nil {
//		t.Fatal(err)
//	}
//
//	upsess := map[string]string{
//		"__keynote__": updateSurvey,
//	}
//	checkUpdates := func(dc *dataChanges, what string) {
//		if len(dc.Sessions) != len(upsess) {
//			t.Errorf("%s: dc.Sessions = %v; want %v", what, dc.Sessions, upsess)
//		}
//		for id, v := range upsess {
//			s, ok := dc.Sessions[id]
//			if !ok {
//				t.Errorf("%s: %q not in %v", what, id, dc.Sessions)
//				continue
//			}
//			if s.Update != v {
//				t.Errorf("%s: s.Update = %q; want %q", what, s.Update, v)
//			}
//		}
//	}
//
//	r := newTestRequest(t, "POST", "/task/clock", nil)
//	r.Header.Set("x-appengine-cron", "true")
//	w := httptest.NewRecorder()
//	handleClock(w, r)
//	if w.Code != http.StatusOK {
//		t.Fatalf("w.Code = %d; want 200", w.Code)
//	}
//
//	unclocked, err := filterNextSessions(c, []*eventSession{
//		{Id: "__keynote__", Update: updateSurvey},
//		{Id: "random", Update: updateSurvey},
//	})
//	if err != nil {
//		t.Fatal(err)
//	}
//	if len(unclocked) != 1 {
//		t.Fatalf("unclocked = %v; want [random]", toSessionIDs(unclocked))
//	}
//	if unclocked[0].Id != "random" {
//		t.Fatalf("Id = %q; want 'random'", unclocked[0].Id)
//	}
//
//	dc, err := getChangesSince(c, now.Add(-time.Second))
//	if err != nil {
//		t.Fatal(err)
//	}
//	checkUpdates(dc, "getChangesSince")
//
//	r = newTestRequest(t, "GET", "/api/v1/user/updates", nil)
//	r.Header.Set("authorization", swToken)
//	w = httptest.NewRecorder()
//	serveUserUpdates(w, r)
//	if w.Code != http.StatusOK {
//		t.Fatalf("w.Code = %d; want 200\nResponse: %s", w.Code, w.Body.String())
//	}
//	dc = &dataChanges{}
//	if err := json.Unmarshal(w.Body.Bytes(), dc); err != nil {
//		t.Fatal(err)
//	}
//	checkUpdates(dc, "api")
//}

func TestHandleEasterEgg(t *testing.T) {
	defer preserveConfig()()

	const link = "http://example.org/egg"
	config.SyncToken = "secret"

	table := []struct {
		inLink  string
		expires time.Time
		auth    string
		code    int
		outLink string
	}{
		{link, time.Now().Add(10 * time.Minute), config.SyncToken, http.StatusOK, link},
		{link, time.Now().Add(-10 * time.Minute), config.SyncToken, http.StatusOK, ""},
		{link, time.Now().Add(time.Minute), "invalid", http.StatusForbidden, ""},
		{link, time.Now().Add(time.Minute), "", http.StatusForbidden, ""},
	}

	for i, test := range table {
		body := fmt.Sprintf(`{
			"link": %q,
			"expires": %q
		}`, test.inLink, test.expires.Format(time.RFC3339))
		r, _ := aetestInstance.NewRequest("POST", "/api/v1/easter-egg", strings.NewReader(body))
		r.Header.Set("authorization", test.auth)
		w := httptest.NewRecorder()
		handleEasterEgg(w, r)

		if w.Code != test.code {
			t.Errorf("%d: w.Code = %d; want %d\nResponse: %s", i, w.Code, test.code, w.Body.String())
		}
		if test.code != http.StatusOK {
			continue
		}
		c := newContext(r)
		if err := cache.flush(c); err != nil {
			t.Error(err)
			continue
		}
		link := getEasterEggLink(c)
		if link != test.outLink {
			t.Errorf("%d: link = %q; want %q", i, link, test.outLink)
		}
	}
}

func TestHandleWipeout(t *testing.T) {
	defer preserveConfig()()

	wiped := map[string]bool{
		"/data/google:1.json":  false,
		"/users/google:1.json": false,
		"/data/google:2.json":  false,
		"/users/google:2.json": false,
	}

	fb := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// query for list of users
		if r.Method == "GET" {
			cutoff, err := strconv.ParseInt(r.URL.Query().Get("endAt"), 10, 64)
			if err != nil {
				t.Errorf("ParseInt(%q): %v", r.URL.Query().Get("endAt"), err)
				return
			}
			min := time.Now().Add(-1464*time.Hour).Unix() * 1000 // 61 days
			max := time.Now().Add(-1416*time.Hour).Unix() * 1000 // 59 days
			if cutoff < min || cutoff > max {
				t.Errorf("cutoff = %v; want between %v and %v", cutoff, min, max)
			}
			if r.URL.Path != "/users.json" {
				t.Errorf("r.URL.Path = %q; want /users.json", r.URL.Path)
			}
			w.Write([]byte(`{
				"google:1": {},
				"google:2": {}
			}`))
			return
		}

		// delete user data
		if r.Method != "DELETE" {
			t.Errorf("r.Method = %q; want DELETE", r.Method)
		}
		if _, ok := wiped[r.URL.Path]; !ok {
			t.Errorf("unknown r.URL.Path: %q", r.URL.Path)
			return
		}
		wiped[r.URL.Path] = true
		// verify DELETE /users/uid comes after /data/uid
		if !strings.HasPrefix("/users/", r.URL.Path) {
			return
		}
		u := "/data/" + strings.TrimPrefix(r.URL.Path, "/users/")
		if !wiped[u] {
			t.Errorf("want %q before %q", u, r.URL.Path)
		}
	}))
	defer fb.Close()
	config.Firebase.Shards = []string{fb.URL}

	r, _ := aetestInstance.NewRequest("GET", "/task/wipeout", nil)
	r.Header.Set("x-appengine-cron", "true")
	r.Header.Set("x-appengine-taskexecutioncount", "1")
	w := httptest.NewRecorder()
	handleWipeout(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("w.Code = %d; want %d", w.Code, http.StatusOK)
	}
	for k, ok := range wiped {
		if !ok {
			t.Errorf("%q wasn't deleted", k)
		}
	}
}

func compareStringSlices(a, b []string) bool {
	sort.Strings(a)
	sort.Strings(b)
	return reflect.DeepEqual(a, b)
}
