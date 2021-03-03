import os
class Config:

    def __init__(self):
        self.server = 'https://nweb.io/'
        self.max_threads = 3
        self.timeout = 360
        self.submit_token = os.environ.get("SUBMITTOKEN") or None

