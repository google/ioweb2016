package backend

import (
  "encoding/json"
  "fmt"
  "net/http"
  "net/url"
  "strconv"
  "time"

  "golang.org/x/net/context"
)

func wipeoutShard(c context.Context, shard string) error {
  // 30 days ago as milliseconds since Unix epoch
  cutoff := time.Now().AddDate(0, 0, -30).Unix() * 1000

  q := url.Values{
    "orderBy": {`"last_activity_timestamp"`},
    "endAt" : {strconv.FormatInt(cutoff, 10)},
  }
  u := fmt.Sprintf("%s/users.json?%s", shard, q.Encode())
  res, err := firebaseClient(c).Get(u)
  if err != nil {
    return err
  }
  defer res.Body.Close()
  if res.StatusCode >= 400 {
    return fmt.Errorf("error (%d) fetching wipeout user list", res.StatusCode)
  }

  var userData map[string]struct{}
  if err = json.NewDecoder(res.Body).Decode(&userData); err != nil {
    return err
  }

  if len(userData) == 0 {
    logf(c, "no users for wipeout on shard %q", shard)
    return nil
  }

  ch := make(chan error)

  for uid, _ := range userData {
    go func(uid string) {
      ch <- wipeoutUser(c, shard, uid)
    }(uid)
  }

  for range userData {
    if err := <-ch; err != nil {
      return err
    }
  }

  return nil
}

func wipeoutUser(c context.Context, shard, uid string) error {
  logf(c, "wipeout for user %s on shard %s", uid, shard)

  client := firebaseClient(c)

  u := fmt.Sprintf("%s/data/%s.json", shard, uid)
  req, err := http.NewRequest("DELETE", u, nil)
  if err != nil {
    return err
  }
  res, err := client.Do(req)
  if err != nil {
    return err
  }
  defer res.Body.Close()
  if res.StatusCode >= 400 {
    return fmt.Errorf("error (%d) deleting session data for user %s", res.StatusCode, uid)
  }

  u = fmt.Sprintf("%s/users/%s.json", shard, uid)
  req, err = http.NewRequest("DELETE", u, nil)
  if err != nil {
    return err
  }
  res, err = client.Do(req)
  if err != nil {
    return err
  }
  defer res.Body.Close()
  if res.StatusCode >= 400 {
    return fmt.Errorf("error (%d) deleting user data for user %s", res.StatusCode, uid)
  }

  return nil
}
