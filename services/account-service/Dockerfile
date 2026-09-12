FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY src/ ./src/
RUN npm install -g nodemon

EXPOSE 8082

CMD ["nodemon", "src/server.js"]