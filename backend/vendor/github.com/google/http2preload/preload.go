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

// Package http2preload provides a way to manipulate HTTP/2 preload header.
// See https://w3c.github.io/preload/ for Preload feature details.
package http2preload

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path"
	"strings"
	"sync"
)

// Request types, as specified by https://fetch.spec.whatwg.org/#concept-request-type
const (
	Audio  = "audio"
	Font   = "font"
	Image  = "image"
	Script = "script"
	Style  = "style"
	Track  = "track"
	Video  = "video"
)

// Manifest is the preload manifest map where each value,
// being a collection of resources to be preloaded,
// keyed by a serving URL path which requires those resources.
type Manifest map[string]map[string]AssetOpt

// AssetOpt defines a single resource options.
type AssetOpt struct {
	// Type is the resource type
	Type string `json:"type,omitempty"`

	// Weight is not used in the HTTP/2 preload spec
	// but some HTTP/2 servers, while implementing stream priorities,
	// could benefit from this manifest format as well.
	Weight uint8 `json:"weight,omitempty"`
}

// Handler creates a new handler which adds preload header(s)
// if in-flight request URL matches one of the m entries.
func (m Manifest) Handler(f http.HandlerFunc) http.Handler {
	h := func(w http.ResponseWriter, r *http.Request) {
		if assets, ok := m[r.URL.Path]; ok {
			s := r.Header.Get("x-forwarded-proto")
			if s == "" && r.TLS != nil {
				s = "https"
			}
			if s == "" {
				s = "http"
			}
			AddHeader(w.Header(), s, r.Host, assets)
		}
		f(w, r)
	}
	return http.HandlerFunc(h)
}

// AddHeader adds a "link" header to hdr for each assets entry,
// as specified in https://w3c.github.io/preload/.
// "scheme://base" will be prepended to a key of assets which are not prefixed
// with "http:" or "https:".
func AddHeader(hdr http.Header, scheme, base string, assets map[string]AssetOpt) {
	for url, opt := range assets {
		if !strings.HasPrefix(url, "https:") && !strings.HasPrefix(url, "http:") {
			url = scheme + "://" + path.Join(base, url)
		}
		v := fmt.Sprintf("<%s>; rel=preload", url)
		if opt.Type != "" {
			v += "; as=" + opt.Type
		}
		hdr.Add("link", v)
	}
}

var (
	manifestCacheMu sync.Mutex // guards manifestCache
	manifestCache   = map[string]Manifest{}
)

// ReadManifest reads a push manifest from name file.
// It caches the value in memory so that subsequent requests
// won't hit the disk again.
//
// A manifest file can also be generated with a tool
// found in cmd/http2preload-manifest.
func ReadManifest(name string) (Manifest, error) {
	manifestCacheMu.Lock()
	defer manifestCacheMu.Unlock()
	if m, ok := manifestCache[name]; ok {
		return m, nil
	}
	f, err := os.Open(name)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var m Manifest
	if err := json.NewDecoder(f).Decode(&m); err != nil {
		return nil, err
	}
	manifestCache[name] = m
	return m, nil
}
