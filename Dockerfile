FROM golang:1.20 AS build

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
RUN go build -v .

# Build the Wallet frontend (HTML5, CSS, JavaScript). We use a pure Go solution based on esbuild.
# RUN ./vcdemo build

# *** Stage for JavaScript code
FROM node:18.18 as buildfront


COPY ./front /app/front
COPY ./data /app/data
COPY --from=build /app/vcdemo /app/vcdemo

# Install Javascript dependencies
WORKDIR /app/front
RUN npm install

# Build the Wallet frontend (HTML5, CSS, JavaScript). We use a pure Go solution based on esbuild.
WORKDIR /app
RUN /app/vcdemo build

# *** Final stage
FROM gcr.io/distroless/base-debian12

WORKDIR /app
COPY --from=build /app/back/views /app/back/views
COPY --from=build /app/back/www /app/back/www


# COPY --from=build /app/data/config /app/data/config/
# COPY --from=build /app/data/credential_templates /app/data/credential_templates/
# COPY --from=build /app/data/example_data /app/data/example_data/
# COPY --from=build /app/data/storage /app/data/storage/

COPY --from=buildfront /app/www /app/www/

COPY --from=build /app/vcdemo /app/vcdemo

ENTRYPOINT ["/app/vcdemo"]