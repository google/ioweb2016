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
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"golang.org/x/net/context"

	"google.golang.org/appengine/aetest"
)

const testUserID = "google:123"

var (
	aetInstWg sync.WaitGroup // keeps track of instances being shut down preemptively
	aetInstMu sync.Mutex     // guards aetInst
	aetInst   = make(map[*testing.T]aetest.Instance)

	// global api test instance
	aetestInstance aetest.Instance
)

func TestMain(m *testing.M) {
	oauth1 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"access_token": "oauth1-token"}`))
	}))

	config.Dir = "app"
	config.Env = "dev"
	config.Prefix = "/myprefix"
	config.Google.Auth.Client = "test-client-id"
	config.Google.ServiceAccount.Key = ""
	config.Twitter.TokenURL = oauth1.URL + "/"
	config.SyncToken = "sync-token"
	config.Schedule.Start = time.Date(2015, 5, 28, 9, 0, 0, 0, time.UTC)
	config.Schedule.Timezone = "America/Los_Angeles"
	var err error
	config.Schedule.Location, err = time.LoadLocation(config.Schedule.Timezone)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Could not load location %q", config.Schedule.Location)
		os.Exit(1)
	}

	// a test instance shared across multiple tests
	if aetestInstance, err = aetest.NewInstance(nil); err != nil {
		panic(fmt.Sprintf("aetestInstance: %v", err))
	}

	// run all tests
	code := m.Run()
	// cleanup
	oauth1.Close()
	aetestInstance.Close()
	cleanupTests()

	os.Exit(code)
}

// newTestContext creates a new context using aetestInstance
// and a dummy GET / request.
func newTestContext() context.Context {
	r, _ := aetestInstance.NewRequest("GET", "/", nil)
	return newContext(r)
}

// newTestRequest returns a new *http.Request associated with an aetest.Instance
// of test state t.
func newTestRequest(t *testing.T, method, url string, body io.Reader) *http.Request {
	req, err := aetInstance(t).NewRequest(method, url, body)
	if err != nil {
		t.Fatalf("newTestRequest(%q, %q): %v", method, url, err)
	}
	return req
}

// resetTestState closes aetest.Instance associated with a test state t.
func resetTestState(t *testing.T) {
	aetInstMu.Lock()
	defer aetInstMu.Unlock()
	inst, ok := aetInst[t]
	if !ok {
		return
	}
	aetInstWg.Add(1)
	go func() {
		if err := inst.Close(); err != nil {
			t.Logf("resetTestState: %v", err)
		}
		aetInstWg.Done()
	}()
	delete(aetInst, t)
}

// cleanupTests closes all running aetest.Instance instances.
func cleanupTests() {
	aetInstMu.Lock()
	tts := make([]*testing.T, 0, len(aetInst))
	for t := range aetInst {
		tts = append(tts, t)
	}
	aetInstMu.Unlock()
	for _, t := range tts {
		resetTestState(t)
	}
	aetInstWg.Wait()
}

// aetInstance returns an aetest.Instance associated with the test state t
// or creates a new one.
func aetInstance(t *testing.T) aetest.Instance {
	aetInstMu.Lock()
	defer aetInstMu.Unlock()
	if inst, ok := aetInst[t]; ok {
		return inst
	}
	inst, err := aetest.NewInstance(nil)
	if err != nil {
		t.Fatalf("aetest.NewInstance: %v", err)
	}
	aetInst[t] = inst
	return inst
}

func preserveConfig() func() {
	orig := config
	return func() { config = orig }
}

func toSessionIDs(a []*eventSession) []string {
	res := make([]string, len(a))
	for i, s := range a {
		res[i] = s.ID
	}
	return res
}
