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
	"errors"
	"math/rand"
	"time"

	"google.golang.org/appengine/memcache"

	"golang.org/x/net/context"
)

var (
	// cache is the instance used by the program,
	// initialized by the standalone server's main() or server_gae.
	cache cacheInterface

	// TODO: rename this to errNotFound and move to errors.go
	errCacheMiss = errors.New("cache: miss")

	// shard the memcache keys across multiple instances
	cachedEventDataKey     string
	allCachedEventDataKeys = []string{
		kindEventData + "-0",
		kindEventData + "-1",
		kindEventData + "-2",
		kindEventData + "-3",
	}
	cachedSocialKey     string
	allCachedSocialKeys = []string{
		"social-0",
		"social-1",
		"social-2",
		"social-3",
	}
)

func initCache() {
	i := rand.Intn(len(allCachedEventDataKeys))
	cachedEventDataKey = allCachedEventDataKeys[i]
	i = rand.Intn(len(allCachedSocialKeys))
	cachedSocialKey = allCachedSocialKeys[i]
}

// cacheIterface unifies different types of caches,
// e.g. memoryCache and appengine/memcache.
type cacheInterface interface {
	// set puts data bytes into the cache under key for the duration of the exp.
	set(c context.Context, key string, data []byte, exp time.Duration) error
	// inc atomically increments the decimal value in the given key by delta
	// and returns the new value. The value must fit in a uint64. Overflow wraps around,
	// and underflow is capped to zero
	inc(c context.Context, key string, delta int64, initialValue uint64) (uint64, error)
	// get gets data from the cache put under key.
	// it returns errCacheMiss if item is not in the cache or expired.
	get(c context.Context, key string) ([]byte, error)
	// deleteMulti removes keys from mecache.
	deleteMulti(c context.Context, keys []string) error
	// flush flushes all items from memcache.
	flush(c context.Context) error
}

// cacheInterface implementation using appengine/memcache.
type gaeMemcache struct{}

func (mc *gaeMemcache) set(c context.Context, key string, data []byte, exp time.Duration) error {
	item := &memcache.Item{
		Key:        key,
		Value:      data,
		Expiration: exp,
	}
	return memcache.Set(c, item)
}

func (mc *gaeMemcache) inc(c context.Context, key string, delta int64, initial uint64) (uint64, error) {
	return memcache.Increment(c, key, delta, initial)
}

func (mc *gaeMemcache) get(c context.Context, key string) ([]byte, error) {
	item, err := memcache.Get(c, key)
	if err == memcache.ErrCacheMiss {
		return nil, errCacheMiss
	} else if err != nil {
		return nil, err
	}
	return item.Value, nil
}

func (mc *gaeMemcache) deleteMulti(c context.Context, keys []string) error {
	return memcache.DeleteMulti(c, keys)
}

func (mc *gaeMemcache) flush(c context.Context) error {
	return memcache.Flush(c)
}
