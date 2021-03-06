FROM ubuntu

RUN \
    apt-get update; \
    apt-get install -y \
    build-essential \
    curl; \
    rm -rf /var/lib/apt/lists/*

# setup nodejs
RUN curl -sL https://deb.nodesource.com/setup_8.x |  bash -
RUN apt-get install -y nodejs

# expose ports which are being used in this project
EXPOSE 3001
EXPOSE 3000

CMD /bin/bash
