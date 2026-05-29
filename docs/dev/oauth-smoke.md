# OAuth + Sync Smoke Test (manual)

Requires a real Google Cloud OAuth client (TV-and-limited-input device type).

1. Create Google Cloud project, enable Calendar + Photos APIs.
2. Create OAuth client of type "TVs and Limited Input devices". Note client id + secret.
3. Export env:

       export GOOGLE_CLIENT_ID=...
       export GOOGLE_CLIENT_SECRET=...

4. Run server:

       rm -rf packages/server/data
       pnpm --filter @dashboard/widget-clock build
       pnpm --filter @dashboard/widget-calendar build
       pnpm --filter @dashboard/dashboard build
       pnpm --filter @dashboard/server build
       pnpm --filter @dashboard/server start

5. Trigger OAuth from a separate shell:

       curl -s -X POST http://localhost:3000/api/oauth/start
       # Visit verification_url and enter user_code in a browser logged in as the test account
       curl -s -X POST -H 'content-type: application/json' \
         -d '{"deviceCode":"<from start response>"}' http://localhost:3000/api/oauth/poll

   Poll until status=ok.

6. Use the touchscreen event editor (Task 24 endpoint) to create an event in the calendar.
7. Verify the event appears in Google Calendar within 5 seconds.
8. Edit an event directly in Google Calendar — dashboard should reflect it within 60 seconds.

Pass criteria: round-trip both directions, dashboard never reloaded.
