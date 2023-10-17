# VCDemo

VCDemo includes in a single binary demo versions of Issuer, Verifier and Wallet (both same-device and cross-device flows).

This facilitates installation and allows to see how all components fit together and the protocol flows between them.

## Running with Docker

Clone the repository and move into it:

```
git clone git@github.com:evidenceledger/VCDemo.git
cd VCDemo
```

Build the image:

```
docker compose build
```

Create in batch the credentials specified in the file `data/example_data/employee_data.yaml`:

```
docker compose credentials
```

The demo can be reset (with no credentials) with:

```
docker compose cleandb
```

After some credentials have been created, you can start the server for the demo:

```
docker compose up
```

Or you can start the server in the background and it will run until you stop it with `docker compose down`:

```
docker compose up -d
```


## Running 'native': requirements

The backend is developed in `Go` (>=1.19) and the frontend requires `npm` (>=9.8).

## Installation

Clone the repository:

```
git clone git@github.com:evidenceledger/VCDemo.git
```

## Post-installation

When in the `front` subdirectory of the project root, install the `npm` required packages:

```
cd front
npm install
```

## Running

### First time and when the data model changes

The first time that you start the VCBackend you have to make sure the code for database access is consistent:

```
make datamodel
```

The above command has to be executed every time that you modify the database model in the application. No harm is done if you run the command more than needed.

### Creating example credentials

To generate some credentials for testing and demo, run:

```
make credentials
```

### Starting the system

To start VCBackend in development mode, type:

```
make serve
```

The above command builds the frontend using [esbuild](https://esbuild.github.io/) and starts the server.

### Resetting the system

The database system used in the demo is SQLite. There is one separate database for each component: Issuer, Verifier and Wallet.

To reset the system it is enough to delete the corresponding files.

The command:

```
make reset
```

deletes the database files and also creates sample credentials to have the demo ready to use.

# Configuration

The configuration file in `server.yaml` provides for some configuration of VCDemo. Below you can see an example configuration file.
In order to run the demo yourself, the minimum changes are related to the domain names that have to be accessible externally:

```yaml
server:
  listenAddress: "0.0.0.0:3000"
  staticDir: "back/www"
  templateDir: "back/views"
  environment: development
  loglevel: DEBUG
  walletProvisioning: "wallet.mycredential.eu"

issuer:
  id: HappyPets
  name: HappyPets
  password: ThePassword
  store:
    driverName: "sqlite3"
    dataSourceName: "file:data/storage/issuer.sqlite?mode=rwc&cache=shared&_fk=1"
  samedeviceWallet: "https://wallet.mycredential.eu"
  credentialTemplatesDir: "data/credential_templates"
  credentialInputDataFile: "data/example_data/employee_data.yaml"

verifier:
  id: PacketDelivery
  name: PacketDelivery
  password: ThePassword
  store:
    driverName: "sqlite3"
    dataSourceName: "file:data/storage/verifier.sqlite?mode=rwc&cache=shared&_fk=1"
  jwks_uri: "/.well-known/jwks_uri"
  authnPolicies: "data/config/authn_policies.py"
  protectedResource:
    url: "https://www.google.com"
  samedeviceWallet: "https://wallet.mycredential.eu"
  credentialTemplatesDir: "data/credential_templates"

  webauthn:
    RPDisplayName: "EvidenceLedger"
    RPID: "mycredential.eu"
    RPOrigin: "https://wallet.mycredential.eu"
    AuthenticatorAttachment: "platform"
    UserVerification: "required"
    ResidentKey: "required"
    AttestationConveyancePreference: "indirect"


wallet:
  store:
    driverName: "sqlite3"
    dataSourceName: "file:data/storage/wallet.sqlite?mode=rwc&cache=shared&_fk=1"

verifiableregistry:
  password: ThePassword
  store:
    driverName: "sqlite3"
    dataSourceName: "file:data/storage/verifiableregistry.sqlite?mode=rwc&cache=shared&_fk=1"
```
