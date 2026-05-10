import hashlib
import json
import time
import uuid


class JoinPayload:
    def __init__(self, signer, config):
        self.signer = signer
        self.config = config
        self.base_url = "http://www." + config["base_url"]

    def user_id_from_name(self, username):
        # Stable per-nick id in range [1000, 2^31-1] so every player in the
        # server has a unique UserId (avoids collisions when multiple clients
        # connect with the default account).
        digest = hashlib.sha1(username.lower().encode("utf-8")).hexdigest()
        return 1000 + (int(digest[:8], 16) % 2_000_000_000)

    def build(self, place_id, job_id, username=None, user_id=None):
        default = self.config["default_user"]
        gs = self.config["game_server"]

        if username:
            name = username
            uid = user_id if user_id is not None else self.user_id_from_name(username)
        else:
            name = default["name"]
            uid = default["id"]

        user = {"id": uid, "name": name}
        membership = default.get("membership_type", "None")

        ticket = self.signer.client_ticket(
            user_id=user["id"],
            username=user["name"],
            job_id=job_id,
            place_id=place_id,
            base_url=self.base_url,
            membership=membership,
        )

        payload = {
            "ClientPort": 0,
            "MachineAddress": gs["machine_address"],
            "ServerPort": gs["server_port"],
            "PingUrl": "",
            "PingInterval": 60,
            "UserName": user["name"],
            "DisplayName": user["name"],
            "SeleniumTestMode": False,
            "UserId": user["id"],
            "SuperSafeChat": False,
            "CharacterAppearance": self.base_url + "/v1.1/avatar-fetch?userId=" + str(user["id"]) + "&placeId=" + str(place_id),
            "ClientTicket": ticket,
            "GameId": job_id,
            "PlaceId": place_id,
            "UniverseId": gs["universe_id"],
            "BaseUrl": self.base_url + "/",
            "ChatStyle": "Classic",
            "CreatorId": gs["creator_id"],
            "CreatorTypeEnum": gs.get("creator_type", "User"),
            "MembershipType": membership,
            "AccountAge": 365,
            "CookieStoreFirstTimePlayKey": "rbx_evt_ftp",
            "CookieStoreFiveMinutePlayKey": "rbx_evt_fmp",
            "CookieStoreEnabled": True,
            "IsRobloxPlace": False,
            "GenerateTeleportJoin": False,
            "IsUnknownOrUnder13": False,
            "SessionId": str(uuid.uuid4()),
            "DataCenterId": gs.get("data_center_id", "1"),
            "RandomSeed1": "0",
            "ClientPublicKeyUrl": "",
            "VendorId": 0,
            "ScreenShotInfo": "",
            "VideoInfo": "",
            "CreatorName": "ROBLOX",
            "FollowUserId": 0,
            "characterAppearanceId": user["id"],
            "CountryCode": "US",
            "AnalyticsSessionId": str(uuid.uuid4()),
            "UniverseCategoryNameId": 0,
            "RobloxLocale": "en_us",
            "GameLocale": "en_us",
            "ClientBuildType": 0,
            "PlaceVersion": gs.get("place_version", 1),
            "PartyId": "",
            "Timestamp": int(time.time()),
        }

        script = json.dumps(payload, separators=(",", ":"))
        return self.signer.sign_script(script) + "\r\n" + script
