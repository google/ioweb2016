# IOWA 2016 API

Backend API for I/O 2016 web app.


## Handling responses

All API endpoints expect and respond with `application/json` mime type.

Successful calls always result in a `2XX` response status code and an optional body,
if so indicated in the method description.

Unsuccessful calls are indicated by a response status code `4XX` or higher,
and may contain the following body:

```json
{"error": "A (hopefully) useful description of the error"}
```


### GET /api/v1/social

Tweets from @googedevs, with the hash tag #io15. Response body sample:

```json
[
  {
    "kind":"tweet",
    "author":"@googledevs",
    "url":"https://twitter.com/googledevs/status/560575018925436931",
    "text":"Today on #Polycasts <with> @rob_dodson, con\nnect your UI to data...\nautomagically! https://t.co/0z0gUsWB2G",
    "when":"2015-02-04T20:07:54Z"
  },
  {
    "kind":"tweet",
    "author":"@googledevs",
    "url":"https://twitter.com/googledevs/status/540602593253142528",
    "text":"<script>Check out the new episode of #HTTP203, where @aerotwist & @jaffathecake talk about the horrors of font downloading. http://example.com",
    "when":"2015-01-17T20:24:36Z"
  }
]
```


### GET /api/v1/extended

I/O Extended event entries. Response body sample:

```json
[
  {
    "name": "I/O Extended 2015 - San Francisco",
    "link": "https://plus.google.com/events/cviqm849n5smqepqgqn2lut99bk",
    "city": "San Francisco",
    "lat": 37.7552464,
    "lng": -122.4185384
  },
  {
    "name": "I/O Extended 2015 - Amsterdam",
    "link": "https://plus.google.com/u/0/events/c5pv82ob8ihivlof4bu81s5f64c?e=-RedirectToSandbox",
    "city": "Amsterdam",
    "lat": 52.37607,
    "lng": 4.886114
  }
]

```


### GET /api/v1/schedule

Event full schedule and other data.
See `app/temporary_api/schedule.json` for a sample response.


### PUT /api/v1/user/survey/:session_id?uid=:uid

Submit session feedback survey.

Authentication: Bearer FIREBASE-AUTH-TOKEN
The `uid` parameter is a Firebase User ID, typically of `google:12345` form.


```json
{
  "overall": "5",
  "relevance": "4",
  "content": "4",
  "speaker": "5"
}
```

All fields are optional.
Rating fields can have one of the following values: "1", "2", "3", "4" or "5".
Feedback data for a session with the start timestamp greater than the request time will not be accepted.

Successful submission is indicated by `201` response code.
If the responses have already been submitted for the session, the backend responds
with `400` status code. Such requests should not be retried by the client.


## Push notifications

TODO


[push-api-reg]: http://www.w3.org/TR/push-api/#idl-def-PushRegistration
[gcm]: https://developer.android.com/google/gcm/index.html
