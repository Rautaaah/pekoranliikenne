import os


class Assets:
    EXTENSIONS = ("rbxl", "rbxlx", "rbxm", "rbxmx", "bin", "dat")

    def __init__(self, folder):
        self.folder = folder

    def resolve(self, asset_id):
        if not str(asset_id).isdigit():
            return None

        for ext in self.EXTENSIONS:
            path = os.path.join(self.folder, str(asset_id) + "." + ext)
            if os.path.isfile(path):
                return path

        path = os.path.join(self.folder, str(asset_id))
        if os.path.isfile(path):
            return path

        return None
