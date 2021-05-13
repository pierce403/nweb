import json
from elasticsearch import Elasticsearch
import random
import os

try:
  es = Elasticsearch(os.environ['ELASTIC'])
  print("[+] connecting to "+os.environ['ELASTIC'])
except Exception as e:
  es = Elasticsearch([{'host': 'localhost', 'port': 9200}])
  print("[-] elastic falling back to localhost "+str(e))

host_index = "nweb_hosts"
history_index = "nmap_history"
services_index = "masscan_services"

def search(query, limit, offset):
  if query == '':
    query = 'nmap'
  try:
    #result = es.search(index=host_index, doc_type='_doc', body={'size':limit, 'from':offset, 'query':{'query_string': {'query':query,  'fields':['nmap_data'],  'default_operator':'AND'}},  'sort':{'timestamp': {'order': 'desc'}}})
    result = es.search(index=host_index, body={'size':limit, 'from':offset, 'track_total_hits':False, 'query':{'query_string': {'query':query, 'default_operator':'AND'}},  'sort':{'timestamp': {'order': 'desc'}}})
  except Exception as e:
    print('[E] ' + str(e))
    return 0, []

  results=[] # collate results
  for thing in result['hits']['hits']:
    results.append(thing['_source'])

  return 0,results
  #return result['hits']['total'],results

def addhost(host):
  ip = str(host['ip'])
  # broken in ES6
  es.index(index=history_index, doc_type='_doc', body=host)
  es.index(index=host_index, doc_type='_doc', id=ip, body=host)

def gethost(ip):
  result = es.get(index=host_index, doc_type='_doc', id=ip)
  return result['_source']

def getwork_elastic():
  result_count = 0
  while result_count < 1:
    rand_subnet = str(random.randint(0, 255)) + '.' + str(random.randint(0, 255)) + '.0.0/16'
    print('[+] trying ' + rand_subnet)
    result = es.search(index=host_index, doc_type='_doc', body={'size':1000,  'query':{'term': {'ip': rand_subnet}},  'sort':{'timestamp': {'order': 'asc'}}})
    result_count = len(result['hits']['hits'])

  randip = str(result['hits']['hits'][random.randint(0, result_count)]['_source']['ip'])
  print('[+] Got the random IP! ' + str(randip))
  result = es.search(index=services_index, doc_type='_doc', body={'size':1000,  'query':{'match': {'ip': randip}}})
  ports = []
  for thing in result['hits']['hits']:
    port = int(thing['_source']['port'])
    if port not in ports:
      ports.append(port)

  ports.sort()
  work = {}
  work['type'] = 'nmap'
  work['target'] = randip
  work['ports'] = ports
  return json.dumps(work)
