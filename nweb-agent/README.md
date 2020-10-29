# Edit agent_env to include you nweb.io submit_token
# Build/run Docker nweb-agent image
sudo docker build -t nweb-agent .
sudo docker run --env-file agent_env -it nweb-agent

# To access the /bin/bash in the nweb-agent image run this dokcer command instead
sudo docker run --env-file agent_env -it --entrypoint /bin/bash nweb-agent

# List running docker containers and ID#
sudo docker ps

# How to Kill run away agent containers
sudo docker kill CONTAINER_ID
