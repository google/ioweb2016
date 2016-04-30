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
)

func TestFirebaseClient(t *testing.T) {
	ch := make(chan bool, 1)
	// Check that the Firebase client correctly adds the auth parameter
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/test" {
			t.Errorf("r.URL.Path = %q; want /test", r.URL.Path)
		}
		if v := r.URL.Query().Get("foo"); v != "bar" {
			t.Errorf("foo = %q; want 'bar'", v)
		}
		if v := r.URL.Query().Get("auth"); v != config.Firebase.Secret {
			// don't expose auth in build logs
			t.Errorf("want auth query param to be config.Firebase.Secret")
		}
		ch <- true
	}))
	defer ts.Close()

	c := newTestContext()
	if _, err := firebaseClient(c).Get(ts.URL + "/test?foo=bar"); err != nil {
		t.Fatal(err)
	}

	select {
	case <-ch:
		// passed
	default:
		t.Fatalf("firebase request never happened")
	}
}
