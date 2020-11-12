#!/usr/bin/python3

import sys
import requests
import subprocess
import time
import os
import random
import string
import json
import base64

import threading
import multiprocessing
import multiprocessing.pool

# my script for headshotting servers
from getheadshot import getheadshot
from config import Config
from sys import argv, exit

try:
  import ipaddress
except:
  print("[!] ipaddress module not found")
  sys.exit()

config = Config()

submit_token=config.submit_token # provided through agent_env file

def scan(submit_token):
  server=config.server
  print("[+] Fetching Target from %s" % server)
  target_data = json.loads(requests.get(server+"/getwork").text)
  print("OMG "+str(target_data))
  target = target_data["target"]
  print("[+] Target: "+target)

  # scan server 
  rand = ''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(10))
  print("[+] Scan ID: "+rand)

  command = ["nmap","-oA","data/nweb."+rand,"-sC","-sV","--open","-Pn","--system-dns",target]

  if 'ports' in target_data:
    command.append('-p')
    command.append(str(target_data['ports'])[1:-1])

  process = subprocess.Popen(command,stdout=subprocess.PIPE)
  try:
    out, err = process.communicate(timeout=config.timeout) # 6 minutes
  except:
    try:
      print("[+] (%s) Killing slacker process" % rand)
      process.kill()
    except:
      pass

  print("[+] Scan Complete: " + rand)
  #print(out)

  result={}
  for ext in 'nmap','gnmap','xml':
    result[ext+"_data"]=open("data/nweb."+rand+"."+ext).read()
    os.remove("data/nweb."+rand+"."+ext)
    print("[+] (%s) Cleaning up: nweb.%s.%s" % (rand, rand, ext))

  if len(result['nmap_data']) < 200:
    print("[!] (%s) Nmap data is too short" % rand)
    print("[+] (%s) scan size: %s" % (rand, len(result['nmap_data'])))
    return
  else:
    print("[+] (%s) scan size: %s" % (rand, len(result['nmap_data'])))

  if "80/tcp" in result['nmap_data']:
    if getheadshot(target,rand, 'http') is True:
      result['httpheadshot']=str(base64.b64encode(open("data/nweb."+rand+".http.headshot.jpg",'rb').read()))[2:-1]
      os.remove("data/nweb."+rand+".http.headshot.jpg")
      print("[+] (%s) HTTP snapshot acquired" % rand)
  if "443/tcp" in result['nmap_data']:
    if getheadshot(target,rand, 'https') is True:
      result['httpsheadshot']=str(base64.b64encode(open("data/nweb."+rand+".https.headshot.jpg",'rb').read()))[2:-1]
      os.remove("data/nweb."+rand+".https.headshot.jpg")
      print("[+] (%s) HTTPS snapshot acquired" % rand)
  if "5900/tcp" in result['nmap_data']:
    if getheadshot(target,rand, 'vnc') is True:
      result['vncsheadshot']=str(base64.b64encode(open("data/nweb."+rand+".vnc.headshot.jpg",'rb').read()))[2:-1]
      os.remove("data/nweb."+rand+".vnc.headshot.jpg")
      print("[+] (%s) VNC snapshot acquired" % rand)

  # submit result
  print("[+] (%s) Submitting work" % rand)
  result['submit_token']=submit_token
  response=requests.post(server+"/submit",json=json.dumps(result)).text
  print("[+] (%s) Response:\n%s" % (rand, response))

def main():

  submit_token = config.submit_token 

  if not os.path.isdir("data"):
    os.mkdir("data")
  while True:
    if threading.active_count() < config.max_threads:
      notifylock=False
      print("[+] Active Threads: %s" % threading.active_count())
      t = threading.Thread(target=scan,args=[submit_token])
      t.start()
    else:
      if notifylock is False:
        print("[+] Thread pool exhausted")
      notifylock=True

    time.sleep(1)

if __name__ == "__main__":
  main()
