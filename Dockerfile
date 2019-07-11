FROM node:8

    ENV CONFIG_FILE ${CONFIG_FILE}

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install GYP dependencies globally, will be used to code build other dependencies
RUN npm install -g --production node-gyp && \
    npm cache clean --force

# Install Gekko dependencies
COPY package.json .
RUN npm install --production && \
    npm install --production redis@0.10.0 talib@1.0.2 tulind@0.8.7 pg && \
    npm cache clean --force
# install Firebase CLI
##RUN npm install -g firebase-tools

# Install Gekko Broker dependencies
WORKDIR exchange
COPY exchange/package.json .
RUN npm install --production && \
    npm cache clean --force

WORKDIR ../plugins/firestore
RUN npm install --production && \
    npm cache clean --force
WORKDIR functions
RUN npm install --production && \
    npm cache clean --force
WORKDIR ../../../

# Install Gekko Broker dependencies
#WORKDIR plugins/firestore
#RUN npm run deploy
#WORKDIR ../../

# Bundle app source
COPY . /usr/src/app
#COPY ${GOOGLE_APPLICATION_CREDENTIALS} /usr/src/app/
#COPY ${CONFIG_FILE} /usr/src/app/

EXPOSE ${PORT}
RUN chmod +x /usr/src/app/docker-entrypoint.sh
COPY ./docker-entrypoint.sh /usr/src/app/entrypoint.sh
RUN sudo apt-get update || sudo apt-get install -y dos2unix
RUN dos2unix /usr/src/app/entrypoint.sh && sudo apt-get --purge remove -y dos2unix || rm -rf /var/lib/apt/lists/*

ENTRYPOINT ["/usr/src/app/entrypoint.sh"]

CMD ["--ui", "--config", "echo ${CONFIG_FILE}"]
