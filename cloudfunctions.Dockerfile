FROM node:8

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install GYP dependencies globally, will be used to code build other dependencies
RUN npm install -g --production node-gyp && \
    npm cache clean --force

COPY plugins/firestore/functions/package.json .
RUN npm install --production && \
    npm cache clean --force

# Bundle app source
COPY plugins/firestore/functions /usr/src/app

RUN npm scripts deploy
