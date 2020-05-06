from sqlalchemy import Table, Column, Float, Integer, String, DateTime, MetaData, ForeignKey, func

from web3.auto import w3
from eth_account.messages import defunct_hash_message

from flask_jwt_extended import JWTManager, jwt_required, create_access_token, get_jwt_identity, set_access_cookies, jwt_optional, get_raw_jwt, unset_jwt_cookies

from ethhelper import *

app = Flask(__name__,static_url_path='/static')
app.jinja_env.add_extension('jinja2.ext.do')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///uploads.db'
db = SQLAlchemy(app)

# Setup the Flask-JWT-Extended extension
# log2(26^22) ~= 100 (pull at least 100 bits of entropy)
app.config['JWT_SECRET_KEY'] = ''.join(random.choice(string.ascii_lowercase) for i in range(22))
#app.config['JWT_SECRET_KEY'] = '12345'
app.config['JWT_TOKEN_LOCATION'] = ['cookies']
if app.debug == False:
  app.config['JWT_COOKIE_SECURE'] = True
#app.config['JWT_ACCESS_COOKIE_PATH'] = '/api/'
app.config['JWT_COOKIE_CSRF_PROTECT'] = True
app.config['JWT_CSRF_CHECK_FORM'] = True
jwt = JWTManager(app)

app.config['UPLOAD_FOLDER'] = 'uploads'

admins = ['0x7ab874Eeef0169ADA0d225E9801A3FfFfa26aAC3']

@app.before_first_request
def setup():
  print("[+] running setup")
  try:
    db.create_all()
    print("[+] created uploads db")
  except:
    print("[+] uploads db already exists")

# schema to track uploaded files
class Upload(db.Model):
  user = db.Column(db.String(80))
  status = db.Column(db.String(80))
  filename = db.Column(db.String(80), primary_key=True, nullable=False, unique=True)
  filesize = db.Column(Integer, default=0)
  lines = db.Column(Integer, default=0)
  pointsEarned = db.Column(Integer, default=0)
  pointsRewarded = db.Column(Integer, default=0)
  ctime = db.Column(DateTime, default=func.now())

# schema to track votes
class Votes(db.Model):
  filename = db.Column(db.String(80), primary_key=True, nullable=False, unique=True)
  user = db.Column(db.String(80), primary_key=True, nullable=False)
  support = db.Column(Integer)
  ctime = db.Column(DateTime, default=func.now())

@app.route('/')
def landing():
  return render_template("index.html")

@app.route('/getwork')
def getwork():
  work = {}
  work['type']='masscan'
  work['target']=random.randint(1,255); # be smarter some day
  return json.dumps(work)

@app.route('/submit',methods=['GET', 'POST'])
@jwt_required
def submit():
  if request.method == 'GET':
    return render_template("submit.html",csrf_token=(get_raw_jwt() or {}).get("csrf"))
  else:
    if 'file' not in request.files:
      return "where's the file?"

    file = request.files['file']
    # if user does not select file, browser also
    # submit an empty part without filename
    if file.filename == '':
      return "was that a file?"
    if file:
      filename = secure_filename(file.filename)
      if len(filename)>20:
        return "file name too long"

      filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

      # make sure this is a new file
      if os.path.exists(filepath):
        return "we already have that file"
      # save the file to disk
      file.save(filepath)
      # get the filesize
      filesize = os.path.getsize(filepath)
      # count the lines in the file
      linecount = 0
      f=open(filepath,"r",encoding="utf-8",errors='ignore')
      while True:
        bl=f.read(65535) # read in the file 64k at a time
        if not bl: break
        linecount += bl.count("\n") # count the newlines

      # extract user info from JWT
      current_user = get_jwt_identity()

      newupload = Upload()
      newupload.user = current_user
      newupload.filename = filename
      newupload.status = "NEW"
      newupload.filesize = filesize
      newupload.lines = linecount

      db.session.add(newupload)
      db.session.commit()
      #numtokens = tokencount(current_user)
      #if numtokens > 100:
      #  msg="The Galaxy is on Orion's Belt"
      #else:
      #  msg="You need more than 100 GST to view this message."
      return ("Thank you "+str(current_user))

@app.route('/data/')
def data():
  thefiles = []
  #for file in os.listdir('data'):
  for net in range(1,255):
    matches = glob.glob('data/'+str(net)+'-*')
    if len(matches)==0:
      continue

    file=matches[0].split('/')[1]
    thedate = datetime.fromtimestamp(int(os.path.getmtime('data/'+file)))
    thesize = os.path.getsize('data/'+file)
    nicesize = thesize
    if thesize>1024:
      nicesize=str(round(thesize/1024,2))+"K"
    if thesize>(1024*1024):
      nicesize=str(round(thesize/(1024*1024),2))+"M"
    thelines = round(os.path.getsize('data/'+file)/36) # approx char/line in masscan data
    thefiles.append({'name':file,'date':thedate,'size':nicesize,'lines':thelines})
  return render_template("data.html",files=thefiles)

@app.route('/uploads/')
@jwt_required
def uploads():
  thefiles = []
  #for file in os.listdir('data'):
  for upload in Upload.query.all(): # TODO maybe limit by date at some point?
    print("FOUND "+upload.filename)
    thedate = str(upload.ctime)
    #thedate = datetime.fromtimestamp(upload.ctime)
    thesize = upload.filesize
    nicesize = thesize
    if thesize>1024:
      nicesize=str(round(thesize/1024,2))+"K"
    if thesize>(1024*1024):
      nicesize=str(round(thesize/(1024*1024),2))+"M"
    thefiles.append({'user':upload.user,'name':upload.filename,'status':upload.status,'date':thedate,'size':nicesize,'lines':upload.lines})

  user = get_jwt_identity()

  return render_template("uploads.html",files=thefiles, admin=(user in admins))

@app.route('/data/<path:filename>')
def data_files(filename):
  # Add custom handling here.
  # Send a file download response.
  return send_from_directory('data', filename)

@app.route('/uploads/<path:filename>')
def upload_files(filename):
  # Add custom handling here.
  # Send a file download response.
  return send_from_directory('uploads', filename)

@app.route('/leaderboard')
#@jwt_required
def leaderboard():
  theleaders = {}
  for upload in Upload.query.filter_by(status="APPROVED").all(): # TODO maybe limit by date at some point?
    try:
      theleaders[upload.user]+=upload.pointsEarned
    except:
      theleaders[upload.user]=upload.pointsEarned

  #theleaders["potato"]=66
  #theleaders["tomato"]=33
  #theleaders["monster"]=99

  return render_template("leaderboard.html",leaders=theleaders)

# TODO LOL CSRF
@app.route('/approve')
@jwt_required
def approve_file():
  user = get_jwt_identity()
  if not user in admins:
    return "woah, admins only please!"
  filename = request.args.get('f')
  uploaded = Upload.query.filter_by(status="NEW").filter_by(filename=filename).first()
  if not uploaded:
    return "sorry, not seeing that file"
  uploaded.status="APPROVED"
  uploaded.pointsEarned=1
  db.session.commit()
  try:
    os.rename('uploads/'+filename,'data/'+filename)
  except:
    return "rename failed"
  return "okay, approved "+str(filename)

@app.route('/reject')
@jwt_required
def reject_file():
  user = get_jwt_identity()
  if not user in admins:
    return "woah, admins only please!"
  filename = request.args.get('f')
  uploaded = Upload.query.filter_by(status="NEW").filter_by(filename=filename).first()
  if not uploaded:
    return "sorry, not seeing that file"
  uploaded.status="REJECTED"
  db.session.commit()
  try:
    os.remove('uploads/'+filename)
  except:
    return "removal failed"
  return "okay, rejected "+str(filename)
 
# custom hook to ensure user gets logged out if jwt fails
@jwt.invalid_token_loader
def invalid_token_loader(msg):
  #resp = jsonify({'msg': msg})
  resp = redirect('/login', code=302)
  unset_jwt_cookies(resp) # this usually doesn't happen for some reason
  pprint(vars(resp))
  return resp

# custom hook to ensure user gets logged out if jwt fails
@jwt.expired_token_loader
def expired_token_loader(msg):
  #resp = jsonify({'msg': 'Token has expired'})
  resp = redirect('/login', code=302)
  unset_jwt_cookies(resp) # this usually doesn't happen for some reason
  pprint(vars(resp))
  return resp

# custom hook to ensure user gets logged out if jwt fails
@jwt.unauthorized_loader
def unauthorized_loader(msg):
  resp = jsonify({'msg': msg})
  #unset_jwt_cookies(resp) # this usually doesn't happen for some reason
  #return resp,401
  return redirect('/login')

@app.route('/secret')
@jwt_required
def secret():
  current_user = get_jwt_identity()
  numtokens = tokencount(current_user)
  if numtokens > 100:
    msg="The Galaxy is on Orion's Belt"
  else:
    msg="You need more than 100 GST to view this message."
  return ("HELLO "+str(current_user)+" "+msg)

@app.route('/login', methods=['GET','POST'])
@jwt_optional
def login():
    if request.method == 'GET':
      return render_template("login.html",csrf_token=(get_raw_jwt() or {}).get("csrf"), user=str(get_jwt_identity()))

    print("[+] creating session")

    print("info: "+(str(request.json)))

    public_address = request.json[0]
    signature = request.json[1]

    if app.debug == True:
      domain = "127.0.0.1"
    else:
      domain = "masspull.org"
    
    rightnow = int(time.time())
    sortanow = rightnow-rightnow%600

    original_message = 'Signing in to {} at {}'.format(domain,sortanow)
    print("[+] checking: "+original_message)
    message_hash = defunct_hash_message(text=original_message)
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

