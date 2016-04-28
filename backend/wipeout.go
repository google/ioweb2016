package backend

import (
  "encoding/json"
  "fmt"
  "io/ioutil"
  "net/http"
  "strconv"
  "time"

  "golang.org/x/net/context"
)

func wipeoutShard(c context.Context, shard string) error {
  // 30 days ago as milliseconds since Unix epoch
  cutoff := time.Now().AddDate(0, 0, -30).Unix() * 1000

  path := `users.json?orderBy="last_activity_timestamp"&endAt=` + strconv.FormatInt(cutoff, 10)

  res, err := firebaseClient(c).Get(shard + path)
  if err != nil {
    return err
  }
  if res.StatusCode >= 400 {
    return fmt.Errorf("error (%d) fetching wipeout user list on shard %s", res.StatusCode, shard)
  }
  defer res.Body.Close()
  body, err := ioutil.ReadAll(res.Body)
  if err != nil {
    return err
  }

  userData := make(map[string]struct{})
  json.Unmarshal(body, &userData)

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

  dataPath := "data/" + uid + ".json"
  userPath := "users/" + uid + ".json"

  req, err := http.NewRequest("DELETE", shard+dataPath, nil)
  if err != nil {
    return err
  }
  res, err := firebaseClient(c).Do(req)
  if err != nil {
    return err
  }
  if res.StatusCode >= 400 {
    return fmt.Errorf("error (%d) deleting session data for user %s on shard %s", res.StatusCode, uid, shard)
  }
  defer res.Body.Close()

  req, err = http.NewRequest("DELETE", shard+userPath, nil)
  if err != nil {
    return err
  }
  res, err = firebaseClient(c).Do(req)
  if err != nil {
    return err
  }
  if res.StatusCode >= 400 {
    return fmt.Errorf("error (%d) deleting user data for user %s on shard %s", res.StatusCode, uid, shard)
  }
  defer res.Body.Close()

  return nil
}
