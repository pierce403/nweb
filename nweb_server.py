import flask
from flask_talisman import Talisman, DEFAULT_CSP_POLICY
from flask import render_template, redirect, request, Flask, g, send_from_directory, abort, jsonify, url_for
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import Table, Column, Float, Integer, String, DateTime, MetaData, ForeignKey, func

import random, string, time

from web3.auto import w3
from eth_account.messages import defunct_hash_message
from flask_jwt_extended import JWTManager, jwt_required, create_access_token, get_jwt_identity, set_access_cookies, jwt_optional, get_raw_jwt, unset_jwt_cookies
from ethhelper import *

import os
import json
import sys
import traceback

import models_elastic as nweb
from nmap_helper import * # get_ip etc

from datetime import datetime

app = Flask(__name__,static_url_path='/static')
Talisman(app,content_security_policy=os.environ.get("CSP_DIRECTIVES", DEFAULT_CSP_POLICY))
app.jinja_env.add_extension('jinja2.ext.do')

# Setup the Flask-JWT-Extended extension
# log2(26^22) ~= 100 (pull at least 100 bits of entropy)
app.config['JWT_SECRET_KEY'] = os.environ.get("JWT_SECRET_KEY",''.join(random.choice(string.ascii_lowercase) for i in range(22)))

#app.config['JWT_SECRET_KEY'] = '12345'
app.config['JWT_TOKEN_LOCATION'] = ['cookies']
if app.debug == False:
  app.config['JWT_COOKIE_SECURE'] = True
#app.config['JWT_ACCESS_COOKIE_PATH'] = '/api/'
app.config['JWT_COOKIE_CSRF_PROTECT'] = True
app.config['JWT_CSRF_CHECK_FORM'] = True
jwt = JWTManager(app)

import users
users.setup(app)

@app.teardown_request
def shutdown_session(exception=None):
  users.db.session.remove()

@app.teardown_appcontext
def shutdown_session(exception=None):
  users.db.session.remove()

@app.before_first_request
def setup():
  print("[+] running setup")
  try:
    users.init()
    print("[+] created users db")
  except:
    print("[+] users db already exists")

@app.before_request
def before_request():
  g.preview_length = 100

# Create your views here.
@app.route('/host')
def host():
  host = request.args.get('h')
  context = nweb.gethost(host)
  return render_template("host.html",**context)

@app.route('/')
def search():
  query = request.args.get('q', '')
  page = int(request.args.get('p', 1))
  format = request.args.get('f', "")

  results_per_page = 20 # TODO maybe tweak as a premium feature?
  searchOffset = results_per_page * (page-1)
  count,context = nweb.search(query,results_per_page,searchOffset)
  
  if not isinstance(count,int):
    count = count['value']

  next_url = url_for('search', q=query, p=page + 1) \
      if count > page * results_per_page else None
  prev_url = url_for('search', q=query, p=page - 1) \
      if page > 1 else None

  # what kind of output are we looking for?
  if format == 'hostlist':
    return render_template("hostlist.html",query=query, numresults=count, page=page, hosts=context)
  if format == 'json':
    response = render_template("json.html",query=query, numresults=count, page=page, hosts=context)
    response.headers.add('Access-Control-Allow-Origin', '*')
    return response
  return render_template("search.html",query=query, numresults=count, page=page, hosts=context, next_url=next_url, prev_url=prev_url)

@app.route('/getwork')
def getwork():
  try:
    # masscan data required
    return str(nweb.getwork_elastic())
  except:
    print("[+] Masscan data not found.")
    return "ERROR"

@app.route('/submit',methods=['POST'])
def submit():

  data = request.get_json()

  print("!!! SUBMITING DATA")
  newhost={}
  newhost=json.loads(data)
  if 'submit_token' not in newhost:
    return "no submit token supplied"

  try:
    newhost['ip'] = get_ip(newhost['nmap_data'])
    newhost['hostname'] = get_hostname(newhost['nmap_data'])
    newhost['ports'] = str(get_ports(newhost['nmap_data']))
    newhost['timestamp'] = datetime.now()
  except Exception as e:
    return "[!] Couldn't find necessary data: "+str(e)

  if len(newhost['ports']) == 2: # this is a string []
    return "[!] No open ports found!"
  
  if len(newhost['ports']) > 500:
    return "[!] More than 500 ports found. This is probably an IDS/IPS. We're going to throw the data out."

  try:
    print("[+] nmap successful and submitted for ip: "+str(newhost['ip'])+"\nhostname: "+str(newhost['hostname'])+"\nports: "+str(newhost['ports']))    

    print("submit token is "+str(newhost['submit_token']))
    newhost['user']=users.bump_user(str(newhost['submit_token']))
    del newhost['submit_token'] # make sure not to leak the submit tokens (anymore)

    nweb.newhost(newhost)

  except Exception as e:
    print("[EE] BAD SUBMISSION ERROR!!")
    print(e.__traceback__.tb_lineno)
    print(e)
    return "[-] bad submission data : "+str(e)

  #return str(newhost)
  return "[+] nmap successful and submitted for ip: "+str(newhost['ip'])+"\nhostname: "+str(newhost['hostname'])+"\nports: "+str(newhost['ports'])

@app.route('/leaderboard')
#@jwt_required
def nweb_leaderboard():
  try:
    theleaders = users.get_leaders()
  except Exception as e:
    return "SERVER DEAD"
  return render_template("leaderboard.html",leaders=theleaders)

@app.route('/authtest')
@jwt_required
def authtest():
  try:
    current_user = get_jwt_identity()
    print("+++ CURRENT USER: "+current_user)
  except Exception as e:
    return "SERVER DEAD"
  return ("HELLO "+current_user)


# Metamask stuff

# custom hook to ensure user gets logged out if jwt fails
@jwt.invalid_token_loader
def invalid_token_loader(msg):
  #resp = jsonify({'msg': msg})
  resp = redirect('/login', code=302)
  print("[EE] TOKEN INVALID, DELETING COOKIES "+str(msg))
  unset_jwt_cookies(resp) # this usually doesn't happen for some reason
  return resp

# custom hook to ensure user gets logged out if jwt fails
@jwt.expired_token_loader
def expired_token_loader(msg):
  #resp = jsonify({'msg': 'Token has expired'})
  resp = redirect('/login', code=302)
  print("[EE] TOKEN EXPIRED, DELETING COOKIES")
  unset_jwt_cookies(resp) # this usually doesn't happen for some reason
  return resp

# custom hook to ensure user gets logged out if jwt fails
@jwt.unauthorized_loader
def unauthorized_loader(msg):
  resp = jsonify({'msg': msg})
  #unset_jwt_cookies(resp) # this usually doesn't happen for some reason
  #return resp,401
  return redirect('/login')

@app.route('/login',methods=['GET', 'POST'])
@jwt_optional
def login():
    if request.method == 'GET':
      current_user = get_jwt_identity()
      if not current_user:
        return render_template("login.html", user="None")

      submit_token = users.get_token(current_user)
      return render_template("login.html", user=str(current_user),submit_token=submit_token)

    print("[+] creating session")

    print("info: "+(str(request.json)))

    public_address = request.json[0]
    signature = request.json[1]

    if app.debug == True:
      domain = "127.0.0.1"
    else:
      domain = "nweb.io"
    
    rightnow = int(time.time())
    sortanow = rightnow-rightnow%600

    original_message = 'Signing in to {} at {}'.format(domain,sortanow)
    print("[+] checking: "+original_message)
    message_hash = defunct_hash_message(text=original_message)
    print("[I] w3 is "+str(w3))
    signer = w3.eth.account.recoverHash(message_hash, signature=signature)
    print("[+] fascinating")

    if signer == public_address:
      print("[+] this is fine "+str(signer))
       # account.nonce = account.generate_nonce()
       # db.session.commit()
    else:
        abort(401, 'could not authenticate signature')

    print("[+] OMG looks good")

    access_token = create_access_token(identity=public_address)

    resp = jsonify({'login': True})
    set_access_cookies(resp, access_token)
    return resp, 200

