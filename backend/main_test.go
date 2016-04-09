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
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"golang.org/x/net/context"

	"google.golang.org/appengine/aetest"

	"github.com/dgrijalva/jwt-go"
)

const (
	testUserID       = "user-12345"
	testClientID     = "test-client-id"
	testClientSecret = "test-client-secret"
)

var (
	testIDToken   string
	testJWSKey    []byte
	testJWSCert   []byte
	testJWSCertID = "test-cert"

	aetInstWg sync.WaitGroup // keeps track of instances being shut down preemptively
	aetInstMu sync.Mutex     // guards aetInst
	aetInst   = make(map[*testing.T]aetest.Instance)

	// global api test instance
	aetestInstance aetest.Instance
)

func TestMain(m *testing.M) {
	// GAE tests use gaeMemcache implementation
	if cache == nil {
		cache = newMemoryCache()
	}

	testJWSKey, testJWSCert = jwsTestKey(time.Now(), time.Now().Add(24*time.Hour))

	token := jwt.New(jwt.GetSigningMethod("RS256"))
	token.Header["kid"] = testJWSCertID
	token.Claims = map[string]interface{}{
		"iss": "accounts.google.com",
		"exp": time.Now().Add(2 * time.Hour).Unix(),
		"aud": testClientID,
		"azp": testClientID,
		"sub": testUserID,
	}
	var err error
	testIDToken, err = token.SignedString(testJWSKey)
	if err != nil {
		panic("token.SignedString: " + err.Error())
	}

	cert := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Add("Cache-Control", "max-age=86400")
		w.Header().Set("Age", "0")
		fmt.Fprintf(w, `{"%s": %q}`, testJWSCertID, testJWSCert)
	}))
	defer cert.Close()

	tokeninfo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.FormValue("access_token") == "" {
			http.Error(w, "no access token found", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{
			"issued_to": %q,
			"user_id": %q,
			"expires_in": 3600
		}`, config.Google.Auth.Client, testUserID)
	}))
	defer tokeninfo.Close()

	config.Dir = "app"
	config.Env = "dev"
	config.Prefix = "/myprefix"

	config.Google.Auth.Client = testClientID
	config.Google.Auth.Secret = testClientSecret
	config.Google.VerifyURL = tokeninfo.URL
	config.Google.CertURL = cert.URL
	config.Google.ServiceAccount.Key = ""
	config.Secret = "a-test-secret"
	config.SyncToken = "sync-token"
	config.ExtPingURL = ""

	config.Schedule.Start = time.Date(2015, 5, 28, 9, 0, 0, 0, time.UTC)
	config.Schedule.Timezone = "America/Los_Angeles"
	config.Schedule.Location, err = time.LoadLocation(config.Schedule.Timezone)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Could not load location %q", config.Schedule.Location)
		os.Exit(1)
	}

	if aetestInstance, err = aetest.NewInstance(nil); err != nil {
		panic(fmt.Sprintf("aetestInstance: %v", err))
	}
	code := m.Run()
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

func jwsTestKey(notBefore, notAfter time.Time) (pemKey []byte, pemCert []byte) {
	key, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		panic(fmt.Sprintf("rsa.GenerateKey: %v", err))
	}
	pemKey = pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})

	tcert := x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "www.example.org"},
		Issuer:                pkix.Name{CommonName: "www.example.org"},
		NotBefore:             notBefore,
		NotAfter:              notAfter,
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
	}

	var cert []byte
	cert, err = x509.CreateCertificate(rand.Reader, &tcert, &tcert, &key.PublicKey, key)
	if err != nil {
		panic(fmt.Sprintf("x509.CreateCertificate: %v", err))
	}
	pemCert = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: cert})

	return pemKey, pemCert
}

func toSessionIDs(a []*eventSession) []string {
	res := make([]string, len(a))
	for i, s := range a {
		res[i] = s.Id
	}
	return res
}
