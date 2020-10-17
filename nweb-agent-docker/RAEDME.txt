Edit agent_env with your nweb.io submit_token
sudo docker build -t nweb-agent .
sudo docker run --env-file agent_env -it nweb-agent

#  To access the /bin/bash in the nweb-agent-container run this dokcer command instea
sudo docker run --env-file agent_env -it --entrypoint /bin/bash nweb-agent

# to list running docker containers and ID#
sudo docker ps

#How to Kill run away agent containers
sudo docker kill CONTAINER ID
