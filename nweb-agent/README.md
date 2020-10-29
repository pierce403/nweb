nweb agent
===========

Edit agent_env to include your nweb.io submit_token

```
submit_token=REPLACE_ME
```

Building NWeb-agent Docker image
------------------------

```
sudo docker build -t nweb-agent .
```

Running NWeb-agent Docker

```
sudo docker run --env-file agent_env -it nweb-agent
```

To access the /bin/bash in the nweb-agent image run this dokcer command instead

```
sudo docker run --env-file agent_env -it --entrypoint /bin/bash nweb-agent
```

How to Kill run away agent containers
------------------------

List running docker containers and ID#
```
sudo docker ps
sudo docker kill CONTAINER_ID
```
