package backend

import "testing"

func TestFirebaseShard(t *testing.T) {
	defer preserveConfig()()
	config.Firebase.Shards = []string{
		"http://example.com/one",
		"http://example.com/two",
		"http://example.com/three",
	}

	tests := []struct{ uid, shard string }{
		{"123", config.Firebase.Shards[1]},
		{"12345", config.Firebase.Shards[0]},
		{"54321", config.Firebase.Shards[2]},
		{"990746185670833971167", config.Firebase.Shards[2]},
	}
	for i, test := range tests {
		s := firebaseShard(test.uid)
		if s != test.shard {
			t.Errorf("%d: firebaseShard(%q) = %q; want %q", i, test.uid, s, test.shard)
		}
	}
}
