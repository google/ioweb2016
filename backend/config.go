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
	"hash/crc32"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/google/http2preload"
)

var (
	// config is a global backend config,
	// usually obtained by reading a server config file in an init() func.
	config appConfig

	// h2config is HTTP/2 preload manifest.
	// It is initialized alongside config but from a separate file
	// because it doesn't need to be encrypted.
	h2config http2preload.Manifest
)

// isDev returns true if current app environment is in a dev mode.
func isDev() bool {
	return !isStaging() && !isProd()
}

// isStaging returns true if current app environment is "stage".
func isStaging() bool {
	return config.Env == "stage"
}

// isProd returns true if current app environment is "prod".
func isProd() bool {
	return config.Env == "prod"
}

// isDevServer returns true if the app is currently running in a dev server.
// This is orthogonal to isDev/Staging/Prod. For instance, the app can be running
// on dev server and be in "prod" mode at the same time. In this case
// both isProd() and isDevServer() return true.
func isDevServer() bool {
	return os.Getenv("RUN_WITH_DEVAPPSERVER") != ""
}

// appConfig defines the backend config file structure.
type appConfig struct {
	// App environment: dev, stage or prod
	Env string
	// Frontend root dir
	Dir string
	// Standalone server address to listen on
	Addr string
	// HTTP prefix
	Prefix string

	// User emails allowed in staging
	Whitelist []string
	// I/O Extended events feed
	IoExtFeedURL string `json:"ioExtFeedUrl"`
	// A shared secret to identify requests from GCS and gdrive
	SyncToken string `json:"synct"`

	// Twitter credentials
	Twitter struct {
		Account     string
		Filter      string
		Key         string
		Secret      string
		TokenURL    string `json:"tokenUrl"`
		TimelineURL string `json:"timelineUrl"`
	}

	// Google credentials
	Google struct {
		TokenURL       string `json:"tokenUrl"`
		ServiceAccount struct {
			Key   string `json:"private_key"`
			Email string `json:"client_email"`
		}
		Auth struct {
			Client string
		}
		GCM struct {
			Sender   string
			Key      string
			Endpoint string
		} `json:"gcm"`
	}

	// Event schedule settings
	Schedule struct {
		Start       time.Time
		Timezone    string
		Location    *time.Location
		ManifestURL string `json:"manifest"`
	}

	// Firebase settings
	Firebase struct {
		Secret string
		Shards []string
	}

	// Feedback survey settings
	Survey struct {
		ID       string `json:"id"`
		Endpoint string
		Key      string
		Reg      string
		// Session IDs map
		Smap map[string]string
		// Question IDs
		Q1      string
		Q2      string
		Q3      string
		Q4      string
		Answers []string // valid answer values
	}
}

// initConfig reads server config file into the config global var.
// Args provided to this func take precedence over config file values.
func initConfig(configPath, addr string) error {
	file, err := os.Open(configPath)
	if err != nil {
		return err
	}
	defer file.Close()
	if err := json.NewDecoder(file).Decode(&config); err != nil {
		return err
	}
	if config.Schedule.Location, err = time.LoadLocation(config.Schedule.Timezone); err != nil {
		return err
	}
	if addr != "" {
		config.Addr = addr
	}
	if config.Prefix == "" || config.Prefix[0] != '/' {
		config.Prefix = "/" + config.Prefix
	}
	sort.Strings(config.Whitelist)
	sort.Strings(config.Survey.Answers)

	// init http/2 preload manifest even if the file doesn't exist
	p := filepath.Dir(configPath)
	if p != "." {
		p = filepath.Join(p, "..")
	}
	p = filepath.Join(p, "h2preload.json")
	if h2config, err = http2preload.ReadManifest(p); err != nil {
		h2config = http2preload.Manifest{}
	}

	return nil
}

// isWhitelisted returns true if either email or its domain is in the config.Whitelist.
func isWhitelisted(email string) bool {
	i := sort.SearchStrings(config.Whitelist, email)
	if i < len(config.Whitelist) && config.Whitelist[i] == email {
		return true
	}
	// no more checks can be done if this is a @domain
	// or an invalid email address.
	i = strings.Index(email, "@")
	if i <= 0 {
		return false
	}
	// check the @domain of this email
	return isWhitelisted(email[i:])
}

// firebaseShard returns shard URL for user uid.
// The uid must by a google user ID, with google: prefix stripped.
func firebaseShard(uid string) string {
	n := len(config.Firebase.Shards)
	if n == 0 {
		return ""
	}

	v := crc32.ChecksumIEEE([]byte(uid))
	i := int(v) % n
	return config.Firebase.Shards[i]
}
