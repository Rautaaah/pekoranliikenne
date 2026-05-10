import json
import os


class FFlags:
    def __init__(self, folder, settings_key=""):
        self.folder = folder
        self.settings_key = settings_key

    def read(self, name):
        if not name:
            return None
        path = os.path.join(self.folder, name + ".json")
        if not os.path.isfile(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if "applicationSettings" not in data:
            data = {"applicationSettings": data}
        return data

    def resolve(self, app_name, fallback_client=True):
        if self.settings_key and app_name == "RCCService" + self.settings_key:
            data = self.read("RCCService")
            if data is not None:
                return data
        if fallback_client:
            data = self.read("PCDesktopClient")
            if data is not None:
                return data
        return {"applicationSettings": {}}
