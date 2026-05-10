# Zekoro 2020 Android Client — API Spec

Spec for the patched 2020 `com.roblox.client` APK. All endpoints are implemented and verified against the backend (auto-extracted from `Roblox.Website/Controllers/**`).

---

## 0. Host & request rules

- **Single backend host**: `https://www.zekoro.org` (`http://127.0.0.1:5000` for local).
- **Subdomain rewrite**: every Roblox subdomain must be rewritten to a path:

  | Original | Rewrite to |
  | --- | --- |
  | `auth.roblox.com/*` | `www.zekoro.org/*` |
  | `users.roblox.com/*` | `www.zekoro.org/*` |
  | `games.roblox.com/*` | `www.zekoro.org/*` |
  | `catalog.roblox.com/*` | `www.zekoro.org/*` |
  | `avatar.roblox.com/*` | `www.zekoro.org/*` |
  | `friends.roblox.com/*` | `www.zekoro.org/*` |
  | `inventory.roblox.com/*` | `www.zekoro.org/*` |
  | `economy.roblox.com/*` | `www.zekoro.org/*` |
  | `thumbnails.roblox.com/*` | `www.zekoro.org/*` |
  | `chat.roblox.com/*` | `www.zekoro.org/*` |
  | `presence.roblox.com/*` | `www.zekoro.org/*` |
  | `notifications.roblox.com/*` | `www.zekoro.org/*` |
  | `assetdelivery.roblox.com/*` | `www.zekoro.org/*` |
  | `clientsettings.roblox.com/*` | `www.zekoro.org/*` |
  | `accountinformation.roblox.com/*` | `www.zekoro.org/*` |
  | `accountsettings.roblox.com/*` | `www.zekoro.org/*` |
  | `apis.roblox.com/*` | `www.zekoro.org/*` |
  | `develop.roblox.com/*` | `www.zekoro.org/*` |
  | `groups.roblox.com/*` | `www.zekoro.org/*` |
  | `badges.roblox.com/*` | `www.zekoro.org/*` |

  The path stays the same — only the host is replaced. e.g.
  `https://users.roblox.com/v1/users/123` → `https://www.zekoro.org/v1/users/123`.

- **Auth cookie**: `.ROBLOSECURITY` (HTTP-only, `Domain=.zekoro.org`). Sent by the server on login. Send it back on every request.
- **CSRF**: any non-GET/HEAD request must include `X-CSRF-TOKEN`. Get it by:
  1. Send the request *without* the header. Backend returns `403` with header `x-csrf-token: <new token>`.
  2. Cache the token, replay the request with `X-CSRF-TOKEN: <new token>`.
  3. Refresh on every subsequent `403`.
- **Content-Type**: always `application/json` for POST bodies (except multipart asset upload).
- **User-Agent**: set to `Roblox/Android` (the Android-specific bypass routes — `mobileapi/login`, `device/initialize` — accept anything, but match real APK behaviour).

---

## 1. Boot sequence (must succeed in order)

These are the requests the APK fires in the first ~3 seconds. If any fails, the launcher screen hangs.

| # | Method | URL | Purpose |
| --- | --- | --- | --- |
| 1 | `POST` | `/device/initialize` | Hello-world ping. Backend stamps device. |
| 2 | `POST` | `/mobileapi/check-app-version` | Returns `{ isUpToDate: true }`. |
| 3 | `GET`  | `/v2/settings/application/AndroidApp` | FFlags / FInts / FStrings. **Critical.** |
| 4 | `POST` | `/mobileapi/login` *or* `/v2/login` | See §2. |
| 5 | `GET`  | `/v1/users/authenticated` | Whoami. |
| 6 | `POST` | `/v1/presence/register-app-presence` | Online beacon. |

---

## 2. Login & signup — `Login.cs`

### Login
```
POST /mobileapi/login
Content-Type: application/json

{ "userName": "<u>", "userPassword": "<p>" }
```
Response: `200` + sets `.ROBLOSECURITY` cookie. Body: `{ "userId": 1234, "userName": "u", "isUnder13": false, ... }`.

Alt (web-style):
```
POST /v2/login
{ "ctype": "Username", "cvalue": "<u>", "password": "<p>" }
```

### Signup
```
POST /v1/signup    (web flow)
{ "username": "...", "password": "...", "birthday": "2000-01-01", "gender": 2 }
```
The Android APK doesn't have first-class signup; redirect to a web-view at `/account/signup`.

### 2-step verification (optional)
- `POST /v2/twostepverification/login/verify`
- `POST /v3/users/{userId}/two-step-verification/login`

### Logout
```
POST /v1/logout
POST /sign-out/v1
```

---

## 3. User info — `Users.cs`, `AccountInformation.cs`

| Method | URL | Use |
| --- | --- | --- |
| `GET` | `/v1/users/authenticated` | Whoami |
| `GET` | `/v1/users/{userId}` | Public profile |
| `POST` | `/v1/users` | Multi-get; body `{ userIds: [..], excludeBannedUsers: false }` |
| `POST` | `/v1/usernames/users` | Multi-get by username |
| `GET` | `/v1/users/{userId}/username-history` | |
| `GET` | `/v1/birthdate`, `/v1/gender`, `/v1/description` | Account info |
| `POST` | `/v1/description` | Update bio |

---

## 4. Avatar — `Avatar.cs`

| Method | URL | Use |
| --- | --- | --- |
| `GET` | `/v1/users/{userId}/avatar` | Get avatar config |
| `GET` | `/v1/avatar/meta` | Per-user avatar limits |
| `POST` | `/v1/avatar/set-wearing-assets` | Body: `{ assetIds: [..] }` |
| `POST` | `/v1/avatar/set-body-colors` | Body: 6 BrickColor IDs |
| `POST` | `/v1/avatar/set-player-avatar-type` | `{ playerAvatarType: "R6"\|"R15" }` |
| `POST` | `/v1/avatar/set-scales` | `{ height, width, head, depth, proportion, bodyType }` |
| `POST` | `/v1/avatar/redraw-thumbnail` | Force re-render |
| `POST` | `/v1/avatar/assets/{assetId}/wear` | Single equip |
| `POST` | `/v1/avatar/assets/{assetId}/remove` | Single unequip |
| `GET` | `/v1/users/{userId}/outfits` | List outfits |
| `POST` | `/v1/outfits/create` | Create outfit |
| `POST` | `/v1/outfits/{outfitId}/wear` | Equip outfit |
| `POST` | `/v1/outfits/{outfitId}/delete` | |

---

## 5. Catalog & purchases — `Catalog.cs`, `Marketplace.cs`, `Economy.cs`

| Method | URL | Use |
| --- | --- | --- |
| `POST` | `/v1/catalog/items/details` | Bulk item details |
| `GET` | `/v2/assets/{assetId}/details` | Single asset details + price |
| `POST` | `/v1/favorites/users/{userId}/assets/{assetId}/favorite` | Toggle favorite |
| `POST` | `/marketplace/purchase` | Legacy buy (mobile uses this) |
| `POST` | `/marketplace/submitpurchase` | |
| `POST` | `/marketplace/validatepurchase` | |
| `POST` | `/v1/purchases/products/{assetId}` | Modern buy (web flow) |
| `POST` | `/v2/developer-products/{productId}/purchase` | In-game dev product |
| `GET` | `/v1/users/{userId}/revenue/summary/{timePeriod}` | (creator only) |

---

## 6. Friends, followers, presence — `Friends.cs`, `Followers.cs`, `Presence.cs`

| Method | URL | Use |
| --- | --- | --- |
| `GET` | `/v1/users/{userId}/friends` | Friend list |
| `GET` | `/v1/users/{userId}/friends/count` | |
| `GET` | `/v1/users/{userId}/friends/statuses` | Pending/accepted matrix |
| `POST` | `/v1/users/{userId}/request-friendship` | Send request |
| `POST` | `/v1/users/{userIdToAccept}/accept-friend-request` | |
| `POST` | `/v1/users/{userIdToDecline}/decline-friend-request` | |
| `POST` | `/v1/users/{userIdToRemove}/unfriend` | |
| `POST` | `/my/friendsonline` | (legacy mobile) friends online list |
| `POST` | `/friends/filter` | Search friend list |
| `POST` | `/friends/filter-requests` | Search pending requests |
| `GET` | `/v1/users/{userId}/followers`, `/followings` | |
| `POST` | `/v1/users/{userIdToFollow}/follow`, `/unfollow` | |
| `POST` | `/v1/presence/users` | Multi-get presence; body `{ userIds: [..] }` |
| `POST` | `/presence/register-game-presence` | (called by RCC, not APK) |
| `POST` | `/presence/register-absence` | App going to background |

---

## 7. Inventory — `InventoryController.cs`

| Method | URL | Use |
| --- | --- | --- |
| `GET` | `/v1/users/{userId}/items/Asset/{assetId}` | Owned copies |
| `GET` | `/v1/users/{userId}/items/asset/{assetId}/is-owned` | Boolean |
| `GET` | `/v2/users/{userId}/inventory?assetTypes=...` | Inventory list |
| `GET` | `/v2/users/{userId}/inventory/{assetTypeId}` | Single category |
| `GET` | `/v1/users/{userId}/assets/collectibles` | Limiteds |
| `DELETE` | `/v2/inventory/asset/{assetId}` | Remove from inventory |

---

## 8. Games & place launching — `GameListing.cs`, `BypassController.cs`

| Method | URL | Use |
| --- | --- | --- |
| `GET` | `/v1/games/multiget-place-details?placeIds=...` | Place metadata |
| `GET` | `/v1/games?universeIds=...` | Universe metadata |
| `GET` | `/v1/games/{universeId}/votes` | Up/down votes |
| `POST` | `/v1/games/votes` | Vote |
| `POST` | `/v1/games/multiget-playability-status` | Can the user play |
| `GET` | `/v1/games/list` | Discover sorts |
| `GET` | `/v1/games/sorts` | Sort list |
| `GET` | `/v2/games/{universeId}/media` | Screenshots/video |
| `POST` | `/v1/join-game` | Returns `JoinScriptUrl` (modern flow) |
| `POST` | `/Game/PlaceLauncher.ashx` | Legacy launcher; returns join data |
| `POST` | `/game/join.ashx` | Returns the actual JSON the engine consumes |
| `POST` | `/Game/PlaceVisit.ashx` | Visit beacon |

### Join flow (what the APK does on tap-to-play)
1. `POST /v1/join-game` with `{ placeId }` → returns `{ joinScriptUrl, status }`.
2. APK opens `joinScriptUrl` (`/game/join.ashx?placeId=...&jobId=...`).
3. Server returns a JSON descriptor consumed by the engine (no Lua).

---

## 9. Thumbnails — `Thumbnails.cs`

All return `{ data: [{ targetId, state, imageUrl }] }`.

| Method | URL |
| --- | --- |
| `POST` | `/v1/batch` (preferred — multi-type batch) |
| `GET` | `/v1/users/avatar?userIds=&size=&format=&isCircular=` |
| `GET` | `/v1/users/avatar-headshot` |
| `GET` | `/v1/users/avatar-bust` |
| `GET` | `/v1/games/icons?universeIds=` |
| `GET` | `/v1/games/multiget/thumbnails` |
| `GET` | `/v1/places/gameicons` |
| `GET` | `/v1/assets?assetIds=&size=&format=` |
| `GET` | `/v1/badges/icons` |
| `GET` | `/v1/groups/icons` |

---

## 10. Asset delivery (downloads) — `Asset.cs`

| Method | URL | Use |
| --- | --- | --- |
| `GET` | `/asset/?id={id}` | Raw bytes (RBXM, RBXL, PNG, MP3) — what the engine actually loads |
| `GET` | `/v1/asset?id={id}` | Same |
| `GET` | `/v2/asset?id={id}` | Returns JSON `{ locations: [{ location }] }` |
| `POST` | `/v1/assets/batch` | Bulk lookup (used by content provider) |
| `POST` | `/asset/batch` | |
| `POST` | `/Data/Upload.ashx` | Studio upload (not used by APK) |

---

## 11. Chat & DMs — `Chat.cs`, `BypassController.cs`

| Method | URL | Use |
| --- | --- | --- |
| `GET` | `/v2/get-user-conversations` | List DMs |
| `GET` | `/v2/get-messages?conversationId=&pageSize=` | |
| `POST` | `/v2/send-message` | |
| `POST` | `/v2/mark-as-read` | |
| `GET` | `/v2/get-unread-conversation-count` | Badge counter |
| `POST` | `/v2/start-one-to-one-conversation` | New DM |
| `POST` | `/v2/add-to-conversation` | Group chat |
| `GET` | `/v2/metadata` | Chat metadata |
| `POST` | `/v2/update-user-typing-status` | |
| `GET` | `/v2/multi-get-latest-messages` | |

---

## 12. Notifications — `BypassController.cs`

| Method | URL |
| --- | --- |
| `GET` | `/v2/stream-notifications/unread-count` |
| `GET` | `/v2/stream-notifications/get-recent` |

---

## 13. Groups & badges

| Method | URL |
| --- | --- |
| `GET` | `/v1/groups/{groupId}` |
| `GET` | `/v1/groups/{groupId}/roles` |
| `GET` | `/v2/users/{userId}/groups/roles` |
| `GET` | `/groups/search/lookup?keyword=` |
| `GET` | `/v2/groups/{groupId}/games` |
| `POST` | `/v1/badges/{badgeId}` |
| `POST` | `/assets/award-badge` |

---

## 14. Stub these (return `200 OK {}`)

The APK hammers these. They're non-essential — return empty body to silence retries.

- `POST /pe`, `POST /client/pbe` (telemetry)
- `POST /v1/enrollments`, `POST /v1/get-enrollments`
- `POST /v1.0/SequenceStatistics/AddToSequence`
- `POST /v1.0/SequenceStatistics/BatchAddToSequencesV2`
- `POST /v1.0/MultiIncrement`
- `POST /v1.1/Counters/Increment`
- `POST /v1.1/Counters/BatchIncrement`
- Anything `realtime-signalr.*` / `realtime.*` (real-time push — not implemented; long-poll fallback returns empty array fine)

---

## 15. Working `curl` examples

### Login (mobileapi)
```bash
curl -i -c cookies.txt -X POST 'https://www.zekoro.org/mobileapi/login' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: Roblox/Android' \
  -d '{"userName":"alye","userPassword":"hunter2"}'
```

### Refresh CSRF token
```bash
curl -i -b cookies.txt -X POST 'https://www.zekoro.org/v1/avatar/redraw-thumbnail' \
  -H 'Content-Type: application/json' -d '{}'
# → 403, header: x-csrf-token: AB12CD...
```

### Authenticated request
```bash
curl -b cookies.txt 'https://www.zekoro.org/v1/users/authenticated'
```

### Join a place
```bash
curl -b cookies.txt -X POST 'https://www.zekoro.org/v1/join-game' \
  -H 'Content-Type: application/json' -H 'X-CSRF-TOKEN: <token>' \
  -d '{"placeId":1234}'
```

### Buy an item
```bash
curl -b cookies.txt -X POST 'https://www.zekoro.org/marketplace/purchase' \
  -H 'Content-Type: application/json' -H 'X-CSRF-TOKEN: <token>' \
  -d '{"productId":56789,"expectedCurrency":1,"expectedPrice":100,"expectedSellerId":1}'
```

---

## 16. Known limitations / not implemented

- No SignalR push (`realtime-signalr`) — APK falls back to polling fine.
- Voice chat disabled.
- Trades, premium membership flows, gift card redemption: not wired.
- Phone verification, parental controls: not wired.

If `alye` finds the APK calling something not in this doc, send the URL + status code and we can add it.
