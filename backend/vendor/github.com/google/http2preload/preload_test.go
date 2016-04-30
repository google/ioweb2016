// Copyright 2015 Google Inc. All Rights Reserved.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//     http://www.apache.org/licenses/LICENSE-2.0
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package http2preload

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"testing"
)

func TestManifest(t *testing.T) {
	m := Manifest{
		"/abs": {
			"http://example.org/app.css": {Type: Style},
			"http://example.org/app.js":  {},
		},
		"/rel": {
			"/app.js": {},
		},
		"/empty": {},
	}
	ts := httptest.NewServer(m.Handler(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(r.URL.Path))
	}))
	defer ts.Close()

	tests := map[string][]string{
		"/abs": {
			"<http://example.org/app.css>; rel=preload; as=style",
			"<http://example.org/app.js>; rel=preload",
		},
		"/rel": {
			fmt.Sprintf("<%s/app.js>; rel=preload", ts.URL),
		},
		"/empty": nil,
		"/other": nil,
	}
	for path, header := range tests {
		res, err := http.Get(ts.URL + path)
		if err != nil {
			t.Errorf("%s: %v", path, err)
			continue
		}
		defer res.Body.Close()
		// verify body
		b, _ := ioutil.ReadAll(res.Body)
		if v := string(b); v != path {
			t.Errorf("%s: body = %q; want %q", path, v, path)
		}
		// verify preload headers
		h := res.Header["Link"]
		if !reflect.DeepEqual(h, header) {
			t.Errorf("%s: h = %v; want %v", path, h, header)
		}
	}
}

func TestReadManifest(t *testing.T) {
	const manStr = `{"/": {"/app.js": {"type": "script"}}}`
	var manWant = Manifest{"/": {"/app.js": {Type: Script}}}

	// tmp file to hold manStr manifest
	f, err := ioutil.TempFile("", "http2preload")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())
	_, err = f.WriteString(manStr)
	f.Close()
	if err != nil {
		t.Fatal(err)
	}

	// verify reading and parsing is ok
	m, err := ReadManifest(f.Name())
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(m, manWant) {
		t.Errorf("manifest: %+v\nwant: %+v", m, manWant)
	}
	// verify cache
	cache := map[string]Manifest{f.Name(): manWant}
	if !reflect.DeepEqual(manifestCache, cache) {
		t.Errorf("manifestCache: %+v\n want: %+v", manifestCache, cache)
	}
}
