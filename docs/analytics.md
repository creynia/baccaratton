# Analytics

baccaratton counts anonymous page views and a few events with
[GoatCounter](https://www.goatcounter.com/), in the shared `creynia` site
(`https://creynia.goatcounter.com`) that covers all of creynia.com.

## What is sent

One image request to `https://creynia.goatcounter.com/count` per page view or event, with:

| Param | Value |
| --- | --- |
| `p` | Page path (`/baccaratton/#/learn/welcome`) or event name (`baccaratton:install`) |
| `t` | Page title |
| `r` | Referrer, on the first view only and only when it is another site |
| `s` | Screen width |
| `e` | `true` for events |

No script is loaded, no cookie or local storage is used, and no identifier is sent. GoatCounter
derives the browser, OS and country from the request and does not store IP addresses.

## When it is off

`src/app/analytics.ts` sends nothing unless the page is served over https from `creynia.com`,
so dev, `vite preview`, unit and e2e tests, forks and the offline single file never count. It is
also off when `navigator.webdriver` is set or the browser sends Do Not Track or Global Privacy
Control.

## Page views and events

- **App:** one view per hash route (`App.tsx`), query strings dropped, repeats ignored.
- **Static pages** (`build/static-site.ts`): a JS-free 1×1 pixel (`countPixel`) with the page path.
- **Events:** `lesson-complete/<id>` (Mark complete) and `install` (`appinstalled`).

Add an event with `trackEvent('name')`; keep names short and never include personal data.
