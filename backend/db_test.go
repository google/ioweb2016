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
	"testing"
	"time"
)

func TestStoreGetChanges(t *testing.T) {
	c := newTestContext()
	oneTime := time.Now()
	twoTime := oneTime.AddDate(0, 0, 1)

	if err := storeChanges(c, &dataChanges{
		Updated: oneTime,
		eventData: eventData{
			Sessions: map[string]*eventSession{"one": {}},
		},
	}); err != nil {
		t.Fatal(err)
	}
	if err := storeChanges(c, &dataChanges{
		Updated: twoTime,
		eventData: eventData{
			Sessions: map[string]*eventSession{
				"two":   {},
				"three": {},
			},
		},
	}); err != nil {
		t.Fatal(err)
	}

	table := []struct {
		arg time.Time
		ids []string
	}{
		{oneTime.Add(-1 * time.Second), []string{"one", "two", "three"}},
		{oneTime, []string{"two", "three"}},
		{twoTime, []string{}},
	}

	for i, test := range table {
		dc, err := getChangesSince(c, test.arg)
		if err != nil {
			t.Errorf("%d: %v", i, err)
		}
		if len(dc.Sessions) != len(test.ids) {
			t.Errorf("%d: len(dc.Sessions) = %d; want %d", i, len(dc.Sessions), len(test.ids))
		}
		for _, id := range test.ids {
			if _, ok := dc.Sessions[id]; !ok {
				t.Errorf("%d: want session %q", i, id)
			}
		}
	}
}

func TestStoreNextSessions(t *testing.T) {
	c := newTestContext()
	sessions := []*eventSession{
		{ID: "one", Update: updateSoon},
		{ID: "one", Update: updateStart},
		{ID: "two", Update: updateStart},
	}
	if err := storeNextSessions(c, sessions); err != nil {
		t.Fatal(err)
	}
	sessions = append(sessions, &eventSession{ID: "new", Update: updateStart})
	items, err := filterNextSessions(c, sessions)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].ID != "new" {
		t.Errorf("items = %v; want 'new'", items)
	}
}
