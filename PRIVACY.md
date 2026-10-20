# Privacy Policy

_Last updated: October 20, 2026_

Home Dashboard is a self-hosted family calendar display. Each installation
runs on its owner's own device (a Raspberry Pi on their home network). There
is no central service: the developers of this project never receive, store or
see anyone's data.

## What the app accesses

When you connect a Google account, the app asks for the Google Calendar scope
(`https://www.googleapis.com/auth/calendar`). It uses it to:

- list the calendars on your account, so you can choose which ones to show;
- read events from the calendars you choose, to display them;
- create events you add from the dashboard or its admin page.

It does not request access to Gmail, Drive, Contacts, Photos or any other
Google data.

## Where your data is stored

Everything stays on the device running the app:

- your Google refresh token, encrypted with a key tied to that device;
- a cached copy of events from the calendars you chose to show;
- dashboard settings such as layouts, people and colors.

Disconnecting an account in Settings revokes the app's access with Google and
deletes that account's token, calendars and cached events from the device.
You can also revoke access at any time at
https://myaccount.google.com/permissions.

## Data shared with third parties

Google Calendar data is never sold, used for advertising, or shared with
anyone. The device talks directly to Google's APIs to sync calendars.

Two optional features send other data off the device:

- **Weather:** the location you set is sent to Open-Meteo
  (https://open-meteo.com) to fetch a forecast. No calendar data is included.
- **Event import:** if you upload a flyer, PDF or photo to import events, that
  file is sent to Anthropic's API (https://www.anthropic.com) to extract event
  details. Calendar data is not included, and the feature is only used when
  you upload something.

## Google API Services User Data Policy

This app's use and transfer of information received from Google APIs adheres
to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including the Limited Use requirements.

## Contact

Questions: open an issue at https://github.com/blockiosaurus/home-dashboard/issues.
