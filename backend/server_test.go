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
	"net/http"
	"net/http/httptest"
	"testing"

	"google.golang.org/appengine/aetest"
	"google.golang.org/appengine/user"
)

func TestCheckWhitelist(t *testing.T) {
	defer preserveConfig()()
	config.Whitelist = []string{"@whitedomain.org", "white@example.org"}

	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	table := []struct {
		env   string
		email string
		code  int
	}{
		{"stage", "", http.StatusFound},
		{"stage", "dude@example.org", http.StatusForbidden},
		{"stage", "white@example.org", http.StatusOK},
		{"stage", "user@whitedomain.org", http.StatusOK},
		{"prod", "", http.StatusFound},
		{"prod", "dude@example.org", http.StatusForbidden},
		{"prod", "white@example.org", http.StatusOK},
		{"prod", "user@whitedomain.org", http.StatusOK},
	}
	for _, test := range table {
		config.Env = test.env
		w := httptest.NewRecorder()
		r, _ := aetestInstance.NewRequest("GET", "/io2016/admin/", nil)
		if test.email != "" {
			aetest.Login(&user.User{Email: test.email}, r)
		}
		checkWhitelist(h).ServeHTTP(w, r)

		if w.Code != test.code {
			t.Errorf("%s: w.Code = %d; want %d %s\nResponse: %s",
				test.email, w.Code, test.code, w.Header().Get("location"), w.Body.String())
		}
		if w.Code == http.StatusOK && w.Body.String() != "ok" {
			t.Errorf("w.Body = %s; want 'ok'", w.Body.String())
		}
	}
}
