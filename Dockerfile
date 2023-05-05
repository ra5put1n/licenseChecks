FROM node:18

WORKDIR /usr/src/app

RUN apt-get -y update && \
    apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && \
    echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian \
    $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && \
    apt-get -y update && \
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

COPY package*.json ./
RUN npm install
COPY . .
#RUN chmod -R a+rwx index.js

ENTRYPOINT [ "node", "main.js" ]