from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import Table, Column, Float, Integer, String, DateTime, MetaData, ForeignKey, func
import os
import random

db=SQLAlchemy()

class Users(db.Model):
  address = db.Column(db.String(80), primary_key=True, unique=True)
  submit_token = db.Column(db.String(80))
  points_earned = db.Column(Integer, default=0)
  points_rewarded = db.Column(Integer, default=0)
  ctime = db.Column(DateTime, default=func.now())

def setup(app):
  print('!!! SETTING UP THE APP')
  try:
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ['HEROKU_POSTGRESQL_COBALT_URL']
    app.config['SQLALCHEMY_POOL_SIZE'] = 1
    app.config['SQLALCHEMY_MAX_OVERFLOW'] = 4
    #app.config['SQLALCHEMY_DATABASE_URI'] = os.environ['DATABASE_URL']
  except Exception as e:
    print("[-] DBURI invalid "+str(e))

  db = SQLAlchemy(app)

def init():
  db.create_all()

def bump_user(submit_token):
  print("!!! SUBMITTING TOKEN "+submit_token)
  try: 
    thisuser = Users.query.filter_by(submit_token=submit_token).first()
  except Exception as e:
    print("!!! WOAH "+str(e))
  print("!!! DID A THING "+submit_token)
  if not thisuser:
    print("!!! INVALID SUBMIT TOKEN "+submit_token)
    return "invalid submit token: '"+newhost['submit_token']+"'"
  print("!!! SEEMS LIKE A USER "+str(submit_token))
  print("!!! HELLO "+str(thisuser.address))
  thisuser.points_earned=thisuser.points_earned+1
  db.session.commit()
  return thisuser.address

def get_leaders():
  theleaders = {}
  for user in Users.query.all(): # TODO maybe limit by date at some point?
    theleaders[user.address]=user.points_earned

  return theleaders

def get_token(current_user):

  submit_token=""

  try:
    thisuser = Users.query.filter_by(address=current_user).first()
  except Exception as e:
    print("!!! user lookup failed "+str(e))
    thisuser = None

  if not thisuser:
    newuser = Users()
    newuser.address = current_user
    newuser.submit_token = ''.join(random.choice(string.ascii_lowercase) for i in range(22))
    submit_token = newuser.submit_token
    db.session.add(newuser)
    db.session.commit()
  else:
    submit_token = thisuser.submit_token

  return submit_token


