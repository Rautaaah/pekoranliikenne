# make it bulba yo
import json
import logging
import os
from urllib.parse import quote
from flask import Flask, Response, jsonify, make_response, redirect, request, send_file
from module import Assets, FFlags, JoinPayload, Signer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(BASE_DIR, "config.json"), "r", encoding="utf-8") as f:
    config = json.load(f)
BASE_URL = "http://www." + config["base_url"]

signer = Signer(os.path.join(BASE_DIR, config["path_private_key"]))
fflags = FFlags(os.path.join(BASE_DIR, config["path_fflags"]), config.get("settings_key", ""))
assets = Assets(os.path.join(BASE_DIR, config["path_assets"]))
payload = JoinPayload(signer, config)

class CaseInsensitivePath:
    def __init__(self, wsgi_app, flask_app):
        self.wsgi_app = wsgi_app
        self.flask_app = flask_app
        self.lookup = {}
        self.rules_seen = 0

    def refresh(self):
        rules = list(self.flask_app.url_map.iter_rules())
        if len(rules) == self.rules_seen:
            return
        self.rules_seen = len(rules)
        self.lookup = {rule.rule.lower(): rule.rule for rule in rules}

    def __call__(self, environ, start_response):
        self.refresh()
        path = environ.get("PATH_INFO", "")
        if path:
            lower = path.lower()
            real = self.lookup.get(lower)
            if real and real != path:
                environ["PATH_INFO"] = real
        return self.wsgi_app(environ, start_response)


app = Flask(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)


@app.before_request
def log_request():
    host = request.headers.get("Host", "?")
    body = ""
    if request.method in ("POST", "PUT"):
        raw = request.get_data(cache=True)
        if raw:
            body = " body=" + repr(raw[:200])
    app.logger.info("%s %s%s qs=%s%s", request.method, host, request.path, dict(request.args), body)


@app.errorhandler(404)
def not_found(_):
    host = request.headers.get("Host", "")
    app.logger.warning("404 %s %s%s qs=%s", request.method, host, request.path, dict(request.args))
    return {"errors": [{"code": 0, "message": "Not found"}]}, 404



# Root / health
@app.get("/")
def index():
    return {"name": "simple-api", "ok": True, "base_url": BASE_URL}

# Auth / current user
@app.route("/Login/Negotiate.ashx", methods=["GET", "POST"])
@app.route("/login/negotiateasync.ashx", methods=["GET", "POST"])
def login_negotiate():
    suggest = request.args.get("suggest") or request.form.get("suggest") or ""
    resp = make_response(suggest)
    if suggest:
        resp.set_cookie(".ROBLOSECURITY", suggest, max_age=60 * 60 * 24 * 364,
                        httponly=True, path="/")
    return resp

@app.get("/GetCurrentUser.ashx")
@app.get("/Game/GetCurrentUser.ashx")
def current_user_legacy():
    return str(config["default_user"]["id"]), 200, {"Content-Type": "text/plain"}

@app.get("/v1/users/authenticated")
def user_authenticated():
    u = config["default_user"]
    return jsonify({"id": u["id"], "name": u["name"], "displayName": u["name"]})

@app.get("/v1/users/<int:user_id>")
def user_by_id(user_id):
    u = config["default_user"]
    name = u["name"] if user_id == u["id"] else "User" + str(user_id)
    return jsonify({
        "description": "",
        "created": "2020-01-01T00:00:00Z",
        "isBanned": False,
        "externalAppDisplayName": None,
        "hasVerifiedBadge": False,
        "id": user_id,
        "name": name,
        "displayName": name,
    })

# Avatar / character
AVATAR_PAYLOAD = {
    "resolvedAvatarType": "R6",
    "equippedGearVersionIds": [],
    "backpackGearVersionIds": [],
    "assetAndAssetTypeIds": [],
    "animationAssetIds": {},
    "bodyColors": {
        "headColorId": 1002, "torsoColorId": 1002,
        "rightArmColorId": 1002, "leftArmColorId": 1002,
        "rightLegColorId": 1002, "leftLegColorId": 1002,
    },
    "playerAvatarType": "R6",
    "scales": {"bodyType": 0, "head": 1, "height": 1, "proportion": 0, "depth": 1, "width": 1},
}

@app.get("/v1/avatar-fetch")
@app.get("/v1.1/avatar-fetch")
@app.get("/v1/users/<int:user_id>/avatar")
def avatar_fetch(user_id=0):
    return jsonify(AVATAR_PAYLOAD)

@app.get("/Asset/CharacterFetch.ashx")
@app.get("/Asset/BodyColors.ashx")
def character_fetch_legacy():
    return "", 200, {"Content-Type": "text/plain"}

# PlaceLauncher / join pipeline
@app.route("/game/PlaceLauncher.ashx", methods=["GET", "POST"])
@app.route("/Game/PlaceLauncher.ashx", methods=["GET", "POST"])
def place_launcher():
    place_id = request.args.get("placeid") or request.args.get("placeId") or str(config["game_server"]["place_id"])
    ticket = request.args.get("ticket", "ticket")
    username = (request.args.get("username") or request.args.get("userName") or "").strip()
    join_url = BASE_URL + "/game/join.ashx?placeid=" + place_id + "&ticket=" + ticket
    if username:
        join_url += "&username=" + quote(username, safe="")
    return jsonify({
        "jobId": config["game_server"]["job_id"],
        "status": 2,
        "joinScriptUrl": join_url,
        "authenticationUrl": BASE_URL + "/Login/Negotiate.ashx",
        "authenticationTicket": ticket,
        "message": "",
    })

@app.route("/game/join.ashx", methods=["GET", "POST"])
@app.route("/Game/Join.ashx", methods=["GET", "POST"])
def join_script():
    place_id = int(request.args.get("placeid") or request.args.get("placeId") or config["game_server"]["place_id"])
    job_id = request.args.get("jobId") or config["game_server"]["job_id"]
    username = (request.args.get("username") or request.args.get("userName") or "").strip() or None
    body = payload.build(place_id=place_id, job_id=job_id, username=username)
    return Response(body, mimetype="text/plain")

# Asset delivery
def serve_asset(asset_id):
    if not asset_id or not str(asset_id).isdigit():
        return {"errors": [{"message": "bad id"}]}, 400
    path = assets.resolve(asset_id)
    if not path:
        return redirect("https://assetdelivery.roblox.com/v1/asset/?id=" + str(asset_id))
    return send_file(path, mimetype="application/octet-stream")

@app.get("/asset/")
@app.get("/Asset/")
@app.get("/asset.ashx")
def asset_legacy():
    return serve_asset(request.args.get("id", ""))

@app.get("/v1/asset/")
@app.get("/v1/asset")
def asset_v1():
    return serve_asset(request.args.get("id", ""))

# FFlags / application settings
@app.get("/v1/settings/application")
@app.get("/v2/settings/application")
def settings_app_flat():
    return jsonify(fflags.resolve(request.args.get("applicationName", "")))

@app.get("/v2/settings/application/<app_name>")
@app.get("/v2/settings/application/<app_name>/bucket/<bucket>")
def settings_app_path(app_name, bucket=""):
    return jsonify(fflags.resolve(app_name))

@app.get("/Setting/QuietGet/<type_>")
@app.get("/Setting/QuietGet/<type_>/")
def setting_quiet_get(type_):
    data = fflags.read(type_)
    if data is None:
        app.logger.warning("QuietGet %s: fflags/%s.json missing", type_, type_)
        return Response("{}", mimetype="text/plain"), 404
    return Response(json.dumps(data), mimetype="text/plain")

@app.get("/Setting/24")
def setting_24():
    data = fflags.read("2014LFFlags")
    return Response(json.dumps(data) if data else "{}", mimetype="text/plain")

# api.<base_url> endpoints (GetAllowed*, versioncompatibility)

def route_rcc_api(rule, view):
    app.add_url_rule(rule, endpoint=view.__name__ + "_a", view_func=view, methods=["GET"])
    app.add_url_rule(rule + "/", endpoint=view.__name__ + "_b", view_func=view, methods=["GET"])


def get_allowed_md5_hashes():
    return jsonify({"data": config.get("allowed_md5_hashes", [])})


def get_allowed_security_keys():
    return jsonify(True)


def get_allowed_security_versions():
    return jsonify({"data": config.get("security_versions", [])})

def get_allowed_experimental_features():
    return jsonify({
        "placeId": request.args.get("placeId", ""),
        "features": config.get("experimental_features", []),
    })

def version_compatibility():
    return jsonify({"isCompatible": True, "compatible": True})

route_rcc_api("/GetAllowedMD5Hashes", get_allowed_md5_hashes)
route_rcc_api("/GetAllowedSecurityKeys", get_allowed_security_keys)
route_rcc_api("/GetAllowedSecurityVersions", get_allowed_security_versions)
route_rcc_api("/GetAllowedExperimentalFeatures", get_allowed_experimental_features)
route_rcc_api("/versioncompatibility", version_compatibility)

# Presence (critical - RCC adds player to clist via this call)
@app.post("/v1/presence/register-game-presence")
@app.post("/presence/register-game-presence")
@app.post("/v1/presence/register-app-presence")
@app.post("/presence/register-app-presence")
@app.post("/v1/presence/register-absence")
@app.post("/presence/register-absence")
def presence_register():
    return "", 200

@app.post("/v1/presence/users")
@app.post("/v2/presence/users")
def presence_users():
    ids = (request.get_json(silent=True) or {}).get("userIds", [])
    return jsonify({"userPresences": [
        {"userPresenceType": 2, "lastLocation": "Game", "placeId": None,
         "rootPlaceId": None, "gameId": None, "universeId": None,
         "userId": uid, "lastOnline": "2020-01-01T00:00:00Z"} for uid in ids
    ]})

# Game-server lifecycle (called by RCC)
@app.post("/gs/ping")
@app.post("/gs/shutdown")
def gs_noop():
    return "", 200

@app.route("/v2/CreateOrUpdate", methods=["GET", "POST"])
@app.route("/v2/CreateOrUpdate/", methods=["GET", "POST"])
@app.route("/v1/CreateOrUpdate", methods=["GET", "POST"])
@app.route("/v1/CreateOrUpdate/", methods=["GET", "POST"])
def arbiter_create_or_update():
    return jsonify({"success": True})

@app.post("/gs/activity")
def gs_activity():
    return jsonify({"isAlive": True, "updatedAt": "2020-01-01T00:00:00Z"})

@app.post("/gs/players/report")
def gs_players_report():
    body = request.get_json(silent=True) or {}
    app.logger.info("gs/players/report event=%s user=%s place=%s server=%s",
                    body.get("eventType"), body.get("userId"),
                    body.get("placeId"), body.get("serverId"))
    return "", 200

@app.post("/game/report-stats")
def game_report_stats():
    return "", 200

@app.post("/game/validate-machine")
def validate_machine():
    return jsonify({"success": True, "message": ""})

@app.get("/universes/validate-place-join")
def validate_place_join():
    return "true", 200, {"Content-Type": "text/plain"}

@app.route("/Game/LoadPlaceInfo.ashx", methods=["GET", "POST"])
@app.route("/game/load-place-info", methods=["POST"])
def load_place_info():
    gs = config["game_server"]
    place_id = int(request.headers.get("roblox-place-id")
                   or request.args.get("placeId") or gs["place_id"])
    return jsonify({
        "placeId": place_id,
        "universeId": gs["universe_id"],
        "isActive": True,
        "isReportAbuseEnabled": False,
        "isFavoritedByUser": False,
        "isVotingEnabled": False,
        "name": "Place " + str(place_id),
        "creatorId": gs["creator_id"],
        "creatorType": gs.get("creator_type", "User"),
        "creatorName": "ROBLOX",
        "placeVersion": gs.get("place_version", 1),
    })

# Chat filter / moderation
@app.post("/Game/ChatFilter.ashx")
def chat_filter_ashx():
    text = request.form.get("text", "") or (request.get_json(silent=True) or {}).get("text", "")
    return jsonify({"data": {"white": text, "black": text}})

@app.post("/v2/filtertext")
@app.post("/moderation/v2/filtertext")
@app.post("/moderation/filtertext")
def filter_text():
    text = request.form.get("text", "") or (request.get_json(silent=True) or {}).get("text", "")
    return jsonify({"success": True, "data": {
        "AgeUnder13": text, "Age13OrOver": text, "white": text, "black": text,
    }})

# Marketplace / catalog / game passes
def product_info(asset_id):
    return {
        "TargetId": asset_id,
        "ProductType": "User Product",
        "AssetId": asset_id,
        "ProductId": asset_id,
        "Name": "Asset " + str(asset_id),
        "Description": "",
        "AssetTypeId": 8,
        "Creator": {"Id": 1, "Name": "ROBLOX", "CreatorType": "User", "CreatorTargetId": 1},
        "IconImageAssetId": 0,
        "Created": "2020-01-01T00:00:00Z",
        "Updated": "2020-01-01T00:00:00Z",
        "PriceInRobux": None,
        "PriceInTickets": None,
        "Sales": 0,
        "IsNew": False,
        "IsForSale": False,
        "IsPublicDomain": True,
        "IsLimited": False,
        "IsLimitedUnique": False,
        "Remaining": None,
        "MinimumMembershipLevel": 0,
        "ContentRatingTypeId": 0,
    }

@app.route("/marketplace/productinfo", methods=["GET", "POST"])
@app.route("/marketplace/productdetails", methods=["GET", "POST"])
def marketplace_product():
    return jsonify(product_info(int(request.args.get("assetId") or request.args.get("AssetID") or 0)))

@app.route("/marketplace/game-pass-product-info", methods=["GET", "POST"])
def marketplace_gamepass():
    gp_id = int(request.args.get("gamePassId") or request.args.get("assetId") or 0)
    info = product_info(gp_id)
    info["ProductType"] = "Game Pass"
    info["AssetTypeId"] = 34
    return jsonify(info)

@app.get("/v2/assets/<int:asset_id>/details")
def asset_details(asset_id):
    return jsonify(product_info(asset_id))

@app.get("/Game/GamePass/GamePassHandler.ashx")
def gamepass_handler():
    return jsonify([])

@app.get("/v1/catalog/items/<int:item_id>/details")
def catalog_item(item_id):
    return jsonify({"id": item_id, "itemType": "Asset", "name": "", "description": ""})

@app.get("/v1/users/<int:user_id>/items/gamepass/<int:asset_id>")
def user_gamepass(user_id, asset_id):
    return jsonify({"data": []})

@app.get("/ownership/hasasset")
@app.get("/asset/isowned")
def has_asset():
    return "false", 200, {"Content-Type": "text/plain"}

@app.get("/users/<int:user_id>/canmanage/<int:asset_id>")
def can_manage(user_id, asset_id):
    return jsonify({"Success": True, "CanManage": True})

# Badges
@app.route("/game/badge/hasbadge.ashx", methods=["GET", "POST"])
@app.route("/Game/Badge/HasBadge.ashx", methods=["GET", "POST"])
def has_badge():
    return "Failure", 200, {"Content-Type": "text/plain"}

@app.post("/game/badge/award.ashx")
@app.post("/assets/award-badge")
def award_badge():
    return "true", 200, {"Content-Type": "text/plain"}

@app.post("/v1/users/<int:user_id>/badges/<int:badge_id>/award-badge")
def award_badge_v1(user_id, badge_id):
    return jsonify({"creatorType": "User", "creatorId": 1, "awardAssetIds": []})

# Universe / place info
@app.get("/v1/universes/<int:uid>")
@app.get("/v1/universes/multiget")
def universe(uid=0):
    gs = config["game_server"]
    return jsonify({
        "id": uid or gs["universe_id"],
        "rootPlaceId": gs["place_id"],
        "name": "Template Universe",
        "creatorId": gs["creator_id"],
        "creatorType": gs.get("creator_type", "User"),
    })

@app.get("/v1/rcc/Places/<int:place_id>")
@app.get("/v1/places/<int:place_id>")
def rcc_place(place_id):
    gs = config["game_server"]
    return jsonify({
        "placeId": place_id,
        "universeId": gs["universe_id"],
        "name": "Place " + str(place_id),
        "creatorId": gs["creator_id"],
        "creatorType": gs.get("creator_type", "User"),
        "placeVersion": gs.get("place_version", 1),
        "isActive": True,
    })

@app.get("/v1.1/game-start-info")
def game_start_info():
    gs = config["game_server"]
    return jsonify({
        "universeId": int(request.args.get("universeId", gs["universe_id"])),
        "placeId": gs["place_id"],
        "creatorId": gs["creator_id"],
        "creatorType": gs.get("creator_type", "User"),
        "creatorName": "ROBLOX",
        "isFriendsOnly": False,
        "genre": "All",
        "gameDensity": "Low",
        "playableDevices": ["Computer", "Phone", "Tablet", "Console"],
        "universeAvatarType": "PlayerChoice",
    })

@app.get("/universes/get-universe-places")
def universe_places():
    return jsonify({"Data": {"Places": [config["game_server"]["place_id"]]}})

@app.get("/universes/get-universe-containing-place")
def universe_containing_place():
    return jsonify({"UniverseId": config["game_server"]["universe_id"]})

@app.get("/v1/gametemplates")
def game_templates():
    return jsonify({"gameTemplates": [{
        "gameTemplateType": 13, "name": "Baseplate",
        "description": "An empty baseplate", "universeId": 0,
        "placeId": 0, "hasTutorials": False,
        "projectType": 1, "projectCategoryType": 1, "isLuau": True,
    }]})

@app.get("/universal-app-configuration/v1/behaviors/app-policy/content")
def app_policy():
    return jsonify({
        "ArePaidRandomItemsRestricted": False,
        "IsPaidItemTradingAllowed": True,
        "IsSubjectToChinaPolicies": False,
        "AllowedExternalLinkReferences": [],
    })

@app.get("/universal-app-configuration/v1/behaviors/app-patch/content")
def app_patch():
    return jsonify({"AppPatchCanaryUserIds": [], "AppPatchCanaryPercentage": 0})

@app.get("/v1/player-policies-rcc")
@app.get("/v1/player-policies-client")
def player_policies():
    return jsonify({
        "ArePaidRandomItemsRestricted": False,
        "AllowedExternalLinkReferences": [],
        "IsPaidItemTradingAllowed": True,
        "IsSubjectToChinaPolicies": False,
    })

@app.post("/v1/rcc/Scripts")
@app.get("/v1/rcc/Scripts")
def rcc_scripts():
    return jsonify({"scripts": []})

@app.get("/v1/rcc/playfab-title")
def playfab_title():
    return jsonify({"titleId": ""})

# Social / friends
@app.get("/v1/users/<int:user_id>/friends")
@app.get("/v1/users/<int:user_id>/friends/online")
def friends(user_id):
    return jsonify({"data": []})

@app.get("/v1/users/<int:user_id>/groups/roles")
@app.get("/v2/users/<int:user_id>/groups/roles")
def groups_roles(user_id):
    return jsonify({"data": []})

@app.get("/my/friendsonline")
def my_friends_online():
    return jsonify([])

@app.get("/v1/users/<int:user_id>/followers/count")
@app.get("/v1/users/<int:user_id>/followings/count")
@app.get("/v1/users/<int:user_id>/friends/count")
def social_count(user_id):
    return jsonify({"count": 0})

@app.get("/v1/user/friend-requests/count")
def friend_request_count():
    return jsonify({"count": 0})

# Analytics / telemetry (noop)
def noop(*args, **kwargs):
    return "", 200

ANALYTICS = [
    "/Analytics/LogFile.ashx",
    "/Analytics/Measurement.ashx",
    "/Error/Breakpad.ashx",
    "/Error/Dmp.ashx",
    "/Error/Grid.ashx",
    "/JoinRate.ashx",
    "/v1/rcc/send-batch",
    "/v1/performance/measurements",
]
for i, path in enumerate(ANALYTICS):
    app.add_url_rule(path, endpoint="noop_" + str(i), view_func=noop,
                     methods=["GET", "POST", "PUT"])

def empty_json(*args, **kwargs):
    return jsonify({})

EMPTY_JSON = [
    "/v1/behaviors/",
    "/v1/enrollments",
    "/v1/get-enrollments",
    "/v1/subscriptions",
    "/v1/avatar-rules",
    "/v1/metadata",
    "/v2/metadata",
    "/v2/get-rollout-settings",
    "/v1/locales",
    "/v1/locales/user-localization-locus-supported-locales",
    "/alerts/alert-info",
    "/my/settings/json",
    "/api/users/account-info",
    "/users/account-info",
    "/device/initialize",
]
for i, path in enumerate(EMPTY_JSON):
    app.add_url_rule(path, endpoint="empty_" + str(i), view_func=empty_json, methods=["GET"])

app.wsgi_app = CaseInsensitivePath(app.wsgi_app, app)

if __name__ == "__main__":
    app.run(
        host=config.get("host", "0.0.0.0"),
        port=int(config.get("port", 5000)),
        debug=False,
        threaded=True,
    )
