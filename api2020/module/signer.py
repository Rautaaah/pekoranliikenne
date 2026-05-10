import base64
import datetime
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding


class Signer:
    def __init__(self, key_path):
        with open(key_path, "rb") as f:
            self.key = serialization.load_pem_private_key(f.read(), password=None)

    def sign(self, data):
        sig = self.key.sign(data.encode("utf-8"), padding.PKCS1v15(), hashes.SHA1())
        return base64.b64encode(sig).decode("ascii")

    def sign_script(self, script):
        return "--rbxsig2%" + self.sign("\r\n" + script) + "%"

    def client_ticket(self, user_id, username, job_id, place_id, base_url,
                      membership="None", account_age=365):
        now = datetime.datetime.now().strftime("%#m/%#d/%Y %#I:%M:%S %p")
        char_app = base_url + "/v1.1/avatar-fetch?userId=" + str(user_id) + "&placeId=" + str(place_id)
        country = "US"

        first = str(user_id) + "\n" + username + "\n" + char_app + "\n" + job_id + "\n" + now

        second = (
            now + "\n" + job_id + "\n" + str(user_id) + "\n" + str(user_id) + "\n0\n"
            + str(account_age) + "\nf\n"
            + str(len(username)) + "\n" + username + "\n"
            + str(len(membership)) + "\n" + membership + "\n"
            + str(len(country)) + "\n" + country + "\n0\n\n"
            + str(len(username)) + "\n" + username
        )

        return now + ";" + self.sign(first) + ";" + self.sign(second) + ";4"
