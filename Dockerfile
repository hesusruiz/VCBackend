FROM golang:1.20 AS build

WORKDIR /app

# pre-copy/cache go.mod for pre-downloading dependencies and only redownloading them in subsequent builds if they change
COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY . .
RUN go generate ./ent
RUN go build -v .

# Build the Wallet frontend (HTML5, CSS, JavaScript)
RUN ./vcdemo build

# Erase any pre-existing databases
RUN ./vcdemo cleandb

# Create example credentials
RUN ./vcdemo credentials

FROM golang:1.20

WORKDIR /app
COPY --from=build /app/back/views /app/back/views
COPY --from=build /app/back/www /app/back/www


COPY --from=build /app/data/config /app/data/config/
COPY --from=build /app/data/credential_templates /app/data/credential_templates/
COPY --from=build /app/data/example_data /app/data/example_data/
COPY --from=build /app/data/storage /app/data/storage/

COPY --from=build /app/wallet/www /app/wallet/www/

COPY --from=build /app/vcdemo /app/vcdemo

CMD ["./vcdemo"]