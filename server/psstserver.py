from geventwebsocket import WebSocketServer, WebSocketApplication, Resource
from random import randint
import hashlib

pairs = {}

class ServerApplication(WebSocketApplication):
  def on_open(self):
    print "Connection opened"
    self.status = 0

  def on_message(self, message):
    if self.status == 0:
      if message == 'abcd1234abcd1234':
        # New chat
        id = hashlib.md5(str(randint(0,1000000000))).hexdigest()[0:16]  
        pairs[id] = self
        self.ws.send(id)
        #self.ws.send("OK")
        #self.status = 2
      else:
        if pairs.has_key( message ):
          # Connect the pairs and go to status=2
          pairs[message].remote = self
          pairs[message].ws.send("OK")
          pairs[message].status = 2
          self.remote = pairs[message]
          del pairs[message]
          self.ws.send(message)
          self.ws.send("OK")
          self.status = 2
        else:
          self.ws.send("ERROR")
    elif self.status == 1:
      # No packages should ever be received here.. Abort!
      self.ws.close()
    else:
      # Send to other client here
      #self.ws.send(message)
      self.remote.ws.send( message )

  def on_close(self, reason):
    print reason

WebSocketServer(
    ('', 7778), # PSST T9
    Resource({'/': ServerApplication})
).serve_forever()
