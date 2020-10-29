FROM python:3.6 as build

USER root

RUN export DEBIAN_FRONTEND=noninteractive \
	export BUILD_PKGS="unzip" \
	&& apt-get update \
	&& apt-get install --no-install-recommends -qy $BUILD_PKGS

COPY Pipfile .

RUN pip install pipenv requests

RUN PIPENV_VENV_IN_PROJECT=1 pipenv install --deploy \
	&& rm -rf Pipfile Pipfile.lock deployment

COPY . /opt/nweb/nweb-agent

WORKDIR /opt/nweb/nweb-agent

RUN python3 -m compileall .

FROM ubuntu:18.04

RUN export DEBIAN_FRONTEND=noninteractive \
	&& apt-get update \
	&& apt-get install --no-install-recommends -qy python3 python3-pkg-resources vncsnapshot wkhtmltopdf nmap vim

COPY --from=build /opt/nweb/nweb-agent /opt/nweb/nweb-agent
COPY --from=build /.venv/lib/python3.6/site-packages /usr/local/lib/python3.6/dist-packages
WORKDIR /opt/nweb/nweb-agent

RUN bash -c 'mkdir /opt/nweb/nweb-agent/data'

RUN chmod +x boot.sh
RUN chmod +x nweb_agent.py
RUN chmod +x getheadshot.py

USER root

CMD ["python3", "/opt/nweb/nweb_agent/nweb_agent.py", "$submit_token"]
ENTRYPOINT ["/opt/nweb/nweb-agent/boot.sh"]