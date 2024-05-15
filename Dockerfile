# Stage for building the golang app
FROM golang:1.21 AS buildgo

WORKDIR /app

# Pre-copy/cache go.mod for pre-downloading dependencies and only redownloading them in subsequent builds if they change
COPY go.mod go.sum ./
RUN go mod download && go mod verify

# Copy all the files from the source directory. This may not be the most efficient way but it is simple.
# We even copy the 'node_modules' directory for the web application.
# This is not a problem because we use Javascript only in the web browsers, so there is not any dependency
# on the operating system for the server.
COPY . .

# Generate the data model
RUN go generate ./ent

# Build the application binary in the current directory. Its name is 'vcdemo'.
RUN --mount=type=cache,target=/root/.cache/go-build \
    go build -v .

# Stage for JavaScript code
FROM node:18.18 as buildfront

# Copy all the files from the front directory and also the config dir.
COPY ./front /app/front
COPY ./data /app/data

# Copy the vcdemo binary from its build stage
COPY --from=buildgo /app/vcdemo /app/vcdemo

# Install Javascript dependencies
WORKDIR /app/front
RUN npm install

# Build the Wallet frontend (HTML5, CSS, JavaScript). We use a pure Go solution based on esbuild.
WORKDIR /app
RUN /app/vcdemo build

# Final stage with a minimal image, copying artifacts from the previous build stages
FROM gcr.io/distroless/base-debian12

WORKDIR /app

# Copy the frontend built in previous stage
COPY --from=buildfront /app/www /app/www/

# Copy vcdemo binary and backend HTML resources from go build stage 
COPY --from=buildgo /app/back/views /app/back/views
COPY --from=buildgo /app/back/www /app/back/www
COPY --from=buildgo /app/vcdemo /app/vcdemo

# Run the image as a binary without parameters
ENTRYPOINT ["/app/vcdemo"]