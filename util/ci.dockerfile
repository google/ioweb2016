# Copyright 2016 Google Inc. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#       http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.

# Docker environment for the webapp used in CI.
# For CI to pick it up, use the following build command:
# docker build --rm -t gcr.io/io-webapp-staging/ci-node4-go16 - < ci.dockerfile

FROM node:4

# docker-py seems to be needed by gcloud
RUN apt-get update && apt-get install -y --no-install-recommends \
		g++ gcc libc6-dev make \
		ca-certificates curl unzip python-pip \
		bzr git mercurial \
	&& rm -rf /var/lib/apt/lists/* \
	&& pip install docker-py \
	&& npm update -qq -g npm \
	&& npm install -qq -g gulp bower

# Go language
ENV GOLANG_VERSION 1.6
ENV GOLANG_DOWNLOAD_URL https://golang.org/dl/go$GOLANG_VERSION.linux-amd64.tar.gz
ENV GOLANG_DOWNLOAD_SHA256 5470eac05d273c74ff8bac7bef5bad0b5abbd1c4052efbdbc8db45332e836b0b
RUN curl -fsSL "$GOLANG_DOWNLOAD_URL" -o golang.tar.gz \
	&& echo "$GOLANG_DOWNLOAD_SHA256  golang.tar.gz" | sha256sum -c - \
	&& tar -C /usr/local -xzf golang.tar.gz \
	&& rm golang.tar.gz

# Google Cloud Platform gcloud tool
ENV CLOUDSDK_CORE_DISABLE_PROMPTS=1
ENV CLOUDSDK_PYTHON_SITEPACKAGES=1
ADD https://dl.google.com/dl/cloudsdk/release/google-cloud-sdk.tar.gz /gcloud.tar.gz
RUN mkdir /gcloud \
  && tar -xzf /gcloud.tar.gz --strip 1 -C /gcloud \
  && /gcloud/install.sh -q --path-update=false --command-completion=false \
  && rm -f /gcloud.tar.gz

# Standalone App Engine SDK for Go
RUN curl -sSLo /sdk.zip https://storage.googleapis.com/appengine-sdks/featured/go_appengine_sdk_linux_amd64-1.9.35.zip \
	&& unzip -q /sdk.zip \
	&& rm /sdk.zip

# Run environment
ENV GOPATH /go
ENV PATH $GOPATH/bin:/usr/local/go/bin:/go_appengine:/gcloud/bin:$PATH
RUN mkdir -p $GOPATH
WORKDIR /go
CMD ["/bin/bash"]
